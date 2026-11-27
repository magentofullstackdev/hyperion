<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Quote\Api\Data\CartInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Extension\InvalidEntryException;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use Psr\Log\LoggerInterface;

/**
 * Generic checkout extensions and extra address fields, registered in
 * `etc/frontend/di.xml` as items of two arguments:
 *
 * - `extensions`, emitted as `hyperion.extensions`
 *   (`CheckoutExtensionConfig[]`). Item keys:
 *     module            asset id of a module whose default export receives
 *                       the extension API (`Vendor_Module::js/file.js`)
 *     internal, builtin first-party entries: a chunk of the checkout bundle
 *     required          Place Order waits for the module; a failed load
 *                       blocks the order
 *     slots             items of `slot` (a checkout slot name), `tag` and
 *                       `sort_order`: elements rendered in the slot outlets
 *                       before the module loads
 *     options, options_provider, phrases, api_version
 *   An item needs at least one of `module`, `builtin` and `slots`.
 * - `address_fields`, emitted as `hyperion.addressFields`
 *   (`Model\Checkout\AddressFields`).
 *
 * Validation follows `Model\Extension\EntryRules`: an unknown key is ignored
 * with a notice; an invalid or missing required key drops the entry (logged
 * once). A provider that throws drops its entry for that page (logged),
 * `SkipExtensionException` drops it silently.
 */
class ExtensionPool
{
    public const SLOT_NAMES = [
        'after-email',
        'after-shipping-address',
        'after-shipping-methods',
        'before-payment-methods',
        'after-agreements',
        'before-place-order',
        'summary-after-totals',
    ];

    private const KNOWN_KEYS = [
        'module', 'internal', 'builtin', 'required', 'slots', 'options', 'options_provider', 'phrases',
        'api_version',
    ];
    private const SLOT_KEYS = ['slot', 'tag', 'sort_order'];

    /** @var array<string, array<string, mixed>>|null validated static part, by name */
    private ?array $entries = null;

    /**
     * @param EntryRules $rules
     * @param AddressFields $addressFieldBuilder
     * @param LogOnce $logOnce
     * @param LoggerInterface $logger
     * @param array<string, mixed> $extensions
     * @param array<string, mixed> $address_fields the `address_fields` DI argument (the name is the contract)
     */
    public function __construct(
        private readonly EntryRules $rules,
        private readonly AddressFields $addressFieldBuilder,
        private readonly LogOnce $logOnce,
        private readonly LoggerInterface $logger,
        private readonly array $extensions = [],
        private readonly array $address_fields = []
    ) {
    }

    /**
     * Whether any valid extension entry is registered.
     *
     * @return bool
     */
    public function hasExtensions(): bool
    {
        return $this->getEntries() !== [];
    }

    /**
     * The extensions for a quote, in the `CheckoutExtensionConfig` shape, in registration order.
     *
     * `$staticOrigins` receives the static origins the module URLs use.
     *
     * @param CartInterface $quote
     * @param string[] $staticOrigins
     * @return array<int, array<string, mixed>>
     */
    public function buildExtensions(CartInterface $quote, array &$staticOrigins = []): array
    {
        $result = [];
        foreach ($this->getEntries() as $name => $entry) {
            $config = $this->buildOne($name, $entry, $quote, $staticOrigins);
            if ($config !== null) {
                $result[] = $config;
            }
        }
        $staticOrigins = array_values(array_unique($staticOrigins));
        return $result;
    }

    /**
     * The address fields in the `AddressFieldConfig` shape, sorted.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getAddressFields(): array
    {
        return $this->addressFieldBuilder->build($this->address_fields);
    }

    /**
     * The declared address field codes per target (`custom_attributes`, `extension_attributes`).
     *
     * @return array{custom_attributes: string[], extension_attributes: string[]}
     */
    public function getAddressFieldCodes(): array
    {
        return $this->addressFieldBuilder->codesByTarget($this->address_fields);
    }

    /**
     * The valid entries, by name, in registration order.
     *
     * @return array<string, array<string, mixed>>
     */
    public function getEntries(): array
    {
        if ($this->entries !== null) {
            return $this->entries;
        }
        $entries = [];
        foreach ($this->extensions as $name => $item) {
            $name = (string) $name;
            try {
                $entries[$name] = $this->validate($name, $item);
            } catch (InvalidEntryException $e) {
                $this->logOnce->error(
                    'Hyperion checkout: checkout extension "' . $name . '" dropped: ' . $e->getMessage(),
                    ['entry' => $name]
                );
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion checkout: checkout extension validation failed', [
                    'entry' => $name,
                    'exception' => $e,
                ]);
            }
        }
        return $this->entries = $entries;
    }

    /**
     * The static part of an item.
     *
     * @param string $name
     * @param mixed $item
     * @return array<string, mixed>
     * @throws InvalidEntryException
     */
    private function validate(string $name, mixed $item): array
    {
        if (!is_array($item)) {
            throw new InvalidEntryException('the item is not an array');
        }
        $this->rules->assertName($name);
        $this->rules->ignoreUnknownKeys(EntryRules::POOL_CHECKOUT, $name, $item, self::KNOWN_KEYS);
        $module = $this->rules->module($item);
        $internal = $this->rules->internal(EntryRules::POOL_CHECKOUT, $name, $item, $module);
        $builtin = $this->rules->builtin(EntryRules::POOL_CHECKOUT, $name, $item, $internal, $module);

        $slots = [];
        $declared = $item['slots'] ?? [];
        if (!is_array($declared)) {
            throw new InvalidEntryException('"slots" must be a list of slot, tag and sort_order items');
        }
        foreach ($declared as $slotName => $slot) {
            if (!is_array($slot)) {
                throw new InvalidEntryException('the slot item "' . $slotName . '" is not an array');
            }
            $this->rules->ignoreUnknownKeys(
                EntryRules::POOL_CHECKOUT,
                $name,
                $slot,
                self::SLOT_KEYS,
                'slot "' . $slotName . '"'
            );
            $slotId = $slot['slot'] ?? null;
            if (!is_string($slotId) || !in_array($slotId, self::SLOT_NAMES, true)) {
                throw new InvalidEntryException('unknown checkout slot in "' . $slotName . '"');
            }
            $slots[] = [
                'slot' => $slotId,
                'tag' => $this->rules->tag($slot['tag'] ?? null, $internal),
                'sortOrder' => (int) ($slot['sort_order'] ?? 0),
            ];
        }
        usort($slots, static fn (array $a, array $b): int => $a['sortOrder'] <=> $b['sortOrder']);

        if ($module === '' && $builtin === '' && $slots === []) {
            throw new InvalidEntryException('an entry needs a "module", a "builtin" or "slots"');
        }

        return [
            'module' => $module,
            'builtin' => $builtin,
            'api_version' => $this->rules->apiVersion($item),
            'required' => EntryRules::isTrue($item['required'] ?? false),
            'slots' => $slots,
            'options' => $this->rules->options($item),
            'options_provider' => $this->rules->className($item, 'options_provider'),
            'phrases' => $item['phrases'] ?? [],
        ];
    }

    /**
     * One entry for one quote, null when it is dropped for this page.
     *
     * @param string $name
     * @param array<string, mixed> $entry
     * @param CartInterface $quote
     * @param string[] $staticOrigins
     * @return array<string, mixed>|null
     */
    private function buildOne(string $name, array $entry, CartInterface $quote, array &$staticOrigins): ?array
    {
        $origin = null;
        try {
            $moduleUrl = $entry['module'] !== '' ? $this->rules->moduleUrl($entry['module'], $origin) : null;
            $options = $this->rules->resolveOptions($entry['options_provider'], $entry['options'], $quote);
        } catch (SkipExtensionException $e) {
            return null;
        } catch (InvalidEntryException $e) {
            $this->logOnce->error(
                'Hyperion checkout: checkout extension "' . $name . '" dropped: ' . $e->getMessage(),
                ['entry' => $name]
            );
            return null;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: a checkout extension provider failed, the entry is skipped', [
                'entry' => $name,
                'exception' => $e,
            ]);
            return null;
        }
        if ($origin !== null) {
            $staticOrigins[] = $origin;
        }

        return [
            'name' => $name,
            'moduleUrl' => $moduleUrl,
            'builtin' => $entry['builtin'] !== '' ? $entry['builtin'] : null,
            'apiVersion' => $entry['api_version'],
            'required' => $entry['required'],
            'slots' => $entry['slots'],
            'options' => (object) $options,
            'phrases' => (object) $this->rules->phrases(['phrases' => $entry['phrases']]),
        ];
    }
}

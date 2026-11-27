<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Shipping;

use Magento\Quote\Api\Data\CartInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Extension\InvalidEntryException;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use Psr\Log\LoggerInterface;

/**
 * Shipping extensions of the checkout (a pickup point picker, a delivery
 * slot), registered as items of the `extensions` argument in
 * `etc/frontend/di.xml` and emitted as `hyperion.shippingExtensions`.
 *
 * Item keys:
 *   match             `carrier` and / or `method`: an exact code, `*`, or a
 *                     regular expression between slashes (`/locker_\w+/`), which must match the whole value.
 *                     Omitted only for the slots `after-methods` and
 *                     `replaces-address`, where it means "always".
 *   slot              `below-method`, `after-methods` or `replaces-address`
 *   tag, module       the custom element and the asset id that defines it
 *                     (`Vendor_Module::js/file.js`)
 *   kit               reserved for the configurable kits of a later release:
 *                     an entry that uses it is dropped
 *   required          Place Order waits until the element reports valid
 *   sort_order        lower first
 *   options           static options of the element
 *   options_provider  class name of an ExtensionOptionsProviderInterface
 *   value_provider    class name of a ShippingExtensionValueProviderInterface
 *   phrases           English source strings the element translates
 *   api_version       major of the extension API the element was written for
 *   internal          first-party entries only: exempt from the tag prefixes
 *
 * Validation follows `Model\Extension\EntryRules`: an unknown key is ignored
 * with a notice; an invalid or missing required key drops the entry (logged
 * once). An invalid `match` drops the entry too: its default ("always")
 * would show the element for every method. A provider that throws drops its
 * entry for that page (logged), `SkipExtensionException` drops it silently.
 */
class ExtensionPool
{
    public const SLOT_BELOW_METHOD = 'below-method';
    public const SLOT_AFTER_METHODS = 'after-methods';
    public const SLOT_REPLACES_ADDRESS = 'replaces-address';
    public const SLOTS = [self::SLOT_BELOW_METHOD, self::SLOT_AFTER_METHODS, self::SLOT_REPLACES_ADDRESS];
    /** Slots an entry may fill without a `match`. */
    public const SLOTS_WITHOUT_MATCH = [self::SLOT_AFTER_METHODS, self::SLOT_REPLACES_ADDRESS];
    public const SUMMARY_MAX_LINES = 3;

    private const VALUE_KEYS = ['address', 'information', 'summary', 'state'];
    private const KNOWN_KEYS = [
        'match', 'slot', 'tag', 'module', 'kit', 'internal', 'required', 'sort_order', 'options',
        'options_provider', 'value_provider', 'phrases', 'api_version',
    ];

    /** @var array<string, array<string, mixed>>|null validated static part, by name */
    private ?array $entries = null;

    /**
     * @param EntryRules $rules
     * @param LogOnce $logOnce
     * @param LoggerInterface $logger
     * @param array<string, mixed> $extensions
     */
    public function __construct(
        private readonly EntryRules $rules,
        private readonly LogOnce $logOnce,
        private readonly LoggerInterface $logger,
        private readonly array $extensions = []
    ) {
    }

    /**
     * Whether any valid entry is registered.
     *
     * @return bool
     */
    public function hasEntries(): bool
    {
        return $this->getEntries() !== [];
    }

    /**
     * The entries for a quote, in the `ShippingExtensionConfig` shape, sorted.
     *
     * `$staticOrigins` receives the static origins the module URLs use.
     *
     * @param CartInterface $quote
     * @param string[] $staticOrigins
     * @return array<int, array<string, mixed>>
     */
    public function build(CartInterface $quote, array &$staticOrigins = []): array
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
     * The valid entries, sorted by sort order then name.
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
                    'Hyperion checkout: shipping extension "' . $name . '" dropped: ' . $e->getMessage(),
                    ['entry' => $name]
                );
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion checkout: shipping extension validation failed', [
                    'entry' => $name,
                    'exception' => $e,
                ]);
            }
        }
        uksort($entries, static function (string $a, string $b) use ($entries): int {
            return [$entries[$a]['sort_order'], $a] <=> [$entries[$b]['sort_order'], $b];
        });
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
        $this->rules->ignoreUnknownKeys(EntryRules::POOL_SHIPPING, $name, $item, self::KNOWN_KEYS);

        $module = $this->rules->module($item);
        $hasKit = isset($item['kit']) && $item['kit'] !== '' && $item['kit'] !== null;
        $hasTag = isset($item['tag']) && $item['tag'] !== '';
        if ($hasKit && ($module !== '' || $hasTag)) {
            throw new InvalidEntryException('an entry declares either "kit" or "module" and "tag", not both');
        }
        if ($hasKit) {
            throw new InvalidEntryException('kits are not available in this version');
        }
        if ($module === '' || !$hasTag) {
            throw new InvalidEntryException('"module" and "tag" are required');
        }
        $internal = $this->rules->internal(EntryRules::POOL_SHIPPING, $name, $item, $module);
        $tag = $this->rules->tag($item['tag'], $internal);

        $slot = isset($item['slot']) && is_string($item['slot']) ? $item['slot'] : '';
        if (!in_array($slot, self::SLOTS, true)) {
            throw new InvalidEntryException('the slot must be one of ' . implode(', ', self::SLOTS));
        }
        $match = $this->match($item['match'] ?? null);
        if ($match === null && !in_array($slot, self::SLOTS_WITHOUT_MATCH, true)) {
            throw new InvalidEntryException('the slot "' . $slot . '" needs a "match"');
        }

        return [
            'match' => $match,
            'slot' => $slot,
            'tag' => $tag,
            'module' => $module,
            'api_version' => $this->rules->apiVersion($item),
            'required' => EntryRules::isTrue($item['required'] ?? false),
            'sort_order' => (int) ($item['sort_order'] ?? 0),
            'options' => $this->rules->options($item),
            'options_provider' => $this->rules->className($item, 'options_provider'),
            'value_provider' => $this->rules->className($item, 'value_provider'),
            'phrases' => $item['phrases'] ?? [],
        ];
    }

    /**
     * The normalized `match`, null when the item has none.
     *
     * @param mixed $match
     * @return array{carrier: string|null, method: string|null}|null
     * @throws InvalidEntryException
     */
    private function match(mixed $match): ?array
    {
        if ($match === null || $match === [] || $match === '') {
            return null;
        }
        if (!is_array($match)) {
            throw new InvalidEntryException('"match" must be an array with "carrier" and / or "method"');
        }
        $parts = [];
        foreach (['carrier', 'method'] as $key) {
            $rule = $match[$key] ?? null;
            if ($rule === null || $rule === '') {
                $parts[$key] = null;
                continue;
            }
            if (!is_string($rule)) {
                throw new InvalidEntryException('"match.' . $key . '" must be a string');
            }
            $rule = trim($rule);
            if (strlen($rule) > 2 && str_starts_with($rule, '/') && str_ends_with($rule, '/')) {
                if (!$this->rules->isValidPattern(substr($rule, 1, -1))) {
                    throw new InvalidEntryException('"match.' . $key . '" is not a valid regular expression');
                }
            } elseif ($rule !== '*' && !preg_match('/^[A-Za-z0-9_\-.]+$/', $rule)) {
                throw new InvalidEntryException(
                    '"match.' . $key . '" must be a code, "*" or a regular expression between slashes'
                );
            }
            $parts[$key] = $rule;
        }
        if ($parts['carrier'] === null && $parts['method'] === null) {
            throw new InvalidEntryException('"match" must name a "carrier" or a "method"');
        }
        return $parts;
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
        try {
            $origin = null;
            $moduleUrl = $this->rules->moduleUrl($entry['module'], $origin);
            $options = $this->rules->resolveOptions($entry['options_provider'], $entry['options'], $quote);
            $value = $this->value($this->rules->resolveValue($entry['value_provider'], $quote));
        } catch (SkipExtensionException $e) {
            return null;
        } catch (InvalidEntryException $e) {
            $this->logOnce->error(
                'Hyperion checkout: shipping extension "' . $name . '" dropped: ' . $e->getMessage(),
                ['entry' => $name]
            );
            return null;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: a shipping extension provider failed, the entry is skipped', [
                'entry' => $name,
                'exception' => $e,
            ]);
            return null;
        }
        if ($origin !== null) {
            $staticOrigins[] = $origin;
        }

        return [
            'id' => $name,
            'match' => $entry['match'],
            'slot' => $entry['slot'],
            'tag' => $entry['tag'],
            'moduleUrl' => $moduleUrl,
            'kit' => null,
            'apiVersion' => $entry['api_version'],
            'required' => $entry['required'],
            'sortOrder' => $entry['sort_order'],
            'options' => (object) $options,
            'phrases' => (object) $this->rules->phrases(['phrases' => $entry['phrases']]),
            'value' => $value,
        ];
    }

    /**
     * The value a provider returned, reduced to the keys of `ShippingExtensionValue`.
     *
     * @param array<string, mixed>|null $value
     * @return array<string, mixed>|null
     * @throws InvalidEntryException
     */
    private function value(?array $value): ?array
    {
        if ($value === null) {
            return null;
        }
        $value = array_intersect_key($value, array_flip(self::VALUE_KEYS));
        foreach (['address', 'information'] as $key) {
            if (isset($value[$key]) && !is_array($value[$key])) {
                throw new InvalidEntryException('the value "' . $key . '" must be an object');
            }
        }
        if (isset($value['summary'])) {
            $summary = $value['summary'];
            if (!is_array($summary) || !is_string($summary['label'] ?? null)) {
                throw new InvalidEntryException('the value "summary" needs a "label"');
            }
            $lines = [];
            foreach ((array) ($summary['lines'] ?? []) as $line) {
                if (is_scalar($line)) {
                    $lines[] = (string) $line;
                }
            }
            $value['summary'] = [
                'label' => $summary['label'],
                'lines' => array_slice($lines, 0, self::SUMMARY_MAX_LINES),
            ];
        }
        return $value === [] ? null : $value;
    }
}

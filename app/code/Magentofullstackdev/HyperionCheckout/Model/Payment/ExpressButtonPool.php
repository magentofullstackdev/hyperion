<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Framework\ObjectManagerInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExpressButtonProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Extension\InvalidEntryException;
use Magentofullstackdev\HyperionCheckout\Model\Payment\Express\ReservedHeightProviderInterface;

/**
 * The express buttons of the storefront (product page, cart, mini-cart, top
 * of the checkout), registered as items of the `buttons` argument in
 * `etc/frontend/di.xml` and printed by `<hyperion-express-slot>`.
 *
 * Item keys:
 *   placements       list of `product`, `cart`, `minicart`, `checkout-top`
 *   tag              custom element the module defines
 *   module           asset id `Vendor_Module::path.js` (or, first-party only,
 *                    `internal` true plus `builtin`, a chunk of the theme)
 *   reserved_height  px the button occupies once rendered, 24 to 200
 *   sort_order       position in the express slot, lowest first
 *   provider         optional class name of an ExpressButtonProviderInterface
 *   options          static options of the element
 *   phrases          English source strings (item values, `translate="true"`
 *                    so the phrase collector finds them); emitted as
 *                    English source => translation in the locale of the
 *                    request
 *   redirect_hosts   bare host names the element may send the shopper to
 *   api_version      major of the extension API the element was written for
 *   client_gate, max_buttons
 *                    reserved for a later release: accepted, ignored, one
 *                    notice
 *
 * The shared rules of the extension pools (`Model\Extension\EntryRules`)
 * apply: an unknown key is ignored with one notice, an invalid required
 * value drops the entry with one error line (once per configuration cache
 * lifetime), `internal` is honored only for first-party entries. A provider
 * that throws drops its entry for that render; `SkipExtensionException`
 * drops it silently. Nothing here ever breaks the page. Class names are
 * strings resolved when a slot renders, so a broken third-party class only
 * costs its own button.
 */
class ExpressButtonPool
{
    public const PLACEMENT_PRODUCT = 'product';
    public const PLACEMENT_CART = 'cart';
    public const PLACEMENT_MINICART = 'minicart';
    public const PLACEMENT_CHECKOUT_TOP = 'checkout-top';
    public const PLACEMENTS = [
        self::PLACEMENT_PRODUCT,
        self::PLACEMENT_CART,
        self::PLACEMENT_MINICART,
        self::PLACEMENT_CHECKOUT_TOP,
    ];
    public const MIN_HEIGHT = 24;
    public const MAX_HEIGHT = 200;

    public const KNOWN_KEYS = [
        'placements', 'tag', 'module', 'builtin', 'internal', 'reserved_height', 'sort_order', 'provider',
        'options', 'phrases', 'redirect_hosts', 'api_version', 'client_gate', 'max_buttons',
    ];

    private const HOST_PATTERN = '/^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/';
    /** Keys kept for later releases: accepted, ignored, reported once. */
    private const RESERVED_KEYS = ['client_gate', 'max_buttons'];

    /**
     * @var array<string, array<string, mixed>>|null validated static part, by name
     */
    private ?array $entries = null;

    /**
     * @param EntryRules $rules
     * @param LogOnce $log
     * @param ObjectManagerInterface $objectManager
     * @param array<string, mixed> $buttons
     */
    public function __construct(
        private readonly EntryRules $rules,
        private readonly LogOnce $log,
        private readonly ObjectManagerInterface $objectManager,
        private readonly array $buttons = []
    ) {
    }

    /**
     * The buttons of a placement, sorted, in the shape `<hyperion-express-slot>` reads
     * (`ExpressButtonConfig`: id, tag, moduleUrl, builtin, apiVersion, reservedHeight,
     * sortOrder, options, phrases, redirectHosts).
     *
     * @param string $placement
     * @param ProductInterface|null $product the current product, product placement only
     * @return array<int, array<string, mixed>>
     */
    public function getButtons(string $placement, ?ProductInterface $product = null): array
    {
        if (!in_array($placement, self::PLACEMENTS, true)) {
            return [];
        }
        $product = $placement === self::PLACEMENT_PRODUCT ? $product : null;

        $buttons = [];
        foreach ($this->getEntries() as $name => $entry) {
            if (!in_array($placement, $entry['placements'], true)) {
                continue;
            }
            $button = $this->build($name, $entry, $placement, $product);
            if ($button !== null) {
                $buttons[] = $button;
            }
        }

        return $buttons;
    }

    /**
     * The valid entries, sorted by sort order then name.
     *
     * @return array<string, array<string, mixed>>
     */
    private function getEntries(): array
    {
        if ($this->entries !== null) {
            return $this->entries;
        }

        $entries = [];
        foreach ($this->buttons as $name => $item) {
            $name = (string) $name;
            try {
                $entries[$name] = $this->validate($name, $item);
            } catch (InvalidEntryException $e) {
                $this->drop($name, $e->getMessage());
            } catch (\Throwable $e) {
                $this->log->error('Hyperion checkout: express button "' . $name . '" dropped: validation failed.', [
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
     * @throws InvalidEntryException when the entry must be dropped
     */
    private function validate(string $name, mixed $item): array
    {
        if (!is_array($item)) {
            throw new InvalidEntryException('the item is not an array');
        }
        $this->rules->assertName($name);
        $this->rules->ignoreUnknownKeys(EntryRules::POOL_EXPRESS, $name, $item, self::KNOWN_KEYS);
        foreach (self::RESERVED_KEYS as $key) {
            if (array_key_exists($key, $item)) {
                $this->log->notice(sprintf(
                    'Hyperion checkout: express button "%s": the key "%s" is reserved for a later release and ignored.',
                    $name,
                    $key
                ));
            }
        }

        $placements = [];
        foreach ((array) ($item['placements'] ?? []) as $placement) {
            if (is_string($placement) && in_array($placement, self::PLACEMENTS, true)) {
                $placements[] = $placement;
            } else {
                $this->log->notice(sprintf(
                    'Hyperion checkout: express button "%s": unknown placement "%s" ignored.',
                    $name,
                    is_scalar($placement) ? (string) $placement : ''
                ));
            }
        }
        if ($placements === []) {
            throw new InvalidEntryException('no valid placement');
        }

        $module = $this->rules->module($item);
        $internal = $this->rules->internal(EntryRules::POOL_EXPRESS, $name, $item, $module);
        $builtin = $this->rules->builtin(EntryRules::POOL_EXPRESS, $name, $item, $internal, $module);
        if (($module === '') === ($builtin === '')) {
            throw new InvalidEntryException('exactly one of "module" and "builtin" is required');
        }
        $tag = $this->rules->tag($item['tag'] ?? null, $internal);
        $apiVersion = $this->rules->apiVersion($item);

        $height = filter_var($item['reserved_height'] ?? null, FILTER_VALIDATE_INT);
        if ($height === false || $height < self::MIN_HEIGHT || $height > self::MAX_HEIGHT) {
            throw new InvalidEntryException(
                'reserved_height must be an integer from ' . self::MIN_HEIGHT . ' to ' . self::MAX_HEIGHT
            );
        }

        $hosts = [];
        foreach ((array) ($item['redirect_hosts'] ?? []) as $host) {
            if (!is_string($host) || !preg_match(self::HOST_PATTERN, $host)) {
                throw new InvalidEntryException('redirect_hosts must be bare lower case host names');
            }
            $hosts[] = $host;
        }

        return [
            'placements' => $placements,
            'tag' => $tag,
            'module' => $module,
            'builtin' => $builtin,
            'api_version' => $apiVersion,
            'reserved_height' => $height,
            'sort_order' => (int) ($item['sort_order'] ?? 0),
            'provider' => $this->rules->className($item, 'provider'),
            'options' => $this->rules->options($item),
            'phrases' => ['phrases' => (array) ($item['phrases'] ?? [])],
            'redirect_hosts' => array_values(array_unique($hosts)),
        ];
    }

    /**
     * One button for one render, null when its provider declines, skips or fails, or its module URL is refused.
     *
     * @param string $name
     * @param array<string, mixed> $entry
     * @param string $placement
     * @param ProductInterface|null $product
     * @return array<string, mixed>|null
     */
    private function build(string $name, array $entry, string $placement, ?ProductInterface $product): ?array
    {
        $moduleUrl = null;
        if ($entry['module'] !== '') {
            try {
                $moduleUrl = $this->rules->moduleUrl($entry['module']);
            } catch (InvalidEntryException $e) {
                $this->drop($name, $e->getMessage());
                return null;
            }
        }

        $options = $entry['options'];
        $height = $entry['reserved_height'];
        if ($entry['provider'] !== '') {
            try {
                $provider = $this->objectManager->get($entry['provider']);
                if (!$provider instanceof ExpressButtonProviderInterface) {
                    $this->drop($name, '"' . $entry['provider'] . '" does not implement '
                        . ExpressButtonProviderInterface::class);
                    return null;
                }
                if (!$provider->isAvailable($placement, $product)) {
                    return null;
                }
                $options = array_replace($options, $provider->getOptions($placement, $product));
                if ($provider instanceof ReservedHeightProviderInterface) {
                    $height = max(
                        self::MIN_HEIGHT,
                        min(self::MAX_HEIGHT, $provider->getReservedHeight($placement, $options))
                    );
                }
            } catch (SkipExtensionException $e) {
                return null;
            } catch (\Throwable $e) {
                $this->log->error(sprintf(
                    'Hyperion checkout: express button "%s" skipped on the %s placement: the provider failed (%s).',
                    $name,
                    $placement,
                    $e->getMessage()
                ), ['exception' => $e]);
                return null;
            }
        }

        return [
            'id' => $name,
            'tag' => $entry['tag'],
            'moduleUrl' => $moduleUrl,
            'builtin' => $entry['builtin'] !== '' ? $entry['builtin'] : null,
            'apiVersion' => $entry['api_version'],
            'reservedHeight' => $height,
            'sortOrder' => $entry['sort_order'],
            'options' => $options,
            'phrases' => $this->rules->phrases($entry['phrases']),
            'redirectHosts' => $entry['redirect_hosts'],
        ];
    }

    /**
     * Log, once, why an entry is dropped.
     *
     * @param string $name
     * @param string $reason
     * @return void
     */
    private function drop(string $name, string $reason): void
    {
        $this->log->error(sprintf('Hyperion checkout: express button "%s" dropped: %s.', $name, $reason));
    }
}

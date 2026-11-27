<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Extension;

use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\ShippingExtensionValueProviderInterface;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;

/**
 * The one set of registration rules of the checkout extension pools
 * (payment renderers, shipping extensions, generic checkout extensions,
 * address fields; the express buttons follow the same rules).
 *
 * - An item key a pool does not know is ignored with one `notice` (item
 *   name and key, once per cache lifetime); the entry stays valid.
 * - An entry is dropped only for an invalid or missing required key or an
 *   unsupported API version: the check throws `InvalidEntryException` with
 *   the reason and the pool logs it once.
 * - An invalid optional value is refused with one `error` line and its
 *   default applies (for example `internal` claimed by a foreign module).
 * - `api_version` (default "1"): accepted when its major is 1, whatever
 *   follows a `.` or `-` ("1", "1.2", "1-beta", "1.0-beta").
 * - `internal` is honored for an entry whose `module` belongs to a Hyperion
 *   module, or which names a `builtin` of the closed first-party list of its
 *   pool (`BUILTINS`, the chunks the checkout bundle registers). A DI item
 *   does not record which module declared it, so a third-party item can
 *   claim `internal` with a first-party `builtin`; it then only renders
 *   that first-party element, which grants it nothing.
 * - Patterns are regular expressions without delimiters that both PCRE
 *   and the browser's `RegExp` compile, matched against the WHOLE value
 *   (`matchesWhole()`), as the browser does.
 * - Module URLs are built for the scheme of the current request, so they
 *   share the page's origin (the browser refuses a module from another
 *   origin than the page's or the static one).
 *
 * Class names are strings resolved only when an entry is emitted and
 * checked with `instanceof`, so one broken third-party class costs its own
 * entry, never the page. `SkipExtensionException` from a provider means
 * "not for this page": every pool drops the entry without a log line.
 */
class EntryRules
{
    public const SUPPORTED_API_MAJOR = 1;
    public const FIRST_PARTY_MODULE_PREFIX = 'Magentofullstackdev_Hyperion';

    public const POOL_PAYMENT = 'payment renderer';
    public const POOL_SHIPPING = 'shipping extension';
    public const POOL_CHECKOUT = 'checkout extension';
    public const POOL_EXPRESS = 'express button';
    public const POOL_ADDRESS_FIELD = 'address field';

    /**
     * The first-party chunks the checkout bundle and the theme register, per
     * pool: `registerBuiltinModule()` in
     * `frontend/packages/module-checkout/src/components/payment-host/mount.ts`
     * and `src/components/extensions/builtins.ts`; the express button of the
     * theme. A `builtin` outside its pool's list is refused.
     */
    public const BUILTINS = [
        self::POOL_PAYMENT => [
            'offline', 'braintree-card', 'braintree-paypal', 'braintree-googlepay', 'braintree-vault',
            'paypal-express',
        ],
        self::POOL_CHECKOUT => ['order-comment', 'newsletter-optin'],
        self::POOL_EXPRESS => ['hyperion-paypal-buttons'],
        self::POOL_SHIPPING => [],
    ];

    /** Tag prefixes the checkout and the theme own; honored `internal` entries are exempt. */
    public const RESERVED_TAG_PREFIXES = [
        'hyperion-', 'hc-', 'checkout-', 'payment-', 'shipping-', 'address-', 'order-',
        'summary-', 'place-', 'coupon-', 'loading-', 'error-',
    ];

    /**
     * Syntax PCRE accepts that the browser's `RegExp` refuses or reads
     * differently, as `[expression, description]`, tested on the pattern with
     * its escaped characters and its character classes masked.
     */
    private const JS_INCOMPATIBLE = [
        ['/[*+?}]\+/', 'a possessive quantifier'],
        ['/\{,[0-9]+\}/', 'a {,n} quantifier'],
        ['/\(\?>/', 'an atomic group'],
        ['/\(\?\|/', 'a branch reset group'],
        ['/\(\?\*/', 'a non-atomic lookaround'],
        ['/\(\?P/', 'a (?P...) named group'],
        ['/\(\?\'/', 'a (?\'name\') group'],
        ['/\(\?[R0-9&+\-]/', 'a recursion or subroutine call'],
        ['/\(\?\(/', 'a conditional group'],
        ['/\(\?#/', 'an inline comment'],
        ['/\(\?[a-zA-Z^]/', 'inline flags'],
        ['/\(\*[A-Za-z]/', 'a backtracking control verb or an alpha assertion'],
    ];

    /** Escapes with no meaning, or another meaning, in the browser's `RegExp` without flags. */
    private const JS_INCOMPATIBLE_ESCAPES = 'AzZGhHvVKRXQEepPgNoaC';

    private const NAME_PATTERN = '/^[a-z][a-z0-9_]*$/';
    private const TAG_PATTERN = '/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/';
    private const MODULE_PATTERN = '#^([A-Z][A-Za-z0-9]*_[A-Za-z0-9]+)::(?!.*\.\.)[A-Za-z0-9_\-./]+\.js$#';
    private const BUILTIN_PATTERN = '/^[a-z][a-z0-9-]*$/';
    private const API_VERSION_PATTERN = '/^([0-9]+)(?:[.\-][0-9A-Za-z.\-]*)?$/';
    /** Control character used as the delimiter, so a `/` or `#` in the expression needs no escaping. */
    private const DELIMITER = "\x01";

    /** @var array<string, string> resolved URL by asset id */
    private array $moduleUrls = [];

    /** @var string[]|null */
    private ?array $origins = null;

    /**
     * @param ObjectManagerInterface $objectManager
     * @param AssetRepository $assetRepository
     * @param StoreManagerInterface $storeManager
     * @param LogOnce $log
     */
    public function __construct(
        private readonly ObjectManagerInterface $objectManager,
        private readonly AssetRepository $assetRepository,
        private readonly StoreManagerInterface $storeManager,
        private readonly LogOnce $log
    ) {
    }

    /**
     * Logs one notice per key of `$item` that is not in `$known`; the entry stays valid.
     *
     * @param string $pool one of the POOL_* labels
     * @param string $name item name
     * @param array<mixed> $item
     * @param string[] $known
     * @param string|null $part a nested item (a form field, a slot), named in the line
     * @return void
     */
    public function ignoreUnknownKeys(string $pool, string $name, array $item, array $known, ?string $part = null): void
    {
        foreach (array_keys($item) as $key) {
            if (!in_array($key, $known, true)) {
                $this->log->notice(sprintf(
                    'Hyperion checkout: %s "%s"%s: the key "%s" is not known and is ignored.',
                    $pool,
                    $name,
                    $part === null ? '' : ', ' . $part,
                    (string) $key
                ));
            }
        }
    }

    /**
     * Logs one error for an invalid optional value whose default applies.
     *
     * @param string $pool
     * @param string $name
     * @param string $key
     * @param string|null $reason
     * @return void
     */
    public function invalidOptional(string $pool, string $name, string $key, ?string $reason = null): void
    {
        $this->log->error(sprintf(
            'Hyperion checkout: %s "%s": the value of "%s" is invalid%s, its default is used.',
            $pool,
            $name,
            $key,
            $reason === null ? '' : ' (' . $reason . ')'
        ));
    }

    /**
     * The item name is snake_case.
     *
     * @param string $name
     * @return void
     * @throws InvalidEntryException
     */
    public function assertName(string $name): void
    {
        if (!preg_match(self::NAME_PATTERN, $name)) {
            throw new InvalidEntryException('the item name must be snake_case');
        }
    }

    /**
     * Whether `$tag` is a custom element name outside the reserved prefixes (honored `internal` entries are exempt).
     *
     * @param string $tag
     * @param bool $internal
     * @return bool
     */
    public function isAllowedTag(string $tag, bool $internal): bool
    {
        if (!preg_match(self::TAG_PATTERN, $tag)) {
            return false;
        }
        if (!$internal) {
            foreach (self::RESERVED_TAG_PREFIXES as $prefix) {
                if (str_starts_with($tag, $prefix)) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * A valid, allowed tag.
     *
     * @param mixed $tag
     * @param bool $internal
     * @return string
     * @throws InvalidEntryException
     */
    public function tag(mixed $tag, bool $internal): string
    {
        $tag = is_string($tag) ? trim($tag) : '';
        if (!preg_match(self::TAG_PATTERN, $tag)) {
            throw new InvalidEntryException('the tag is not a valid custom element name');
        }
        if (!$this->isAllowedTag($tag, $internal)) {
            foreach (self::RESERVED_TAG_PREFIXES as $prefix) {
                if (str_starts_with($tag, $prefix)) {
                    throw new InvalidEntryException('the tag prefix "' . $prefix . '" is reserved');
                }
            }
        }
        return $tag;
    }

    /**
     * The `module` asset id, '' when the item has none.
     *
     * @param array<mixed> $item
     * @return string
     * @throws InvalidEntryException
     */
    public function module(array $item): string
    {
        $module = isset($item['module']) && is_string($item['module']) ? trim($item['module']) : '';
        if ($module !== '' && !preg_match(self::MODULE_PATTERN, $module)) {
            throw new InvalidEntryException(
                '"module" "' . $module . '" is not an asset id like Vendor_Module::js/file.js'
            );
        }
        return $module;
    }

    /**
     * The Magento module of an asset id (`Vendor_Module`), '' for an invalid one.
     *
     * @param string $module
     * @return string
     */
    public function moduleName(string $module): string
    {
        return preg_match(self::MODULE_PATTERN, $module, $found) ? $found[1] : '';
    }

    /**
     * The honored value of `internal`.
     *
     * True only for an entry whose `module` belongs to a Hyperion module, or
     * which has no `module` and names a first-party `builtin` of its pool.
     * Claimed by a foreign module, the key is refused (one error line) and
     * the entry is judged as a third-party one.
     *
     * @param string $pool
     * @param string $name
     * @param array<mixed> $item
     * @param string $module the validated asset id, '' when none
     * @return bool
     */
    public function internal(string $pool, string $name, array $item, string $module): bool
    {
        if (!self::isTrue($item['internal'] ?? false)) {
            return false;
        }
        if ($module !== '') {
            if (str_starts_with($this->moduleName($module), self::FIRST_PARTY_MODULE_PREFIX)) {
                return true;
            }
            $this->log->error(sprintf(
                'Hyperion checkout: %s "%s": "internal" is reserved to the Hyperion modules and is ignored.',
                $pool,
                $name
            ));
            return false;
        }
        $builtin = isset($item['builtin']) && is_string($item['builtin']) ? trim($item['builtin']) : '';
        return $builtin !== '' && in_array($builtin, self::BUILTINS[$pool] ?? [], true);
    }

    /**
     * The `builtin` chunk id, '' when the item has none or it is ignored.
     *
     * Ignored (one error line) without an honored `internal` or next to a
     * `module`; refused (the entry is dropped) when it is not a first-party
     * chunk of the pool.
     *
     * @param string $pool
     * @param string $name
     * @param array<mixed> $item
     * @param bool $internal the honored value of `internal`
     * @param string $module
     * @return string
     * @throws InvalidEntryException
     */
    public function builtin(string $pool, string $name, array $item, bool $internal, string $module): string
    {
        $builtin = isset($item['builtin']) && is_string($item['builtin']) ? trim($item['builtin']) : '';
        if ($builtin === '') {
            return '';
        }
        if (!$internal || $module !== '') {
            $this->log->error(sprintf(
                'Hyperion checkout: %s "%s": "builtin" needs "internal" and no "module", it is ignored.',
                $pool,
                $name
            ));
            return '';
        }
        if (!preg_match(self::BUILTIN_PATTERN, $builtin) || !in_array($builtin, self::BUILTINS[$pool] ?? [], true)) {
            throw new InvalidEntryException('"builtin" "' . $builtin . '" is not a built-in id');
        }
        return $builtin;
    }

    /**
     * The `api_version` (default "1"), refused when its major is not supported.
     *
     * @param array<mixed> $item
     * @return string
     * @throws InvalidEntryException
     */
    public function apiVersion(array $item): string
    {
        $version = $item['api_version'] ?? (string) self::SUPPORTED_API_MAJOR;
        $version = is_int($version) ? (string) $version : $version;
        if (!is_string($version)
            || !preg_match(self::API_VERSION_PATTERN, trim($version), $match)
            || (int) $match[1] !== self::SUPPORTED_API_MAJOR
        ) {
            throw new InvalidEntryException(sprintf(
                '"api_version" "%s" is not supported (major %d)',
                is_scalar($version) ? (string) $version : gettype($version),
                self::SUPPORTED_API_MAJOR
            ));
        }
        return trim($version);
    }

    /**
     * Whether `$source` (a regular expression without delimiters) compiles in
     * PCRE and uses no syntax the browser's `RegExp` refuses or reads otherwise.
     *
     * @param string $source
     * @return bool
     */
    public function isValidPattern(string $source): bool
    {
        if ($source === '' || str_contains($source, self::DELIMITER)) {
            return false;
        }
        if (self::jsIncompatibility($source) !== null) {
            return false;
        }
        // A pattern that does not compile only answers false here: its warning is the expected outcome.
        // phpcs:ignore Generic.PHP.NoSilencedErrors
        return @preg_match(self::DELIMITER . $source . self::DELIMITER . 'u', '') !== false;
    }

    /**
     * Why the browser's `RegExp` would refuse or read `$source` otherwise than
     * PCRE, null when no known difference is found.
     *
     * A deny list: it finds the PCRE-only constructs that make a different
     * engine fail or match differently, not every semantic difference (see
     * the documentation of the extension pools).
     *
     * @param string $source
     * @return string|null
     */
    public static function jsIncompatibility(string $source): ?string
    {
        // Escapes pair left to right, so `\\A` (a backslash, then A) is not `\A`.
        preg_match_all('/\\\\(.)/s', $source, $escapes, PREG_OFFSET_CAPTURE);
        foreach ($escapes[1] as [$escaped, $offset]) {
            if (str_contains(self::JS_INCOMPATIBLE_ESCAPES, $escaped)) {
                return 'the escape \\' . $escaped;
            }
            // `\x{...}`: a code point in PCRE, the letter x then a quantifier or text in the browser.
            if ($escaped === 'x' && substr($source, $offset + 1, 1) === '{') {
                return 'the escape \\x{...}';
            }
        }
        // Mask escaped characters so `\(?` or `\[` are not read as syntax.
        $masked = (string) preg_replace('/\\\\./s', '__', $source);
        if (preg_match('/\[[^\]]*\[:[a-z]+:\]/', $masked)) {
            return 'a POSIX character class';
        }
        // Mask character classes: `[*+]+` is a class and a quantifier, not a possessive one.
        $masked = (string) preg_replace('/\[\^?\]?[^\]]*\]/', '__', $masked);
        foreach (self::JS_INCOMPATIBLE as [$expression, $description]) {
            if (preg_match($expression, $masked)) {
                return $description;
            }
        }
        return null;
    }

    /**
     * Whether `$pattern` matches the WHOLE `$value`, the browser's semantics
     * (`new RegExp('^(?:' + pattern + ')$')`). False for a pattern that does not compile.
     *
     * @param string $pattern
     * @param string $value
     * @return bool
     */
    public static function matchesWhole(string $pattern, string $value): bool
    {
        if ($pattern === '' || str_contains($pattern, self::DELIMITER)) {
            return false;
        }
        // A pattern that does not compile only answers false here: its warning is the expected outcome.
        // phpcs:ignore Generic.PHP.NoSilencedErrors
        return @preg_match(self::DELIMITER . '^(?:' . $pattern . ')\z' . self::DELIMITER . 'u', $value) === 1;
    }

    /**
     * Phrases keyed by their English source, each rendered through `__()`.
     *
     * The item values are the English sources (`translate="true"` lets
     * `i18n:collect-phrases` find them); the item names are only DI keys.
     *
     * @param array<mixed> $item
     * @return array<string, string>
     */
    public function phrases(array $item): array
    {
        $phrases = [];
        foreach ((array) ($item['phrases'] ?? []) as $source) {
            if (!is_scalar($source) && !$source instanceof \Stringable) {
                continue;
            }
            $source = trim((string) $source);
            if ($source !== '') {
                $phrases[$source] = (string) __($source);
            }
        }
        return $phrases;
    }

    /**
     * The static `options` of an item.
     *
     * @param array<mixed> $item
     * @return array<string, mixed>
     */
    public function options(array $item): array
    {
        return is_array($item['options'] ?? null) ? $item['options'] : [];
    }

    /**
     * A class name item (`options_provider`, `value_provider`), '' when absent.
     *
     * @param array<mixed> $item
     * @param string $key
     * @return string
     */
    public function className(array $item, string $key): string
    {
        return isset($item[$key]) && is_string($item[$key]) ? trim($item[$key]) : '';
    }

    /**
     * Options of an `options_provider`, merged over the static options.
     *
     * @param string $class
     * @param array<string, mixed> $options
     * @param CartInterface $quote
     * @return array<string, mixed>
     * @throws InvalidEntryException when the class is not an options provider
     * @throws \Throwable whatever the provider throws, `SkipExtensionException` included
     */
    public function resolveOptions(string $class, array $options, CartInterface $quote): array
    {
        if ($class === '') {
            return $options;
        }
        $provider = $this->objectManager->get($class);
        if (!$provider instanceof ExtensionOptionsProviderInterface) {
            throw new InvalidEntryException(
                '"' . $class . '" does not implement ' . ExtensionOptionsProviderInterface::class
            );
        }
        return array_replace($options, $provider->getOptions($quote));
    }

    /**
     * The value a `value_provider` reads from the quote, null when none.
     *
     * @param string $class
     * @param CartInterface $quote
     * @return array<string, mixed>|null
     * @throws InvalidEntryException when the class is not a value provider
     * @throws \Throwable whatever the provider throws, `SkipExtensionException` included
     */
    public function resolveValue(string $class, CartInterface $quote): ?array
    {
        if ($class === '') {
            return null;
        }
        $provider = $this->objectManager->get($class);
        if (!$provider instanceof ShippingExtensionValueProviderInterface) {
            throw new InvalidEntryException(
                '"' . $class . '" does not implement ' . ShippingExtensionValueProviderInterface::class
            );
        }
        return $provider->getValue($quote);
    }

    /**
     * The URL of an asset id for the current area, theme, locale and request scheme.
     *
     * The URL must be on the store's web origin or on its static origin;
     * `$staticOrigin` receives the origin when it is not the web one, for
     * `hyperion.staticOrigins`.
     *
     * @param string $module
     * @param string|null $staticOrigin
     * @return string
     * @throws InvalidEntryException
     */
    public function moduleUrl(string $module, ?string &$staticOrigin = null): string
    {
        $staticOrigin = null;
        if (!isset($this->moduleUrls[$module])) {
            try {
                $url = (string) $this->assetRepository->getUrlWithParams($module, ['_secure' => $this->isSecure()]);
            } catch (\Throwable $e) {
                throw new InvalidEntryException(
                    'the module "' . $module . '" cannot be resolved (' . $e->getMessage() . ')',
                    0,
                    $e
                );
            }
            if ($url === '') {
                throw new InvalidEntryException('the module "' . $module . '" cannot be resolved');
            }
            $this->moduleUrls[$module] = $url;
        }
        $url = $this->moduleUrls[$module];
        $origin = self::origin($url);
        [$web, $static] = $this->origins();
        if ($origin !== '' && $origin === $web) {
            return $url;
        }
        if ($origin !== '' && $origin === $static) {
            $staticOrigin = $origin;
            return $url;
        }
        throw new InvalidEntryException(
            'the module URL "' . $url . '" is not served from the store or its static files origin'
        );
    }

    /**
     * `scheme://host[:port]` of an absolute URL, as the browser's `URL.origin` writes it; '' without a host.
     *
     * @param string $url
     * @return string
     */
    public static function origin(string $url): string
    {
        // phpcs:ignore Magento2.Functions.DiscouragedFunction
        $parts = parse_url($url);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            return '';
        }
        $scheme = strtolower($parts['scheme']);
        $port = isset($parts['port']) ? (int) $parts['port'] : null;
        if (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) {
            $port = null;
        }
        return $scheme . '://' . strtolower($parts['host']) . ($port !== null ? ':' . $port : '');
    }

    /**
     * The store's web origin and static origin for the current scheme.
     *
     * @return string[]
     */
    private function origins(): array
    {
        if ($this->origins === null) {
            $store = $this->storeManager->getStore();
            if (!$store instanceof Store) {
                return $this->origins = ['', ''];
            }
            $secure = $this->isSecure();
            $this->origins = [
                self::origin((string) $store->getBaseUrl(UrlInterface::URL_TYPE_LINK, $secure)),
                self::origin((string) $store->getBaseUrl(UrlInterface::URL_TYPE_STATIC, $secure)),
            ];
        }
        return $this->origins;
    }

    /**
     * Whether the current request is served over HTTPS.
     *
     * @return bool
     */
    private function isSecure(): bool
    {
        $store = $this->storeManager->getStore();
        return $store instanceof Store && $store->isCurrentlySecure();
    }

    /**
     * A boolean item value, read the same way by every pool.
     *
     * `xsi:type="boolean"` items arrive as booleans; an item written as a
     * string or a number is true only for "1", "true", "on", "yes" (any case)
     * and 1, so `"false"`, `"0"`, `"off"`, `"no"`, "" and anything else read false.
     *
     * @param mixed $value
     * @return bool
     */
    public static function isTrue(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (!is_scalar($value)) {
            return false;
        }
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}

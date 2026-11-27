<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment;

use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Extension\InvalidEntryException;
use Magento\Framework\UrlInterface;
use Magento\Quote\Api\Data\CartInterface;

/**
 * The payment renderers of the checkout: which element, generic renderer or
 * form serves each payment method code.
 *
 * Entries are items of the `renderers` array argument, declared in
 * `etc/frontend/di.xml` (the pool exists in the frontend area only). Item
 * keys are snake_case; the browser receives each entry as a
 * `PaymentRendererConfig` (`extension-api.d.ts`) in
 * `checkoutConfig.hyperion.paymentRenderers`.
 *
 * Validation follows `Model\Extension\EntryRules`, the rules every
 * extension pool shares: an entry with an invalid or missing required key
 * (match, type, tag and module, redirect target, form fields, api version)
 * is dropped and logged once at `error` level; an invalid optional value
 * (a field `pattern` included) falls back to its default and is logged the
 * same way; a key the pool does not know is ignored and logged once at
 * `notice` level. A broken entry never breaks the checkout.
 *
 * Matching: an entry whose `method` equals the code wins; otherwise the
 * `pattern` entry that matches the WHOLE code (as the browser matches it)
 * with the lowest `sort_order` (then the item name). A shadowed entry is
 * logged once.
 *
 * Nothing is instantiated in the constructor: `options_provider` classes
 * are resolved when the configuration is built, module URLs are resolved
 * through the asset repository for the current theme and locale.
 *
 * @api
 * @since 0.9.0
 */
class RendererPool
{
    public const TYPE_ELEMENT = 'element';
    public const TYPE_REDIRECT = 'redirect';
    public const TYPE_REDIRECT_BEFORE_ORDER = 'redirect-before-order';
    public const TYPE_FORM = 'form';

    /** The major of the payment renderer contract this checkout implements. */
    public const API_MAJOR = 1;

    /** Tag prefixes the checkout and the theme own; first-party (internal) entries are exempt. */
    public const RESERVED_TAG_PREFIXES = EntryRules::RESERVED_TAG_PREFIXES;

    private const TYPES = [
        self::TYPE_ELEMENT,
        self::TYPE_REDIRECT,
        self::TYPE_REDIRECT_BEFORE_ORDER,
        self::TYPE_FORM,
    ];

    private const KNOWN_KEYS = [
        'method', 'pattern', 'type', 'tag', 'module', 'builtin', 'internal', 'api_version',
        'owns_place_order', 'eager', 'awaits_ready', 'saves_on_selection', 'sort_order',
        'options', 'options_provider', 'phrases', 'redirect_hosts', 'redirect_route',
        'redirect_config_path', 'fields',
    ];

    private const FIELD_KEYS = ['label', 'type', 'required', 'pattern', 'options', 'target', 'sort_order'];
    private const FIELD_TYPES = ['text', 'tel', 'date', 'select'];
    private const FIELD_TARGETS = ['additional_data', 'po_number'];

    private const METHOD_PATTERN = '/^[A-Za-z0-9_]+$/';
    private const FIELD_NAME_PATTERN = '/^[a-z][a-z0-9_]*$/';
    private const ROUTE_PATTERN = '#^[A-Za-z0-9_\-]+(/[A-Za-z0-9_\-]+){0,2}$#';
    private const CONFIG_PATH_PATTERN = '/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/';
    private const HOST_PATTERN = '/^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/';

    /** @var array<string, array<string, mixed>>|null */
    private ?array $entries = null;

    /** @var array<string, array<string, mixed>|null> */
    private array $matches = [];

    /**
     * @param EntryRules $rules
     * @param UrlInterface $urlBuilder
     * @param LogOnce $log
     * @param array<string, mixed> $renderers
     */
    public function __construct(
        private readonly EntryRules $rules,
        private readonly UrlInterface $urlBuilder,
        private readonly LogOnce $log,
        private readonly array $renderers = []
    ) {
    }

    /**
     * The valid entries, normalized, sorted by `sort_order` then item name.
     *
     * Keys of each entry: id, method, pattern, type, tag, module, builtin,
     * internal, api_version, owns_place_order, eager, awaits_ready,
     * saves_on_selection, sort_order, options, options_provider, phrases
     * (English sources), redirect_hosts, redirect_route,
     * redirect_config_path, fields.
     *
     * @return array<string, array<string, mixed>> item name => entry
     */
    public function getEntries(): array
    {
        if ($this->entries === null) {
            $entries = [];
            foreach ($this->renderers as $id => $item) {
                $entry = $this->normalize((string)$id, $item);
                if ($entry !== null) {
                    $entries[(string)$id] = $entry;
                }
            }
            uasort($entries, static fn(array $a, array $b): int => [$a['sort_order'], $a['id']]
                <=> [$b['sort_order'], $b['id']]);
            $this->entries = $entries;
        }
        return $this->entries;
    }

    /**
     * The entry that renders the payment method, null when none does.
     *
     * @param string $methodCode
     * @return array<string, mixed>|null
     */
    public function match(string $methodCode): ?array
    {
        if (array_key_exists($methodCode, $this->matches)) {
            return $this->matches[$methodCode];
        }
        $exact = [];
        $patterns = [];
        foreach ($this->getEntries() as $entry) {
            if ($entry['method'] !== null) {
                if ($entry['method'] === $methodCode) {
                    $exact[] = $entry;
                }
                continue;
            }
            if ($entry['pattern'] !== null && $this->patternMatches($entry['pattern'], $methodCode)) {
                $patterns[] = $entry;
            }
        }
        $candidates = array_merge($exact, $patterns);
        $winner = $candidates[0] ?? null;
        foreach (array_slice($candidates, 1) as $shadowed) {
            $this->log->notice(sprintf(
                'Hyperion checkout: payment renderer "%s" is shadowed by "%s" for the method "%s".',
                $shadowed['id'],
                $winner['id'] ?? '',
                $methodCode
            ));
        }
        return $this->matches[$methodCode] = $winner;
    }

    /**
     * Whether some entry renders the payment method.
     *
     * @param string $code
     * @return bool
     */
    public function isSupported(string $code): bool
    {
        return $this->match($code) !== null;
    }

    /**
     * The emitted entry (`PaymentRendererConfig`, as `getRendererConfig()`
     * returns or the page decodes it) that renders the method code, by the
     * same rule as `match()` and the browser's matcher: the exact `method`
     * first, then the `pattern` that matches the whole code with the lowest
     * `sortOrder` (the first of the list on a tie). Null when none does.
     *
     * @param array<mixed> $entries
     * @param string $code
     * @return array<string, mixed>|null
     */
    public static function matchEmitted(array $entries, string $code): ?array
    {
        $best = null;
        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $method = $entry['method'] ?? null;
            if (is_string($method) && $method !== '') {
                if ($method === $code) {
                    return $entry;
                }
                continue;
            }
            $pattern = $entry['pattern'] ?? null;
            if (!is_string($pattern) || !EntryRules::matchesWhole($pattern, $code)) {
                continue;
            }
            $sortOrder = is_numeric($entry['sortOrder'] ?? null) ? (float)$entry['sortOrder'] : 0.0;
            if ($best === null || $sortOrder < $best[0]) {
                $best = [$sortOrder, $entry];
            }
        }
        return $best[1] ?? null;
    }

    /**
     * The entries that render at least one of the given method codes, as
     * the browser receives them, and the static origins their modules use.
     *
     * An entry whose module URL cannot be resolved or is served from a
     * foreign origin, or whose options provider fails, is dropped for this
     * render and logged.
     *
     * @param CartInterface|null $quote The quote the options providers read; null drops entries that need one.
     * @param string[] $methodCodes
     * @return array{renderers: list<array<string, mixed>>, staticOrigins: list<string>}
     */
    public function getRendererConfig(?CartInterface $quote, array $methodCodes): array
    {
        $used = [];
        foreach ($methodCodes as $code) {
            $entry = $this->match((string)$code);
            if ($entry !== null) {
                $used[$entry['id']] = true;
            }
        }

        $renderers = [];
        $origins = [];
        foreach ($this->getEntries() as $id => $entry) {
            if (!isset($used[$id])) {
                continue;
            }
            $exported = $this->export($entry, $quote, $origins);
            if ($exported !== null) {
                $renderers[] = $exported;
            }
        }
        return ['renderers' => $renderers, 'staticOrigins' => array_keys($origins)];
    }

    /**
     * @param array<string, mixed> $entry
     * @param CartInterface|null $quote
     * @param array<string, true> $origins
     * @return array<string, mixed>|null
     */
    private function export(array $entry, ?CartInterface $quote, array &$origins): ?array
    {
        $moduleUrl = null;
        if ($entry['module'] !== null) {
            $moduleUrl = $this->resolveModuleUrl($entry['id'], $entry['module'], $origins);
            if ($moduleUrl === null) {
                return null;
            }
        }

        $options = $entry['options'];
        if ($entry['options_provider'] !== null) {
            $provided = $this->provideOptions($entry['id'], $entry['options_provider'], $quote);
            if ($provided === null) {
                return null;
            }
            $options = array_replace($options, $provided);
        }
        try {
            json_encode($options, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            $this->log->error(sprintf(
                'Hyperion checkout: payment renderer "%s" dropped: its options are not JSON serializable (%s).',
                $entry['id'],
                $e->getMessage()
            ));
            return null;
        }

        $redirect = null;
        if ($entry['type'] === self::TYPE_REDIRECT || $entry['type'] === self::TYPE_REDIRECT_BEFORE_ORDER) {
            $redirect = [
                'route' => $entry['redirect_route'] !== null
                    ? (string)$this->urlBuilder->getUrl($entry['redirect_route'], ['_secure' => true])
                    : null,
                'configPath' => $entry['redirect_config_path'],
            ];
        }

        $phrases = [];
        foreach ($entry['phrases'] as $source) {
            $phrases[$source] = (string)__($source);
        }

        $fields = [];
        foreach ($entry['fields'] as $field) {
            $fieldOptions = [];
            foreach ($field['options'] as $option) {
                $fieldOptions[] = ['value' => $option['value'], 'label' => (string)__($option['label'])];
            }
            $fields[] = [
                'name' => $field['name'],
                'label' => (string)__($field['label']),
                'type' => $field['type'],
                'required' => $field['required'],
                'pattern' => $field['pattern'],
                'options' => $fieldOptions,
                'target' => $field['target'],
            ];
        }

        return [
            'id' => $entry['id'],
            'method' => $entry['method'],
            'pattern' => $entry['pattern'],
            'type' => $entry['type'],
            'tag' => $entry['tag'],
            'moduleUrl' => $moduleUrl,
            'builtin' => $entry['builtin'],
            'apiVersion' => $entry['api_version'],
            'ownsPlaceOrder' => $entry['owns_place_order'],
            'eager' => $entry['eager'],
            'awaitsReady' => $entry['awaits_ready'],
            'savesOnSelection' => $entry['saves_on_selection'],
            'sortOrder' => $entry['sort_order'],
            'options' => $options === [] ? new \stdClass() : $options,
            'phrases' => $phrases === [] ? new \stdClass() : $phrases,
            'redirectHosts' => $entry['redirect_hosts'],
            'redirect' => $redirect,
            'fields' => $fields,
        ];
    }

    /**
     * @param string $id
     * @param string $module
     * @param array<string, true> $origins
     * @return string|null
     */
    private function resolveModuleUrl(string $id, string $module, array &$origins): ?string
    {
        try {
            $origin = null;
            $url = $this->rules->moduleUrl($module, $origin);
        } catch (InvalidEntryException $e) {
            $this->drop($id, $e->getMessage());
            return null;
        }
        if ($origin !== null) {
            $origins[$origin] = true;
        }
        return $url;
    }

    /**
     * @param string $id
     * @param string $class
     * @param CartInterface|null $quote
     * @return array<string, mixed>|null
     */
    private function provideOptions(string $id, string $class, ?CartInterface $quote): ?array
    {
        if ($quote === null) {
            $this->log->error(sprintf(
                'Hyperion checkout: payment renderer "%s" dropped: its options provider needs a quote.',
                $id
            ));
            return null;
        }
        try {
            return $this->rules->resolveOptions($class, [], $quote);
        } catch (SkipExtensionException $e) {
            return null;
        } catch (InvalidEntryException $e) {
            $this->drop($id, $e->getMessage());
            return null;
        } catch (\Throwable $e) {
            $this->log->error(sprintf(
                'Hyperion checkout: payment renderer "%s" dropped: its options provider failed (%s).',
                $id,
                $e->getMessage()
            ));
            return null;
        }
    }

    /**
     * @param string $id
     * @param mixed $item
     * @return array<string, mixed>|null
     */
    private function normalize(string $id, mixed $item): ?array
    {
        if ($id === '' || !is_array($item)) {
            $this->drop($id, 'the item is not an array');
            return null;
        }
        $this->rules->ignoreUnknownKeys(EntryRules::POOL_PAYMENT, $id, $item, self::KNOWN_KEYS);

        $method = $this->optionalString($item, 'method');
        $pattern = $this->optionalString($item, 'pattern');
        if ($method !== null && !preg_match(self::METHOD_PATTERN, $method)) {
            $this->drop($id, sprintf('"method" "%s" is not a payment method code', $method));
            return null;
        }
        if ($method !== null && $pattern !== null) {
            $this->log->notice(sprintf(
                'Hyperion checkout: payment renderer "%s": "method" is set, "pattern" is ignored.',
                $id
            ));
            $pattern = null;
        }
        if ($method === null && $pattern === null) {
            $this->drop($id, 'neither "method" nor "pattern" is set');
            return null;
        }
        if ($pattern !== null && !$this->rules->isValidPattern($pattern)) {
            $this->drop($id, sprintf(
                '"pattern" "%s" is not a regular expression both PCRE and the browser compile',
                $pattern
            ));
            return null;
        }

        $type = $this->optionalString($item, 'type') ?? self::TYPE_ELEMENT;
        if (!in_array($type, self::TYPES, true)) {
            $this->drop($id, sprintf('"type" "%s" is not one of %s', $type, implode(', ', self::TYPES)));
            return null;
        }

        try {
            $apiVersion = $this->rules->apiVersion($item);
            $module = $this->rules->module($item);
        } catch (InvalidEntryException $e) {
            $this->drop($id, $e->getMessage());
            return null;
        }
        $module = $module === '' ? null : $module;
        $internal = $this->rules->internal(EntryRules::POOL_PAYMENT, $id, $item, (string)$module);

        $tag = $this->optionalString($item, 'tag');
        $builtin = null;
        if ($type === self::TYPE_ELEMENT) {
            try {
                $builtin = $this->rules->builtin(EntryRules::POOL_PAYMENT, $id, $item, $internal, (string)$module);
            } catch (InvalidEntryException $e) {
                $this->drop($id, $e->getMessage());
                return null;
            }
            $builtin = $builtin === '' ? null : $builtin;
            if ($builtin === null && ($tag === null || $module === null)) {
                $this->drop($id, 'an element entry needs "tag" and "module"');
                return null;
            }
            if ($tag !== null && !$this->rules->isAllowedTag($tag, $internal)) {
                $this->drop($id, sprintf(
                    '"tag" "%s" is not a custom element name or starts with a reserved prefix',
                    $tag
                ));
                return null;
            }
        } else {
            $tag = null;
            $module = null;
            $builtin = null;
        }

        $route = $this->optionalString($item, 'redirect_route');
        $configPath = $this->optionalString($item, 'redirect_config_path');
        if ($type === self::TYPE_REDIRECT || $type === self::TYPE_REDIRECT_BEFORE_ORDER) {
            if ($route !== null && !preg_match(self::ROUTE_PATTERN, $route)) {
                $this->drop($id, sprintf('"redirect_route" "%s" is not a route path', $route));
                return null;
            }
            if ($configPath !== null && !preg_match(self::CONFIG_PATH_PATTERN, $configPath)) {
                $this->drop($id, sprintf('"redirect_config_path" "%s" is not a dot path', $configPath));
                return null;
            }
            if ($type === self::TYPE_REDIRECT && (($route === null) === ($configPath === null))) {
                $this->drop($id, 'a redirect entry needs exactly one of "redirect_route" and'
                    . ' "redirect_config_path"');
                return null;
            }
            if ($type === self::TYPE_REDIRECT_BEFORE_ORDER) {
                if ($route === null) {
                    $this->drop($id, 'a redirect-before-order entry needs "redirect_route"');
                    return null;
                }
                $configPath = null;
            }
        } else {
            $route = null;
            $configPath = null;
        }

        $fields = [];
        if ($type === self::TYPE_FORM) {
            $fields = $this->normalizeFields($id, $item['fields'] ?? null);
            if ($fields === null) {
                return null;
            }
        }

        $sortOrder = 0;
        if (isset($item['sort_order'])) {
            if (is_numeric($item['sort_order'])) {
                $sortOrder = (int)$item['sort_order'];
            } else {
                $this->invalidOptional($id, 'sort_order');
            }
        }

        $optionsProvider = $this->optionalString($item, 'options_provider');

        return [
            'id' => $id,
            'method' => $method,
            'pattern' => $pattern,
            'type' => $type,
            'tag' => $tag,
            'module' => $module,
            'builtin' => $builtin,
            'internal' => $internal,
            'api_version' => $apiVersion,
            'owns_place_order' => $this->flag($id, $item, 'owns_place_order', false),
            'eager' => $this->flag($id, $item, 'eager', false),
            'awaits_ready' => $this->flag($id, $item, 'awaits_ready', false),
            'saves_on_selection' => $this->flag($id, $item, 'saves_on_selection', true),
            'sort_order' => $sortOrder,
            'options' => $this->arrayValue($id, $item, 'options'),
            'options_provider' => $optionsProvider,
            'phrases' => $this->strings($id, $item, 'phrases'),
            'redirect_hosts' => $this->hosts($id, $item),
            'redirect_route' => $route,
            'redirect_config_path' => $configPath,
            'fields' => $fields,
        ];
    }

    /**
     * @param string $id
     * @param mixed $items
     * @return list<array<string, mixed>>|null
     */
    private function normalizeFields(string $id, mixed $items): ?array
    {
        if (!is_array($items) || $items === []) {
            $this->drop($id, 'a form entry needs at least one field');
            return null;
        }
        $fields = [];
        $poNumbers = 0;
        $position = 0;
        foreach ($items as $name => $field) {
            $name = (string)$name;
            if (!preg_match(self::FIELD_NAME_PATTERN, $name) || !is_array($field)) {
                $this->drop($id, sprintf('the field "%s" has an invalid name or is not an array', $name));
                return null;
            }
            $this->rules->ignoreUnknownKeys(
                EntryRules::POOL_PAYMENT,
                $id,
                $field,
                self::FIELD_KEYS,
                'field "' . $name . '"'
            );
            $label = $this->optionalString($field, 'label');
            if ($label === null) {
                $this->drop($id, sprintf('the field "%s" has no label', $name));
                return null;
            }
            $type = $this->optionalString($field, 'type') ?? 'text';
            $target = $this->optionalString($field, 'target') ?? 'additional_data';
            $pattern = $this->optionalString($field, 'pattern');
            if (!in_array($type, self::FIELD_TYPES, true) || !in_array($target, self::FIELD_TARGETS, true)) {
                $this->drop($id, sprintf('the field "%s" has an invalid type or target', $name));
                return null;
            }
            if ($pattern !== null && !$this->rules->isValidPattern($pattern)) {
                $this->rules->invalidOptional(
                    EntryRules::POOL_PAYMENT,
                    $id,
                    'fields.' . $name . '.pattern',
                    'not a regular expression both PCRE and the browser compile'
                );
                $pattern = null;
            }
            if ($target === 'po_number' && ++$poNumbers > 1) {
                $this->drop($id, 'more than one field targets "po_number"');
                return null;
            }
            $options = [];
            if ($type === 'select') {
                foreach (is_array($field['options'] ?? null) ? $field['options'] : [] as $option) {
                    if (!is_array($option) || !isset($option['value'], $option['label'])
                        || !is_scalar($option['value']) || !is_string($option['label'])
                    ) {
                        $this->drop($id, sprintf('the field "%s" has an option without value and label', $name));
                        return null;
                    }
                    $options[] = ['value' => (string)$option['value'], 'label' => $option['label']];
                }
                if ($options === []) {
                    $this->drop($id, sprintf('the select field "%s" has no option', $name));
                    return null;
                }
            }
            $fields[] = [
                'name' => $name,
                'label' => $label,
                'type' => $type,
                'required' => $this->flag($id, $field, 'required', false),
                'pattern' => $pattern,
                'options' => $options,
                'target' => $target,
                'sort_order' => is_numeric($field['sort_order'] ?? null) ? (int)$field['sort_order'] : 0,
                'position' => $position++,
            ];
        }
        usort($fields, static fn(array $a, array $b): int => [$a['sort_order'], $a['position']]
            <=> [$b['sort_order'], $b['position']]);
        return $fields;
    }

    /**
     * @param string $pattern
     * @param string $code
     * @return bool
     */
    private function patternMatches(string $pattern, string $code): bool
    {
        return EntryRules::matchesWhole($pattern, $code);
    }

    /**
     * @param array<mixed> $item
     * @param string $key
     * @return string|null
     */
    private function optionalString(array $item, string $key): ?string
    {
        $value = $item[$key] ?? null;
        if (is_int($value) || is_float($value)) {
            $value = (string)$value;
        }
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        return $value === '' ? null : $value;
    }

    /**
     * @param string $id
     * @param array<mixed> $item
     * @param string $key
     * @param bool $default
     * @return bool
     */
    private function flag(string $id, array $item, string $key, bool $default): bool
    {
        if (!array_key_exists($key, $item) || $item[$key] === null) {
            return $default;
        }
        $value = is_bool($item[$key])
            ? $item[$key]
            : filter_var($item[$key], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($value === null) {
            $this->invalidOptional($id, $key);
            return $default;
        }
        return $value;
    }

    /**
     * @param string $id
     * @param array<mixed> $item
     * @param string $key
     * @return array<string, mixed>
     */
    private function arrayValue(string $id, array $item, string $key): array
    {
        if (!isset($item[$key])) {
            return [];
        }
        if (!is_array($item[$key])) {
            $this->invalidOptional($id, $key);
            return [];
        }
        return $item[$key];
    }

    /**
     * The non-empty string values of a list item (phrases: English sources).
     *
     * @param string $id
     * @param array<mixed> $item
     * @param string $key
     * @return list<string>
     */
    private function strings(string $id, array $item, string $key): array
    {
        $values = [];
        foreach ($this->arrayValue($id, $item, $key) as $value) {
            if (is_string($value) && trim($value) !== '') {
                $values[] = trim($value);
            } else {
                $this->invalidOptional($id, $key);
            }
        }
        return array_values(array_unique($values));
    }

    /**
     * @param string $id
     * @param array<mixed> $item
     * @return list<string>
     */
    private function hosts(string $id, array $item): array
    {
        $hosts = [];
        foreach ($this->arrayValue($id, $item, 'redirect_hosts') as $host) {
            if (is_string($host) && preg_match(self::HOST_PATTERN, $host)) {
                $hosts[$host] = true;
                continue;
            }
            $this->log->error(sprintf(
                'Hyperion checkout: payment renderer "%s": the redirect host "%s" is not a bare lower case'
                . ' host name and is ignored.',
                $id,
                is_scalar($host) ? (string)$host : gettype($host)
            ));
        }
        return array_keys($hosts);
    }

    /**
     * @param string $id
     * @param string $key
     * @return void
     */
    private function invalidOptional(string $id, string $key): void
    {
        $this->log->error(sprintf(
            'Hyperion checkout: payment renderer "%s": the value of "%s" is invalid, its default is used.',
            $id,
            $key
        ));
    }

    /**
     * @param string $id
     * @param string $reason
     * @return void
     */
    private function drop(string $id, string $reason): void
    {
        $this->log->error(sprintf('Hyperion checkout: payment renderer "%s" dropped: %s.', $id, $reason));
    }
}

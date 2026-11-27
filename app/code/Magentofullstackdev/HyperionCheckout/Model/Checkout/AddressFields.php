<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Eav\Model\Config as EavConfig;
use Magento\Eav\Model\Entity\Attribute as EavAttribute;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Extension\InvalidEntryException;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use Psr\Log\LoggerInterface;

/**
 * The extra address fields of the checkout forms (a fiscal code, an SDI
 * code), declared as items of the `address_fields` argument of
 * `Model\Checkout\ExtensionPool` and emitted as `hyperion.addressFields`
 * (`AddressFieldConfig[]`). The item name is the field code.
 *
 * Item keys:
 *   target        `custom_attributes` (the code must be a `customer_address`
 *                 EAV attribute; label and options default to the
 *                 attribute's) or `extension_attributes` (label required)
 *   label         translated through `__()`
 *   type          `text` (default), `tel`, `email`, `date`, `select` (needs
 *                 options), `checkbox`
 *   forms         `shipping` and / or `billing` (default both)
 *   required      the field blocks Place Order while empty
 *   pattern       regular expression without delimiters that PCRE and the
 *                 browser's RegExp both compile, matched against the whole
 *                 value; a mismatch blocks. An invalid one is ignored (logged)
 *   max_length    integer
 *   options       `value => label`, or items with `value` and `label`
 *   countries     ISO codes the field is shown for (default every country)
 *   autocomplete  HTML autocomplete token
 *   hint          help text under the field, translated
 *   sort_order    position in the form, after the built-in fields by default
 *
 * Hyperion renders and transports the values; saving them on the quote
 * address and the order is the declaring module's job.
 */
class AddressFields
{
    public const TARGET_CUSTOM = 'custom_attributes';
    public const TARGET_EXTENSION = 'extension_attributes';
    public const TARGETS = [self::TARGET_CUSTOM, self::TARGET_EXTENSION];
    public const TYPES = ['text', 'tel', 'email', 'date', 'select', 'checkbox'];
    public const FORMS = ['shipping', 'billing'];
    public const DEFAULT_SORT_ORDER = 1000;

    private const KNOWN_KEYS = [
        'label', 'type', 'target', 'forms', 'required', 'pattern', 'max_length', 'options', 'countries',
        'autocomplete', 'hint', 'sort_order',
    ];
    private const ENTITY_TYPE = 'customer_address';
    private const CODE_PATTERN = '/^[a-z][a-z0-9_]*$/';
    private const INPUT_TYPES = ['select' => 'select', 'boolean' => 'checkbox', 'date' => 'date'];

    /** @var array<int, array<string, mixed>>|null */
    private ?array $fields = null;

    /**
     * @param EavConfig $eavConfig
     * @param EntryRules $rules
     * @param LogOnce $logOnce
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly EavConfig $eavConfig,
        private readonly EntryRules $rules,
        private readonly LogOnce $logOnce,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The valid fields, sorted by sort order then code.
     *
     * @param array<string, mixed> $items
     * @return array<int, array<string, mixed>>
     */
    public function build(array $items): array
    {
        if ($this->fields !== null) {
            return $this->fields;
        }
        $fields = [];
        foreach ($items as $code => $item) {
            $code = (string) $code;
            try {
                $fields[] = $this->field($code, $item);
            } catch (InvalidEntryException $e) {
                $this->logOnce->error(
                    'Hyperion checkout: address field "' . $code . '" dropped: ' . $e->getMessage(),
                    ['entry' => $code]
                );
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion checkout: address field validation failed', [
                    'entry' => $code,
                    'exception' => $e,
                ]);
            }
        }
        usort($fields, static fn (array $a, array $b): int
            => [$a['sortOrder'], $a['code']] <=> [$b['sortOrder'], $b['code']]);
        return $this->fields = $fields;
    }

    /**
     * The codes of the valid fields per target.
     *
     * @param array<string, mixed> $items
     * @return array{custom_attributes: string[], extension_attributes: string[]}
     */
    public function codesByTarget(array $items): array
    {
        $codes = [self::TARGET_CUSTOM => [], self::TARGET_EXTENSION => []];
        foreach ($this->build($items) as $field) {
            $codes[$field['target']][] = $field['code'];
        }
        return $codes;
    }

    /**
     * One field in the `AddressFieldConfig` shape.
     *
     * @param string $code
     * @param mixed $item
     * @return array<string, mixed>
     * @throws InvalidEntryException
     * @SuppressWarnings(PHPMD.CyclomaticComplexity)
     * @SuppressWarnings(PHPMD.NPathComplexity)
     */
    private function field(string $code, mixed $item): array
    {
        if (!is_array($item)) {
            throw new InvalidEntryException('the item is not an array');
        }
        if (!preg_match(self::CODE_PATTERN, $code)) {
            throw new InvalidEntryException('the field code must be snake_case');
        }
        $this->rules->ignoreUnknownKeys(EntryRules::POOL_ADDRESS_FIELD, $code, $item, self::KNOWN_KEYS);
        $target = $item['target'] ?? null;
        if (!is_string($target) || !in_array($target, self::TARGETS, true)) {
            throw new InvalidEntryException('the target must be custom_attributes or extension_attributes');
        }

        $label = $this->text($item['label'] ?? null);
        $type = isset($item['type']) && is_string($item['type']) ? $item['type'] : '';
        $options = $this->options($item['options'] ?? []);

        if ($target === self::TARGET_CUSTOM) {
            $attribute = $this->eavConfig->getAttribute(self::ENTITY_TYPE, $code);
            // An unknown code gives an empty attribute object.
            if (!$attribute->getId()) {
                throw new InvalidEntryException('no customer address attribute "' . $code . '" exists');
            }
            if ($label === null && $attribute instanceof EavAttribute) {
                $label = trim((string) $attribute->getStoreLabel());
            }
            if ($type === '') {
                $type = self::INPUT_TYPES[(string) $attribute->getFrontendInput()] ?? 'text';
            }
            if ($options === [] && $attribute->usesSource()) {
                $options = $this->options($attribute->getSource()->getAllOptions(), false);
            }
        } elseif ($label === null) {
            throw new InvalidEntryException('a label is required for an extension attribute field');
        }
        if ($label === null || $label === '') {
            throw new InvalidEntryException('the field has no label');
        }

        $type = $type === '' ? 'text' : $type;
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidEntryException('the type must be one of ' . implode(', ', self::TYPES));
        }
        if ($type === 'select' && $options === []) {
            throw new InvalidEntryException('a select field needs options');
        }

        $pattern = isset($item['pattern']) && is_string($item['pattern']) && $item['pattern'] !== ''
            ? $item['pattern']
            : null;
        if ($pattern !== null && !$this->rules->isValidPattern($pattern)) {
            $this->rules->invalidOptional(
                EntryRules::POOL_ADDRESS_FIELD,
                $code,
                'pattern',
                'not a regular expression both PCRE and the browser compile'
            );
            $pattern = null;
        }

        $forms = [];
        foreach ((array) ($item['forms'] ?? self::FORMS) as $form) {
            if (!is_string($form) || !in_array($form, self::FORMS, true)) {
                throw new InvalidEntryException('forms must list shipping and / or billing');
            }
            $forms[] = $form;
        }
        $forms = array_values(array_unique($forms));
        if ($forms === []) {
            throw new InvalidEntryException('forms must list shipping and / or billing');
        }

        $countries = [];
        foreach ((array) ($item['countries'] ?? []) as $country) {
            $country = is_string($country) ? strtoupper(trim($country)) : '';
            if (!preg_match('/^[A-Z]{2}$/', $country)) {
                throw new InvalidEntryException('countries must be ISO 3166-1 alpha-2 codes');
            }
            $countries[] = $country;
        }

        $maxLength = null;
        if (isset($item['max_length']) && $item['max_length'] !== '') {
            $maxLength = filter_var($item['max_length'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($maxLength === false) {
                throw new InvalidEntryException('max_length must be a positive integer');
            }
        }

        $autocomplete = isset($item['autocomplete']) && is_string($item['autocomplete'])
            && trim($item['autocomplete']) !== '' ? trim($item['autocomplete']) : null;

        return [
            'code' => $code,
            'label' => $label,
            'type' => $type,
            'target' => $target,
            'forms' => $forms,
            'required' => EntryRules::isTrue($item['required'] ?? false),
            'pattern' => $pattern,
            'maxLength' => $maxLength,
            'options' => $options,
            'countries' => array_values(array_unique($countries)),
            'autocomplete' => $autocomplete,
            'hint' => $this->text($item['hint'] ?? null),
            'sortOrder' => (int) ($item['sort_order'] ?? self::DEFAULT_SORT_ORDER),
        ];
    }

    /**
     * A translated text, null when empty.
     *
     * @param mixed $value
     * @return string|null
     */
    private function text(mixed $value): ?string
    {
        if (!is_scalar($value) && !$value instanceof \Stringable) {
            return null;
        }
        $value = trim((string) $value);
        return $value === '' ? null : (string) __($value);
    }

    /**
     * Options as `{ value, label }` with string values, empty values left out.
     *
     * @param mixed $options
     * @param bool $translate false for labels the attribute source already localized
     * @return array<int, array{value: string, label: string}>
     */
    private function options(mixed $options, bool $translate = true): array
    {
        $result = [];
        foreach ((array) $options as $key => $option) {
            if (is_array($option)) {
                $value = $option['value'] ?? null;
                $label = $option['label'] ?? $value;
            } else {
                $value = $key;
                $label = $option;
            }
            if (!is_scalar($value) || (string) $value === '' || is_array($label)) {
                continue;
            }
            $label = $label ?? $value;
            $label = $translate ? (string) $this->text($label) : trim((string) $label);
            $result[] = ['value' => (string) $value, 'label' => $label === '' ? (string) $value : $label];
        }
        return $result;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel;

use Magento\Customer\Model\AttributeMetadataDataProvider;
use Magento\Eav\Model\Attribute;
use Magento\Framework\Api\CustomAttributesDataInterface;
use Magento\Framework\DataObject;
use Magento\Framework\Stdlib\DateTime\TimezoneInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

/**
 * Fields of the user-defined customer and address attributes of a form code
 * (`customer_account_create`, `customer_account_edit`, `customer_address_edit`,
 * `customer_register_address`), for the generic renderer
 * `Magentofullstackdev_HyperionCustomer::form/user-attributes.phtml`.
 *
 * Only visible, user-defined attributes assigned to the form are returned, minus
 * the `excludedAttributes` constructor argument (etc/frontend/di.xml): add an
 * item there for an attribute a module renders itself. Saving needs nothing:
 * core's form extraction reads and validates every attribute of the form code.
 *
 * Field shape: `code`, `label`, `input` (text, textarea, date, boolean, select,
 * multiselect, multiline), `required`, `options` (list of `value` / `label`
 * strings), `rules` (`min_text_length`, `max_text_length`, `input_validation`,
 * `date_range_min`, `date_range_max` when set), `value` (string, or a list of
 * strings for multiselect and multiline) and `lines` (multiline only).
 */
class UserAttributes implements ArgumentInterface
{
    private const SUPPORTED_INPUTS = ['text', 'textarea', 'date', 'boolean', 'select', 'multiselect', 'multiline'];
    private const RULE_KEYS = [
        'min_text_length',
        'max_text_length',
        'input_validation',
        'date_range_min',
        'date_range_max',
    ];

    /** @var array<string, true> */
    private array $excluded;

    /** @var array<string, true> */
    private array $skipLogged = [];

    /**
     * @param AttributeMetadataDataProvider $metadataProvider
     * @param TimezoneInterface $timezone
     * @param LoggerInterface $logger
     * @param string[] $excludedAttributes attribute codes never rendered by the generic renderer
     */
    public function __construct(
        private readonly AttributeMetadataDataProvider $metadataProvider,
        private readonly TimezoneInterface $timezone,
        private readonly LoggerInterface $logger,
        array $excludedAttributes = []
    ) {
        $this->excluded = [];
        foreach ($excludedAttributes as $code) {
            if (is_string($code) && $code !== '') {
                $this->excluded[$code] = true;
            }
        }
    }

    /**
     * Renderable fields of the form, in the form's sort order.
     *
     * @param string $entityType `customer` or `customer_address`
     * @param string $formCode
     * @param DataObject|CustomAttributesDataInterface|null $entity source of the current values
     * @return array<int, array<string, mixed>>
     */
    public function getFields(
        string $entityType,
        string $formCode,
        DataObject|CustomAttributesDataInterface|null $entity = null
    ): array
    {
        try {
            $collection = $this->metadataProvider->loadAttributesCollection($entityType, $formCode);
        } catch (\Throwable $e) {
            $this->logger->error(
                'User attributes of form ' . $formCode . ' could not be loaded',
                ['exception' => $e]
            );
            return [];
        }

        $fields = [];
        foreach ($collection as $attribute) {
            if (!$attribute instanceof Attribute) {
                continue;
            }
            try {
                $field = $this->toField($attribute, $entity);
            } catch (\Throwable $e) {
                $this->logger->error(
                    'User attribute ' . $attribute->getAttributeCode() . ' could not be rendered',
                    ['exception' => $e]
                );
                continue;
            }
            if ($field !== null) {
                $fields[] = $field;
            }
        }
        return $fields;
    }

    /**
     * Store date format of the posted dates (the format core's date filter parses).
     *
     * The browser converts the ISO value of a native date input to it before submit
     * (form/date-format-js.phtml).
     *
     * @return string
     */
    public function getDateFormat(): string
    {
        return (string) preg_replace('/[^MmDdYy\/\.\-]/', '', (string) $this->timezone->getDateFormatWithLongYear());
    }

    /**
     * Field of one attribute, null when the generic renderer skips it.
     *
     * @param Attribute $attribute
     * @param DataObject|CustomAttributesDataInterface|null $entity
     * @return array<string, mixed>|null
     */
    private function toField(Attribute $attribute, DataObject|CustomAttributesDataInterface|null $entity): ?array
    {
        $code = (string) $attribute->getAttributeCode();
        if ($code === ''
            || isset($this->excluded[$code])
            || !(int) $attribute->getIsUserDefined()
            || !(int) $attribute->getIsVisible()
        ) {
            return null;
        }
        $input = (string) $attribute->getFrontendInput();
        if (!in_array($input, self::SUPPORTED_INPUTS, true)) {
            if (!isset($this->skipLogged[$code])) {
                $this->skipLogged[$code] = true;
                $this->logger->debug(
                    'User attribute ' . $code . ' skipped: input type "' . $input . '" has no generic field'
                );
            }
            return null;
        }

        $rules = [];
        foreach ((array) $attribute->getValidateRules() as $key => $rule) {
            if (in_array($key, self::RULE_KEYS, true) && $rule !== null && $rule !== '') {
                $rules[$key] = is_numeric($rule) ? (int) $rule : (string) $rule;
            }
        }

        $field = [
            'code' => $code,
            'label' => (string) ($attribute->getStoreLabel() ?: $code),
            'input' => $input,
            'required' => (bool) $attribute->getIsRequired(),
            'options' => $this->options($attribute, $input),
            'rules' => $rules,
            'value' => $this->value($code, $input, $entity),
        ];
        if ($input === 'multiline') {
            $field['lines'] = max(1, (int) $attribute->getMultilineCount());
        }
        return $field;
    }

    /**
     * Options of a select or multiselect attribute, values as strings.
     *
     * @param Attribute $attribute
     * @param string $input
     * @return array<int, array{value: string, label: string}>
     */
    private function options(Attribute $attribute, string $input): array
    {
        if ($input !== 'select' && $input !== 'multiselect') {
            return [];
        }
        $options = [];
        foreach ((array) $attribute->getSource()->getAllOptions() as $option) {
            if (!is_array($option) || !isset($option['value']) || is_array($option['value'])) {
                continue;
            }
            $value = (string) $option['value'];
            if ($value === '') {
                continue;
            }
            $options[] = ['value' => $value, 'label' => (string) ($option['label'] ?? $value)];
        }
        return $options;
    }

    /**
     * Current value of the attribute on the entity, shaped for its input.
     *
     * @param string $code
     * @param string $input
     * @param DataObject|CustomAttributesDataInterface|null $entity
     * @return string|string[]
     */
    private function value(
        string $code,
        string $input,
        DataObject|CustomAttributesDataInterface|null $entity
    ): string|array
    {
        $raw = null;
        if ($entity instanceof CustomAttributesDataInterface) {
            $raw = $entity->getCustomAttribute($code)?->getValue();
        }
        if ($raw === null && $entity instanceof DataObject) {
            $raw = $entity->getData($code);
        }

        if ($input === 'multiselect' || $input === 'multiline') {
            $parts = is_array($raw) ? $raw : ($raw === null || $raw === '' ? [] : explode(
                $input === 'multiline' ? "\n" : ',',
                (string) $raw
            ));
            return array_values(array_map(static fn ($part): string => (string) $part, $parts));
        }
        if (is_array($raw)) {
            $raw = implode(',', $raw);
        }
        $value = $raw === null ? '' : (string) $raw;
        if ($input === 'date') {
            return preg_match('/^\d{4}-\d{2}-\d{2}/', $value) === 1 ? substr($value, 0, 10) : '';
        }
        return $value;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

/**
 * The address fields whose change makes the checkout ask for new shipping
 * rates (`hyperion_checkout/shipping/rate_fields`).
 *
 * Country, region and postcode always count: a stored value without them is
 * completed by `resolve()`. `region` stands for the region id and the
 * free-text region.
 */
class RateFields implements OptionSourceInterface
{
    public const CONFIG_PATH = 'hyperion_checkout/shipping/rate_fields';

    public const REQUIRED = ['country_id', 'region', 'postcode'];

    public const OPTIONAL = ['city', 'street'];

    /**
     * @inheritdoc
     *
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => 'country_id', 'label' => __('Country (always)')],
            ['value' => 'region', 'label' => __('State/Province (always)')],
            ['value' => 'postcode', 'label' => __('Zip/Postal Code (always)')],
            ['value' => 'city', 'label' => __('City')],
            ['value' => 'street', 'label' => __('Street Address')],
        ];
    }

    /**
     * The field list a stored configuration value stands for: the three
     * fixed fields first, then the optional ones it names, unknown names
     * dropped.
     *
     * @return string[]
     */
    public function resolve(?string $configured): array
    {
        $chosen = array_map('trim', explode(',', (string)$configured));
        $fields = self::REQUIRED;
        foreach (self::OPTIONAL as $field) {
            if (in_array($field, $chosen, true)) {
                $fields[] = $field;
            }
        }
        return $fields;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

/**
 * Which shipping rate the checkout selects when the shopper has not chosen
 * one and more than one is offered (`hyperion_checkout/shipping/preselect`).
 */
class ShippingPreselect implements OptionSourceInterface
{
    public const CONFIG_PATH = 'hyperion_checkout/shipping/preselect';

    public const CHEAPEST = 'cheapest';

    public const FIRST = 'first';

    public const NONE = 'none';

    /**
     * @inheritdoc
     *
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => self::CHEAPEST, 'label' => __('The cheapest method')],
            ['value' => self::FIRST, 'label' => __('The first method listed')],
            ['value' => self::NONE, 'label' => __('None (the shopper chooses)')],
        ];
    }

    /**
     * The mode a stored configuration value stands for; an unknown or empty
     * value is the cheapest method.
     */
    public function resolve(?string $configured): string
    {
        $value = trim((string)$configured);
        return in_array($value, [self::CHEAPEST, self::FIRST, self::NONE], true) ? $value : self::CHEAPEST;
    }
}

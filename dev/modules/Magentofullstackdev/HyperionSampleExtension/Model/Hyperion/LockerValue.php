<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model\Hyperion;

use Magento\Quote\Api\Data\CartInterface;
use Magento\Quote\Model\Quote;
use Magentofullstackdev\HyperionCheckout\Api\ShippingExtensionValueProviderInterface;
use Magentofullstackdev\HyperionSampleExtension\Model\Carrier\Locker;
use Magentofullstackdev\HyperionSampleExtension\Model\LockerPoints;
use Magentofullstackdev\HyperionSampleExtension\Plugin\ShippingInformationManagementPlugin;

/**
 * What the quote already holds for the picker: the stored point of the
 * locker method, so a reload restores the choice and its summary.
 */
class LockerValue implements ShippingExtensionValueProviderInterface
{
    /**
     * @param LockerPoints $lockerPoints
     */
    public function __construct(
        private readonly LockerPoints $lockerPoints
    ) {
    }

    /**
     * @inheritDoc
     */
    public function getValue(CartInterface $quote): ?array
    {
        if (!$quote instanceof Quote || $quote->isVirtual()) {
            return null;
        }
        $address = $quote->getShippingAddress();
        if (!str_starts_with((string) $address->getShippingMethod(), Locker::CODE . '_')) {
            return null;
        }
        $point = $this->lockerPoints->get((string) $address->getData(ShippingInformationManagementPlugin::COLUMN));
        if ($point === null) {
            return null;
        }

        return [
            'address' => ['hyperion_sample_locker_id' => $point['id']],
            'summary' => ['label' => (string) __('Pickup point'), 'lines' => $this->lockerPoints->summaryLines($point)],
            'state' => ['pointId' => $point['id']],
        ];
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model;

use Magento\Checkout\Api\Data\ShippingInformationInterface;

/**
 * The pickup point id the storefront sent in
 * shipping_address.extension_attributes.hyperion_sample_locker_id.
 */
class LockerIdReader
{
    /**
     * The id, an empty string when none was sent.
     *
     * @param ShippingInformationInterface $addressInformation
     * @return string
     */
    public function read(ShippingInformationInterface $addressInformation): string
    {
        $extension = $addressInformation->getShippingAddress()->getExtensionAttributes();
        if ($extension === null || !method_exists($extension, 'getHyperionSampleLockerId')) {
            return '';
        }

        return trim((string) $extension->getHyperionSampleLockerId());
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Plugin;

use Magento\Framework\DataObject;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Address\ToOrderAddress;
use Magento\Sales\Api\Data\OrderAddressInterface;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;

/**
 * Copies the pickup point from the quote address to the order address.
 *
 * A `fieldset.xml` entry is not enough: core's converter reads the fieldset
 * into an array, then fills the order address through
 * `DataObjectHelper::populateWithArray()` against OrderAddressInterface,
 * which only calls the interface's setters and drops any other column.
 */
class ToOrderAddressPlugin
{
    /**
     * @param Config $config
     */
    public function __construct(
        private readonly Config $config
    ) {
    }

    /**
     * Set the column on the converted address.
     *
     * @param ToOrderAddress $subject
     * @param OrderAddressInterface $result
     * @param Address $object
     * @return OrderAddressInterface
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterConvert(ToOrderAddress $subject, OrderAddressInterface $result, Address $object)
    {
        if (!$this->config->isEnabled() || !$result instanceof DataObject) {
            return $result;
        }
        $lockerId = $object->getData(ShippingInformationManagementPlugin::COLUMN);
        if (is_string($lockerId) && $lockerId !== '') {
            $result->setData(ShippingInformationManagementPlugin::COLUMN, $lockerId);
        }

        return $result;
    }
}

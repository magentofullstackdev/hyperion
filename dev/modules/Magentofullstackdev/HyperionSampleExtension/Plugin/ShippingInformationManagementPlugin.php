<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Plugin;

use Magento\Checkout\Api\Data\ShippingInformationInterface;
use Magento\Checkout\Model\ShippingInformationManagement;
use Magento\Framework\Exception\InputException;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\ResourceModel\Quote\Address as AddressResource;
use Magentofullstackdev\HyperionSampleExtension\Model\Carrier\Locker;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;
use Magentofullstackdev\HyperionSampleExtension\Model\LockerIdReader;
use Magentofullstackdev\HyperionSampleExtension\Model\LockerPoints;

/**
 * Server half of the pickup point picker: the locker method is only saved
 * with a known point, which is stored on the quote's shipping address
 * (column `hyperion_sample_locker_id`, copied to the order address). Any
 * other method clears it. Guests pass here too: the guest management calls
 * this class with the unmasked cart id. While the module is switched off
 * (hyperion_sample_extension/general/enabled) it does nothing at all.
 */
class ShippingInformationManagementPlugin
{
    public const COLUMN = 'hyperion_sample_locker_id';

    /**
     * @param LockerPoints $lockerPoints
     * @param LockerIdReader $lockerIdReader
     * @param CartRepositoryInterface $cartRepository
     * @param AddressResource $addressResource
     * @param Config $config
     */
    public function __construct(
        private readonly LockerPoints $lockerPoints,
        private readonly LockerIdReader $lockerIdReader,
        private readonly CartRepositoryInterface $cartRepository,
        private readonly AddressResource $addressResource,
        private readonly Config $config
    ) {
    }

    /**
     * Refuse the locker method without a known point, before anything is saved.
     *
     * @param ShippingInformationManagement $subject
     * @param int|string $cartId
     * @param ShippingInformationInterface $addressInformation
     * @return null
     * @throws InputException
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeSaveAddressInformation(
        ShippingInformationManagement $subject,
        $cartId,
        ShippingInformationInterface $addressInformation
    ) {
        if (!$this->config->isEnabled() || !$this->isLocker($addressInformation)) {
            return null;
        }
        $id = $this->lockerIdReader->read($addressInformation);
        if ($id === '' || $this->lockerPoints->get($id) === null) {
            throw new InputException(__('The selected pickup point is not available.'));
        }

        return null;
    }

    /**
     * Store the point of the locker method, clear it for any other method.
     *
     * @param ShippingInformationManagement $subject
     * @param mixed $result
     * @param int|string $cartId
     * @param ShippingInformationInterface $addressInformation
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterSaveAddressInformation(
        ShippingInformationManagement $subject,
        $result,
        $cartId,
        ShippingInformationInterface $addressInformation
    ) {
        if (!$this->config->isEnabled()) {
            return $result;
        }
        $id = $this->isLocker($addressInformation) ? $this->lockerIdReader->read($addressInformation) : '';
        $quote = $this->cartRepository->getActive((int) $cartId);
        if (!$quote instanceof Quote) {
            return $result;
        }
        $address = $quote->getShippingAddress();
        $stored = (string) $address->getData(self::COLUMN);
        if ($stored === $id) {
            return $result;
        }
        $address->setData(self::COLUMN, $id === '' ? null : $id);
        $this->addressResource->save($address);

        return $result;
    }

    /**
     * Whether the saved method is the locker method.
     *
     * @param ShippingInformationInterface $addressInformation
     * @return bool
     */
    private function isLocker(ShippingInformationInterface $addressInformation): bool
    {
        return (string) $addressInformation->getShippingCarrierCode() === Locker::CODE;
    }
}

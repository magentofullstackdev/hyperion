<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart;

use Magento\Customer\Model\Address as CustomerAddress;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Quote\Model\Quote\Address;

/**
 * Destinations of the cart shipping estimator (country, region, postcode):
 * the one a quote address carries and the default shipping address of the
 * logged-in customer.
 */
class EstimateDestination
{
    /**
     * @param CustomerSession $customerSession
     */
    public function __construct(
        private readonly CustomerSession $customerSession
    ) {
    }

    /**
     * Country, region and postcode of a quote address.
     *
     * @param Address $address
     * @return array{country_id: string, region_id: string, region: string, postcode: string}
     */
    public function ofAddress(Address $address): array
    {
        return [
            'country_id' => (string) $address->getCountryId(),
            'region_id' => (int) $address->getRegionId() > 0 ? (string) (int) $address->getRegionId() : '',
            'region' => (string) $address->getRegion(),
            'postcode' => (string) $address->getPostcode(),
        ];
    }

    /**
     * A destination is more than a country: a region or a postcode.
     *
     * @param array<string, string> $destination country_id, region_id, region, postcode
     * @return bool
     */
    public function isSet(array $destination): bool
    {
        return $destination['region_id'] !== '' || $destination['region'] !== '' || $destination['postcode'] !== '';
    }

    /**
     * The logged-in customer's default shipping address with a country, null
     * for a guest or a customer without one. Callers render or answer
     * `cacheable="false"` content, so the customer session is not
     * depersonalized when this is read.
     *
     * @return array{country_id: string, region_id: string, region: string, postcode: string}|null
     */
    public function customerDefault(): ?array
    {
        if (!$this->customerSession->isLoggedIn()) {
            return null;
        }
        $default = $this->customerSession->getCustomer()->getDefaultShippingAddress();
        if (!$default instanceof CustomerAddress) {
            return null;
        }
        $data = $default->getDataModel();
        $country = (string) $data->getCountryId();
        if ($country === '') {
            return null;
        }
        $region = $data->getRegion();
        $regionId = $region !== null ? (int) $region->getRegionId() : 0;

        return [
            'country_id' => $country,
            'region_id' => $regionId > 0 ? (string) $regionId : '',
            'region' => $region !== null ? (string) $region->getRegion() : '',
            'postcode' => (string) $data->getPostcode(),
        ];
    }

    /**
     * Whether the rates of the customer's default address can stand in for
     * the address: it has no rates and no destination of its own, and the
     * customer has a default shipping address.
     *
     * @param Address $address the shipping address of a quote that ships
     * @return bool
     */
    public function canPrefill(Address $address): bool
    {
        return $address->getGroupedAllShippingRates() === []
            && !$this->isSet($this->ofAddress($address))
            && $this->customerDefault() !== null;
    }

    /**
     * Collect the rates of the customer's default shipping address on the
     * quote address, in memory: nothing is saved, so the quote keeps no
     * destination until the shopper picks a rate.
     *
     * @param Address $address the shipping address of a quote that ships
     * @return bool whether a collection ran
     */
    public function prefill(Address $address): bool
    {
        if (!$this->canPrefill($address)) {
            return false;
        }
        $default = $this->customerDefault();
        if ($default === null) {
            return false;
        }
        $address->setCountryId($default['country_id']);
        $address->setRegionId($default['region_id'] !== '' ? (int) $default['region_id'] : null);
        $address->setRegion($default['region'] !== '' ? $default['region'] : null);
        $address->setPostcode($default['postcode'] !== '' ? $default['postcode'] : null);
        $address->setCollectShippingRates(true);
        $address->collectShippingRates();

        return true;
    }
}

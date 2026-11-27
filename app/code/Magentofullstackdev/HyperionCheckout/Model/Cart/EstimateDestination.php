<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Address as CustomerAddress;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;

/**
 * Destinations of the cart shipping estimator (country, region, postcode):
 * the one a quote address carries and the default shipping address of the
 * logged-in customer.
 *
 * A cart that belongs to a customer while the session is not signed in (a
 * cart Persistent Shopping Cart restored for a visitor the cookie remembers)
 * carries the destination the customer wrote. The estimator shows that
 * destination, its rates and its method only once this session entered the
 * destination itself (`rememberEntered()`, called by the estimate request);
 * until then it starts like a guest's estimator. Whether a cart belongs to a
 * customer is read from the quote's customer id, as the checkout page and
 * the guest cart reads decide it.
 */
class EstimateDestination
{
    /** Checkout session key: the quote and the destination this session entered for it. */
    private const ENTERED_KEY = 'hyperion_estimate_entered';

    /**
     * @param CustomerSession $customerSession
     * @param CheckoutSession $checkoutSession
     */
    public function __construct(
        private readonly CustomerSession $customerSession,
        private readonly CheckoutSession $checkoutSession
    ) {
    }

    /**
     * The destination of the quote's shipping address the estimator may show.
     *
     * All of it, or none (every field empty) for a customer's cart of a
     * session that is not signed in, unless this session entered it.
     *
     * @param Quote $quote
     * @return array{country_id: string, region_id: string, region: string, postcode: string}
     */
    public function ofQuote(Quote $quote): array
    {
        $destination = $this->ofAddress($quote->getShippingAddress());
        if (!$this->isRememberedCart($quote) || $this->wasEntered($quote, $destination)) {
            return $destination;
        }

        return ['country_id' => '', 'region_id' => '', 'region' => '', 'postcode' => ''];
    }

    /**
     * Whether the estimator may show what the quote's shipping address carries.
     *
     * That is its destination, its rates and its applied method; see `ofQuote()`.
     *
     * @param Quote $quote
     * @return bool
     */
    public function mayShow(Quote $quote): bool
    {
        return !$this->isRememberedCart($quote)
            || $this->wasEntered($quote, $this->ofAddress($quote->getShippingAddress()));
    }

    /**
     * The destination just set on the quote's shipping address, taken before the save.
     *
     * For a customer's cart of a session that is not signed in, the address
     * is also detached from the address book entry it was copied from: core
     * imports that entry again when a quote address that references one is
     * saved, which would replace what this session typed with the customer's
     * saved address.
     *
     * @param Quote $quote
     * @return array{country_id: string, region_id: string, region: string, postcode: string}
     */
    public function takeEntered(Quote $quote): array
    {
        $address = $quote->getShippingAddress();
        if ($this->isRememberedCart($quote)) {
            $address->setCustomerAddressId(null);
        }

        return $this->ofAddress($address);
    }

    /**
     * Records a destination as entered by this session.
     *
     * Only for a customer's cart of a session that is not signed in:
     * `ofQuote()` and `mayShow()` show it back while the quote still carries
     * exactly that destination. The destination is the one the request
     * posted (`takeEntered()`), never what the address holds after the save,
     * so a save that changed the address shows nothing. Only a digest is
     * kept; nothing is stored for any other cart.
     *
     * @param Quote $quote
     * @param array{country_id: string, region_id: string, region: string, postcode: string} $entered
     * @return void
     */
    public function rememberEntered(Quote $quote, array $entered): void
    {
        if (!$this->isRememberedCart($quote)) {
            return;
        }
        // The session stores any key through its magic accessors (SessionManager::__call()).
        // @phpstan-ignore method.notFound
        $this->checkoutSession->setData(self::ENTERED_KEY, [
            'quote_id' => (int) $quote->getId(),
            'destination' => $this->fingerprint($entered),
        ]);
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

    /**
     * Whether the quote belongs to a customer while the session is not signed in.
     *
     * @param Quote $quote
     * @return bool
     */
    private function isRememberedCart(Quote $quote): bool
    {
        return (int) $quote->getData('customer_id') > 0 && !$this->customerSession->isLoggedIn();
    }

    /**
     * Whether this session entered `$destination` for this quote.
     *
     * @param Quote $quote
     * @param array<string, string> $destination country_id, region_id, region, postcode
     * @return bool
     */
    private function wasEntered(Quote $quote, array $destination): bool
    {
        $entered = $this->checkoutSession->getData(self::ENTERED_KEY);

        return is_array($entered)
            && (int) ($entered['quote_id'] ?? 0) === (int) $quote->getId()
            && ($entered['destination'] ?? null) === $this->fingerprint($destination);
    }

    /**
     * A digest of a destination.
     *
     * The region text counts only without a region id: core fills the text
     * in from the id when the address is read again.
     *
     * @param array<string, string> $destination country_id, region_id, region, postcode
     * @return string
     */
    private function fingerprint(array $destination): string
    {
        return hash('sha256', implode("\n", [
            $destination['country_id'],
            $destination['region_id'],
            $destination['region_id'] === '' ? $destination['region'] : '',
            $destination['postcode'],
        ]));
    }
}

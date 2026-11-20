<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Quote\Model\Quote;
use Psr\Log\LoggerInterface;

/**
 * What a GUEST quote already carries, for the Lit checkout to hydrate from
 * (`checkoutConfig.hyperion.guestQuote`).
 *
 * The quote is the source of truth of the checkout: the shipping address,
 * the billing address and the email are saved on it by the
 * `shipping-information` and `billing-address` calls, and core's own
 * `selectedShippingMethod` carries the chosen rate. A reload of the page
 * must therefore show the same email, address and rate. Core's
 * `DefaultConfigProvider` emits the customer's data for a logged in
 * customer only (the guest keys it has, `shippingAddressFromData`, depend
 * on the address email and on the customer address attribute metadata),
 * so this provider emits the guest's state in the checkout's own shape:
 *
 * - `email`: the quote email, or the email of the shipping / billing address.
 * - `shippingAddress`: the quote shipping address when it has a country.
 * - `billingAddress`: the quote billing address when it has a country AND
 *   differs from the shipping address (or the quote is virtual); null means
 *   "billing same as shipping".
 *
 * Addresses are emitted flat (`region` name, `region_id`, `region_code`,
 * `street` as a list, `QuoteAddressExporter`); the bundle normalizes them into
 * its `Address` shape (`utils/checkout-config.ts`). Null for a logged in
 * customer (core's `customerData` and `hyperion.initial` are the sources
 * there) and for a quote that belongs to a customer who is not logged in.
 */
class GuestQuoteConfigProvider implements ConfigProviderInterface
{
    public function __construct(
        private readonly CheckoutSession $checkoutSession,
        private readonly CustomerSession $customerSession,
        private readonly LoggerInterface $logger,
        private readonly QuoteAddressExporter $addressExporter
    ) {
    }

    /**
     * @inheritdoc
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        return ['hyperion' => ['guestQuote' => $this->buildGuestQuote()]];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildGuestQuote(): ?array
    {
        if ($this->customerSession->isLoggedIn()) {
            return null;
        }
        try {
            $quote = $this->checkoutSession->getQuote();
        } catch (\Exception $e) {
            $this->logger->error('Hyperion checkout: guest quote config unavailable: ' . $e->getMessage());
            return null;
        }
        // A quote with a customer id whose visitor is not logged in was
        // restored from the persistent cart cookie: its data belongs to the
        // customer, not to whoever holds the cookie.
        if (!$quote->getId() || $quote->getData('customer_id')) {
            return null;
        }

        $shipping = $quote->getIsVirtual() ? null : $this->addressExporter->export($quote->getShippingAddress());
        $billing = $this->addressExporter->export($quote->getBillingAddress());
        if ($billing !== null && $shipping !== null && $this->addressExporter->isSame($shipping, $billing)) {
            $billing = null;
        }

        return [
            'email' => $this->resolveEmail($quote),
            'shippingAddress' => $shipping,
            'billingAddress' => $billing,
        ];
    }

    private function resolveEmail(Quote $quote): ?string
    {
        foreach ([
            $quote->getData('customer_email'),
            $quote->getShippingAddress()->getEmail(),
            $quote->getBillingAddress()->getEmail(),
        ] as $email) {
            $email = trim((string)$email);
            if ($email !== '') {
                return $email;
            }
        }
        return null;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magentofullstackdev\HyperionCheckout\Model\Config\Source\RateFields;
use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Reflection\DataObjectProcessor;
use Magento\Quote\Api\Data\ShippingMethodInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Model\Cart\ShippingMethodConverter;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\ResourceModel\Quote\Address\CollectionFactory as AddressCollectionFactory;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;

/**
 * What the quote already holds when the checkout page is rendered
 * (`checkoutConfig.hyperion.initial`), so a returning shopper's checkout
 * starts with its shipping rates, payment methods and applied shipping
 * method in place instead of asking for them again.
 *
 * Emitted only when all of this holds, null otherwise:
 *
 * - the quote has items and is not virtual;
 * - its shipping address has a country and a shipping method;
 * - that address has a stored rate with that code which is not an error;
 * - the visitor owns the data: a logged in customer, or a guest whose quote
 *   has no customer id (a quote restored from the persistent cart cookie
 *   belongs to a customer who is not logged in).
 *
 * Everything is read, nothing is computed again: no carrier is asked, no
 * total is collected and the quote is not saved.
 *
 * The addresses are the PERSISTED rows of the quote, loaded here by quote
 * id, not the address objects of the session quote. The checkout page
 * controller assigns the customer to the quote, which copies the customer's
 * default addresses over the address fields in memory; the rows in the
 * database still hold what the shopper chose, and they are what the next
 * web API call works on.
 *
 * `shippingMethods` are the stored rates in the shape of the web API
 * (`ShippingMethodInterface`). After a shipping method was saved the quote
 * stores the rates of the chosen carrier only, so the list can be shorter
 * than a fresh estimate: it is enough to show and confirm the applied
 * method, and the bundle asks for the full list once it runs.
 *
 * `paymentMethods` are evaluated by core against the session quote, the
 * way `payment-information` evaluates them on its next call.
 */
class InitialStateConfigProvider implements ConfigProviderInterface
{
    public function __construct(
        private readonly CheckoutSession $checkoutSession,
        private readonly CustomerSession $customerSession,
        private readonly AddressCollectionFactory $addressCollectionFactory,
        private readonly ShippingMethodConverter $shippingMethodConverter,
        private readonly DataObjectProcessor $dataObjectProcessor,
        private readonly PaymentMethodManagementInterface $paymentMethodManagement,
        private readonly QuoteAddressExporter $addressExporter,
        private readonly RateFields $rateFields,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        try {
            $initial = $this->build($this->checkoutSession->getQuote(), $this->customerSession->isLoggedIn());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: initial state config unavailable: ' . $e->getMessage());
            $initial = null;
        }
        return ['hyperion' => ['initial' => $initial]];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function build(Quote $quote, bool $loggedIn): ?array
    {
        $quoteId = (int)$quote->getId();
        if ($quoteId === 0 || !$quote->hasItems() || $quote->isVirtual()) {
            return null;
        }
        if (!$loggedIn && $quote->getData('customer_id')) {
            return null;
        }

        [$shipping, $billing] = $this->loadPersistedAddresses($quoteId);
        if ($shipping === null || trim((string)$shipping->getCountryId()) === '') {
            return null;
        }
        $code = trim((string)$shipping->getShippingMethod());
        if ($code === '') {
            return null;
        }
        // The rate models read the tax class of the customer through their address.
        $shipping->setQuote($quote);
        $applied = $shipping->getShippingRateByCode($code);
        if (!$applied
            || trim((string)$applied->getData('error_message')) !== ''
            || trim((string)$applied->getData('method')) === ''
        ) {
            return null;
        }

        return [
            'shippingMethods' => $this->storedShippingMethods(
                $shipping,
                (string)$quote->getData('quote_currency_code')
            ),
            'paymentMethods' => $this->paymentMethods($quoteId),
            'appliedShippingMethod' => [
                'carrier_code' => (string)$applied->getData('carrier'),
                'method_code' => (string)$applied->getData('method'),
            ],
            'quoteAddresses' => $loggedIn ? $this->quoteAddresses($shipping, $billing) : null,
            'fingerprint' => $this->fingerprint($quote, $shipping),
        ];
    }

    /**
     * The shipping and the billing address row of the quote as stored. No
     * shipping address when the quote has none or more than one.
     *
     * @return array{0: ?Address, 1: ?Address}
     */
    private function loadPersistedAddresses(int $quoteId): array
    {
        $shipping = [];
        $billing = null;
        foreach ($this->addressCollectionFactory->create()->setQuoteFilter($quoteId)->getItems() as $address) {
            if (!$address instanceof Address) {
                continue;
            }
            $type = (string)$address->getData('address_type');
            if ($type === Address::ADDRESS_TYPE_SHIPPING) {
                $shipping[] = $address;
            } elseif ($type === Address::ADDRESS_TYPE_BILLING && $billing === null) {
                $billing = $address;
            }
        }
        return [count($shipping) === 1 ? $shipping[0] : null, $billing];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function storedShippingMethods(Address $shipping, string $currencyCode): array
    {
        $methods = [];
        foreach ($shipping->getGroupedAllShippingRates() as $carrierRates) {
            foreach ($carrierRates as $rate) {
                $methods[] = $this->dataObjectProcessor->buildOutputDataArray(
                    $this->shippingMethodConverter->modelToDataObject($rate, $currencyCode),
                    ShippingMethodInterface::class
                );
            }
        }
        return $methods;
    }

    /**
     * @return array<int, array{code: string, title: string}>
     */
    private function paymentMethods(int $quoteId): array
    {
        $methods = [];
        foreach ($this->paymentMethodManagement->getList($quoteId) as $method) {
            $methods[] = ['code' => (string)$method->getCode(), 'title' => (string)$method->getTitle()];
        }
        return $methods;
    }

    /**
     * @return array{shipping: array<string, mixed>, billing: array<string, mixed>|null, billingSameAsShipping: bool}
     */
    private function quoteAddresses(Address $shipping, ?Address $billing): array
    {
        $shippingData = $this->customerAddress($shipping) ?? [];
        $billingData = $billing === null ? null : $this->customerAddress($billing);
        if ($billingData !== null
            && $billingData['customer_address_id'] === ($shippingData['customer_address_id'] ?? null)
            && $this->addressExporter->isSame($shippingData, $billingData)
        ) {
            $billingData = null;
        }
        return [
            'shipping' => $shippingData,
            'billing' => $billingData,
            'billingSameAsShipping' => $billingData === null,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function customerAddress(Address $address): ?array
    {
        $data = $this->addressExporter->export($address);
        if ($data === null) {
            return null;
        }
        $addressId = (int)$address->getData('customer_address_id');
        $data['customer_address_id'] = $addressId > 0 ? $addressId : null;
        $data['same_as_billing'] = (bool)$address->getData('same_as_billing');
        return $data;
    }

    /**
     * A hash of what the stored rates were collected for: the address
     * fields that decide the rates and the content of the cart.
     */
    private function fingerprint(Quote $quote, Address $shipping): string
    {
        $fields = $this->rateFields->resolve($this->scopeConfig->getValue(
            RateFields::CONFIG_PATH,
            ScopeInterface::SCOPE_STORE
        ));
        $parts = [];
        foreach ($fields as $field) {
            $parts[] = match ($field) {
                'region' => (string)($shipping->getData('region_id') ?: $shipping->getData('region')),
                'postcode' => strtoupper(trim((string)$shipping->getData('postcode'))),
                'street' => implode("\n", array_map('strval', (array)$shipping->getStreet())),
                default => trim((string)$shipping->getData($field)),
            };
        }
        $parts[] = (string)(int)$quote->getItemsCount();
        $parts[] = (string)(float)$quote->getItemsQty();
        $parts[] = (string)(float)$quote->getData('subtotal');
        return sha1(implode('|', $parts));
    }
}

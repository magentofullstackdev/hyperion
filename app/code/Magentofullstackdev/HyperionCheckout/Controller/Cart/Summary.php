<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Controller\Cart;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\QuoteIdMaskFactory;
use Magento\Quote\Model\QuoteIdToMaskedQuoteIdInterface;
use Magento\Quote\Model\ResourceModel\Quote\QuoteIdMask as QuoteIdMaskResource;
use Magentofullstackdev\HyperionCheckout\ViewModel\CartData;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Psr\Log\LoggerInterface;

/**
 * GET hyperion/cart/summary: the visitor's cart as JSON, for the express
 * buttons of cached pages (`ExpressContext.getCart()`), which carry no
 * session data of their own.
 *
 * Answer (`CartSummary`): `cartId`, `isGuest`,
 * `isVirtual`, `itemsCount`, and the totals twice, `display` in the quote
 * currency and `base` in the base currency (what a gateway charges), each
 * `{ currency, grandTotal, subtotal, shipping, tax, discount }` as numbers in
 * major units, signs as core's REST totals give them. An empty cart answers
 * `null`. Always `private, no-store`; rate limited as the `cart_summary`
 * route group (etc/frontend/di.xml).
 *
 * Guest means "not signed in", decided by the customer session, never by
 * the quote: a cart restored from a persistent cookie carries a customer id
 * while its visitor is not signed in. Such a visitor is a guest here, like
 * in the checkout, and gets the masked id (created when the quote has none
 * yet); the quote id itself is only given to the signed-in customer. The
 * answer holds no email, name or address in any state.
 */
class Summary implements HttpGetActionInterface
{
    /**
     * @param CheckoutSession $checkoutSession
     * @param CustomerSession $customerSession
     * @param CartData $cartData
     * @param QuoteIdToMaskedQuoteIdInterface $quoteIdToMaskedQuoteId
     * @param QuoteIdMaskFactory $quoteIdMaskFactory
     * @param QuoteIdMaskResource $quoteIdMaskResource
     * @param RawFactory $rawFactory
     * @param CacheHeaders $cacheHeaders
     * @param Json $json
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CheckoutSession $checkoutSession,
        private readonly CustomerSession $customerSession,
        private readonly CartData $cartData,
        private readonly QuoteIdToMaskedQuoteIdInterface $quoteIdToMaskedQuoteId,
        private readonly QuoteIdMaskFactory $quoteIdMaskFactory,
        private readonly QuoteIdMaskResource $quoteIdMaskResource,
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly Json $json,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return Raw
     */
    public function execute(): Raw
    {
        $status = 200;
        try {
            $summary = $this->summary();
            $body = $summary === null ? 'null' : (string) $this->json->serialize($summary);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion cart summary: failed', ['exception' => $e]);
            $status = 500;
            $body = 'null';
        }

        $response = $this->rawFactory->create();
        $response->setHttpResponseCode($status);
        $response->setHeader('Content-Type', 'application/json; charset=UTF-8', true);
        $response->setContents($body);

        return $this->cacheHeaders->applyPrivate($response);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function summary(): ?array
    {
        $quote = $this->checkoutSession->getQuote();
        $quoteId = (int) $quote->getId();
        if ($quoteId === 0 || !$quote->hasItems()) {
            return null;
        }
        $isGuest = !$this->customerSession->isLoggedIn();
        $address = $quote->isVirtual() ? $quote->getBillingAddress() : $quote->getShippingAddress();

        return [
            'cartId' => $isGuest ? $this->maskedId($quoteId) : (string) $quoteId,
            'isGuest' => $isGuest,
            'isVirtual' => $this->cartData->isVirtual(),
            'itemsCount' => $this->cartData->getItemCount(),
            'display' => [
                'currency' => (string) $quote->getData('quote_currency_code'),
                'grandTotal' => $this->cartData->getGrandTotal(),
                'subtotal' => $this->cartData->getSubtotal(),
                'shipping' => $this->cartData->getShippingAmount(),
                'tax' => $this->cartData->getTaxAmount(),
                'discount' => $this->cartData->getDiscountAmount(),
            ],
            'base' => $this->baseTotals($quote, $address),
        ];
    }

    /**
     * The masked id of a quote, created when the quote has none (a customer's cart restored
     * for a visitor who is not signed in): the guest cart endpoints only know masked ids.
     *
     * @param int $quoteId
     * @return string
     */
    private function maskedId(int $quoteId): string
    {
        $masked = (string) $this->quoteIdToMaskedQuoteId->execute($quoteId);
        if ($masked !== '') {
            return $masked;
        }
        $mask = $this->quoteIdMaskFactory->create();
        $mask->setData('quote_id', $quoteId);
        $this->quoteIdMaskResource->save($mask);

        return (string) $mask->getData('masked_id');
    }

    /**
     * @param Quote $quote
     * @param Quote\Address $address
     * @return array<string, mixed>
     */
    private function baseTotals(Quote $quote, Quote\Address $address): array
    {
        return [
            'currency' => (string) $quote->getData('base_currency_code'),
            'grandTotal' => (float) $quote->getData('base_grand_total'),
            'subtotal' => (float) $quote->getData('base_subtotal'),
            'shipping' => (float) $address->getData('base_shipping_amount'),
            'tax' => (float) $address->getData('base_tax_amount'),
            'discount' => (float) $address->getData('base_discount_amount'),
        ];
    }
}

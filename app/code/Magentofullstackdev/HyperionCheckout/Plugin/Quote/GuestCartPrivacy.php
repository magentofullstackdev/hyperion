<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Quote;

use Magento\Customer\Api\Data\CustomerInterfaceFactory;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Quote\Api\Data\AddressInterfaceFactory;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Quote\Api\GuestCartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Psr\Log\LoggerInterface;

/**
 * Keeps the customer's data out of a guest cart read
 * (`GET /V1/guest-carts/:cartId`) when the cart belongs to a customer.
 *
 * A masked cart id is a bearer credential: core answers with the whole
 * quote, and for a customer's quote that is the customer record (email,
 * names, date of birth, every saved address), the billing address and the
 * shipping address of the shipping assignment. A visitor holds such an id
 * when a persistent cart restored the customer's quote, or whenever a
 * customer's masked id leaks in any other way.
 *
 * A cart belongs to a customer when the quote has a customer id: core's own
 * web API checks decide who a cart belongs to that way, and it stays true after
 * a remembered shopper's checkout marked the quote `customer_is_guest`.
 * Then the answer is a detached `RedactedCart`: ids, dates, state, items,
 * counts, currency and store, with an empty customer, an empty billing
 * address, no customer note and no extension attributes. A guest's cart is
 * returned as core loaded it. The loaded quote is never changed: the
 * repository caches it and the order flow uses the same instance.
 *
 * Declared for the `webapi_rest` and `webapi_soap` areas: core serves the
 * same service anonymously over REST (`GET /V1/guest-carts/:cartId`) and
 * SOAP (`quoteGuestCartRepositoryV1Get`), and both turn the answer into data
 * with the same data object processor. The copy answers every field the
 * cart contract requires (the id, the customer, the store); the empty
 * customer and the empty address leave their own required fields without a
 * value, which REST prints as null and SOAP as an empty element, the shape
 * core gives for a guest's cart without an email. When the copy cannot be
 * built for a customer's cart the request is refused as "no such cart"
 * (logged), never answered with core's body.
 */
class GuestCartPrivacy
{
    /**
     * @param CustomerInterfaceFactory $customerFactory
     * @param AddressInterfaceFactory $addressFactory
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CustomerInterfaceFactory $customerFactory,
        private readonly AddressInterfaceFactory $addressFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Returns a copy without the customer's data when the cart belongs to a customer.
     *
     * @param GuestCartRepositoryInterface $subject
     * @param CartInterface $result
     * @param mixed $cartId
     * @return CartInterface
     * @throws NoSuchEntityException when a customer's cart cannot be answered safely
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGet(GuestCartRepositoryInterface $subject, CartInterface $result, $cartId = null): CartInterface
    {
        if (!$this->belongsToCustomer($result)) {
            return $result;
        }
        try {
            return new RedactedCart(
                [
                    CartInterface::KEY_ID => $result->getId(),
                    CartInterface::KEY_CREATED_AT => $result->getCreatedAt(),
                    CartInterface::KEY_UPDATED_AT => $result->getUpdatedAt(),
                    CartInterface::KEY_CONVERTED_AT => $result->getConvertedAt(),
                    CartInterface::KEY_IS_ACTIVE => $result->getIsActive(),
                    CartInterface::KEY_IS_VIRTUAL => $result->getIsVirtual(),
                    CartInterface::KEY_ITEMS => $result->getItems(),
                    CartInterface::KEY_ITEMS_COUNT => $result->getItemsCount(),
                    CartInterface::KEY_ITEMS_QTY => $result->getItemsQty(),
                    CartInterface::KEY_RESERVED_ORDER_ID => $result->getReservedOrderId(),
                    CartInterface::KEY_ORIG_ORDER_ID => $result->getOrigOrderId(),
                    CartInterface::KEY_CURRENCY => $result->getCurrency(),
                    CartInterface::KEY_CUSTOMER_IS_GUEST => $result->getCustomerIsGuest(),
                    CartInterface::KEY_CUSTOMER_NOTE_NOTIFY => $result->getCustomerNoteNotify(),
                    CartInterface::KEY_CUSTOMER_TAX_CLASS_ID => $this->taxClassId($result),
                    CartInterface::KEY_STORE_ID => $result->getStoreId(),
                ],
                $this->customerFactory->create(),
                $this->addressFactory->create()
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: a guest read of a customer cart was refused, its copy could not be built',
                ['exception' => $e]
            );
            throw new NoSuchEntityException(__('No such entity with %fieldName = %fieldValue', [
                'fieldName' => 'cartId',
                'fieldValue' => is_scalar($cartId) ? (string) $cartId : '',
            ]));
        }
    }

    /**
     * The stored tax class of the cart. `Quote::getCustomerTaxClassId()` is not
     * called: it reads the customer group, may load the customer and writes
     * the value back into the quote.
     *
     * @param CartInterface $cart
     * @return mixed
     */
    private function taxClassId(CartInterface $cart): mixed
    {
        return $cart instanceof Quote
            ? $cart->getData(CartInterface::KEY_CUSTOMER_TAX_CLASS_ID)
            : $cart->getCustomerTaxClassId();
    }

    /**
     * Whether the quote has a customer id.
     *
     * @param CartInterface $cart
     * @return bool
     */
    private function belongsToCustomer(CartInterface $cart): bool
    {
        if ($cart instanceof Quote) {
            return (int) $cart->getData('customer_id') > 0;
        }
        return (int) $cart->getCustomer()->getId() > 0;
    }
}

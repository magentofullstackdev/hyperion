<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Quote;

use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\AddressInterface;
use Magento\Quote\Api\Data\AddressInterfaceFactory;
use Magento\Quote\Api\GuestBillingAddressManagementInterface;
use Magento\Quote\Model\MaskedQuoteIdToQuoteIdInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Psr\Log\LoggerInterface;

/**
 * Keeps the billing address of a customer's cart out of a guest read
 * (`GET /V1/guest-carts/:cartId/billing-address`, SOAP
 * `quoteGuestBillingAddressManagementV1Get`): for a cart whose quote has a
 * customer id the answer is an empty address; a guest's cart keeps core's
 * answer. Same rule, reasons and areas as `GuestCartPrivacy`.
 *
 * The owner is read from the quote the address belongs to, or from the
 * masked id when the address does not carry its quote (the repository
 * caches the quote core just loaded). When the cart's owner cannot be read the
 * address is withheld (logged): a guest then gets an empty address, never
 * a customer's address to a stranger. The loaded address is never changed.
 */
class GuestBillingAddressPrivacy
{
    /**
     * @param MaskedQuoteIdToQuoteIdInterface $maskedQuoteIdToQuoteId
     * @param CartRepositoryInterface $cartRepository
     * @param AddressInterfaceFactory $addressFactory
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly MaskedQuoteIdToQuoteIdInterface $maskedQuoteIdToQuoteId,
        private readonly CartRepositoryInterface $cartRepository,
        private readonly AddressInterfaceFactory $addressFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Returns an empty address when the cart belongs to a customer.
     *
     * @param GuestBillingAddressManagementInterface $subject
     * @param AddressInterface $result
     * @param mixed $cartId
     * @return AddressInterface
     * @throws NoSuchEntityException when the empty address cannot be built
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGet(
        GuestBillingAddressManagementInterface $subject,
        AddressInterface $result,
        $cartId = null
    ): AddressInterface {
        try {
            if (!$this->belongsToCustomer($result, $cartId)) {
                return $result;
            }
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: a guest cart with an unknown owner, its billing address is withheld',
                ['exception' => $e]
            );
        }
        try {
            return $this->addressFactory->create();
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: a guest read of a billing address was refused',
                ['exception' => $e]
            );
            throw new NoSuchEntityException(__('No such entity with %fieldName = %fieldValue', [
                'fieldName' => 'cartId',
                'fieldValue' => is_scalar($cartId) ? (string) $cartId : '',
            ]));
        }
    }

    /**
     * Whether the quote behind the address has a customer id.
     *
     * @param AddressInterface $address
     * @param mixed $cartId
     * @return bool
     */
    private function belongsToCustomer(AddressInterface $address, $cartId): bool
    {
        $quote = $address instanceof Address ? $address->getQuote() : null;
        if ($quote === null) {
            $quote = $this->cartRepository->get($this->maskedQuoteIdToQuoteId->execute((string) $cartId));
        }
        if ($quote instanceof Quote) {
            return (int) $quote->getData('customer_id') > 0;
        }
        return (int) $quote->getCustomer()->getId() > 0;
    }
}

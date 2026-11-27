<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Rate;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Payment;

/**
 * Turns the cart into an order after the fake express page, as a wallet
 * would: the wallet's address (a fixed sample address), the cheapest rate
 * for it, the hosted page method.
 */
class ExpressOrder
{
    public const GUEST_EMAIL = 'sample.express@example.com';

    private const SKIPPED_CARRIERS = ['hyperionlocker'];

    private const ADDRESS = [
        'firstname' => 'Sample',
        'lastname' => 'Shopper',
        'street' => '100 Congress Ave',
        'city' => 'Austin',
        'postcode' => '78701',
        'country_id' => 'US',
        'region_id' => 57,
        'region' => 'Texas',
        'telephone' => '5125550100',
    ];

    /**
     * @param CartRepositoryInterface $cartRepository
     * @param CartManagementInterface $cartManagement
     * @param OrderRepositoryInterface $orderRepository
     */
    public function __construct(
        private readonly CartRepositoryInterface $cartRepository,
        private readonly CartManagementInterface $cartManagement,
        private readonly OrderRepositoryInterface $orderRepository
    ) {
    }

    /**
     * Place the order of the cart.
     *
     * @param Quote $quote the active cart of the session
     * @return Order
     * @throws LocalizedException when the cart cannot be ordered
     */
    public function place(Quote $quote): Order
    {
        if (!$quote->getId() || !$quote->hasItems()) {
            throw new LocalizedException(__('Your cart is empty.'));
        }
        $quote->getBillingAddress()->addData(self::ADDRESS);
        if (!$quote->getCustomerId()) {
            $quote->setCheckoutMethod(CartManagementInterface::METHOD_GUEST);
            $quote->setCustomerIsGuest(true);
            $quote->setCustomerEmail(self::GUEST_EMAIL);
            $quote->getBillingAddress()->setEmail(self::GUEST_EMAIL);
        }
        if (!$quote->isVirtual()) {
            $shipping = $quote->getShippingAddress();
            $shipping->addData(self::ADDRESS);
            $shipping->setSameAsBilling(1);
            $shipping->setCollectShippingRates(true);
            $quote->collectTotals();
            $rate = $this->cheapestRate($quote);
            if ($rate === null) {
                throw new LocalizedException(__('No shipping method is available for the sample address.'));
            }
            $shipping->setShippingMethod($rate->getCode());
        }
        $quote->getPayment()->importData(['method' => Config::REDIRECT]);
        $quote->setData('totals_collected_flag', false);
        $quote->collectTotals();
        $this->cartRepository->save($quote);

        $order = $this->orderRepository->get((int) $this->cartManagement->placeOrder((int) $quote->getId()));
        if (!$order instanceof Order) {
            throw new LocalizedException(__('The order could not be placed.'));
        }
        $payment = $order->getPayment();
        if ($payment instanceof Payment) {
            $payment->setAdditionalInformation('sample_express', '1');
        }

        return $order;
    }

    /**
     * The cheapest rate the carriers answered without an error.
     *
     * Pickup point rates are left out: they need a point the wallet cannot choose.
     *
     * @param Quote $quote
     * @return Rate|null
     */
    private function cheapestRate(Quote $quote): ?Rate
    {
        $cheapest = null;
        foreach ($quote->getShippingAddress()->getAllShippingRates() as $rate) {
            if (!$rate instanceof Rate || (string) $rate->getErrorMessage() !== '' || !$rate->getCode()
                || in_array((string) $rate->getCarrier(), self::SKIPPED_CARRIERS, true)
            ) {
                continue;
            }
            if ($cheapest === null || (float) $rate->getPrice() < (float) $cheapest->getPrice()) {
                $cheapest = $rate;
            }
        }

        return $cheapest;
    }
}

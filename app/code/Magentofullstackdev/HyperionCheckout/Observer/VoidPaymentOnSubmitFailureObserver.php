<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Payment;
use Magento\Sales\Model\ResourceModel\Order\CollectionFactory as OrderCollectionFactory;
use Psr\Log\LoggerInterface;

/**
 * Voids a gateway authorization left open by a failed quote submission.
 *
 * Core's `QuoteManagement::submitQuote()` places the order (gateway
 * authorization, then the order save) with no database transaction around
 * it, and dispatches `sales_model_service_quote_submit_failure` when anything
 * in that block throws. When the authorization went through and the order row
 * was never written, the shopper keeps an open authorization on the card for
 * an order that does not exist. This observer voids it through the payment
 * method instance, which only needs the in-memory payment: the order payment's
 * own `canVoid()` / `void()` look up the persisted authorization transaction,
 * which a rolled back save never wrote.
 *
 * Nothing is voided when:
 * - the payment carries no transaction id (gateway decline, offline method);
 * - the payment module releases the authorization of its own failed orders
 *   (see SELF_CANCELING_METHOD_PREFIXES): a second void would only fail;
 * - the order row exists (a later step failed: voiding here would leave a
 *   live order with a dead authorization; a payment module may still cancel
 *   the order itself), or its existence cannot be read;
 * - an amount was already captured, or the method refuses to void (the
 *   captured transaction stays at the gateway and a warning is logged).
 *
 * Every failure is logged and swallowed: core wraps an exception thrown by an
 * observer of this event and would hide the original submit error.
 */
class VoidPaymentOnSubmitFailureObserver implements ObserverInterface
{
    /**
     * Method code prefixes of payment modules that cancel the authorization of
     * a failed order themselves, saved or not (Adobe Payment Services wraps
     * `CartManagementInterface::placeOrder()` for it).
     */
    private const SELF_CANCELING_METHOD_PREFIXES = ['payment_services_paypal'];

    /**
     * @param OrderCollectionFactory $orderCollectionFactory
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly OrderCollectionFactory $orderCollectionFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Void the authorization of an order that was never saved.
     *
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        $context = [];
        $stage = 'read';
        try {
            $order = $observer->getData('order');
            if (!$order instanceof Order) {
                return;
            }
            $payment = $order->getPayment();
            if (!$payment instanceof Payment) {
                return;
            }
            $transactionId = (string) $payment->getLastTransId();
            if ($transactionId === '') {
                return;
            }

            // After the authorization this is the gateway's own code, for a stored card too.
            $methodCode = (string) $payment->getMethod();
            foreach (self::SELF_CANCELING_METHOD_PREFIXES as $prefix) {
                if (str_starts_with($methodCode, $prefix)) {
                    return;
                }
            }

            $context = [
                'method' => $methodCode,
                'transaction_id' => $transactionId,
                'increment_id' => (string) $order->getIncrementId(),
            ];
            $stage = 'lookup';
            if ($this->isPersisted($order, $context)) {
                return;
            }

            $stage = 'void';
            // A stored card or account is authorized by core's vault method, which then renames the
            // payment to its provider and cannot void. Resolve the instance again from the code the
            // order would have been saved with, as a reloaded order does.
            $payment->unsetData('method_instance');
            $method = $payment->getMethodInstance();
            $method->setStore($order->getStoreId());
            if ((float) $payment->getAmountPaid() > 0.0
                || (float) $payment->getBaseAmountPaid() > 0.0
                || !$method->canVoid()
            ) {
                $this->logger->warning(
                    'Hyperion checkout: the order submission failed after the payment was captured or cannot be'
                    . ' voided; the transaction was left at the gateway.',
                    $context
                );
                return;
            }

            if (!$payment->getParentTransactionId()) {
                // Core's void sets the parent from the authorization; gateway void builders read it.
                $payment->setParentTransactionId($transactionId);
            }
            $method->void($payment);
            $this->logger->info(
                'Hyperion checkout: voided the authorization of an order whose submission failed.',
                $context
            );
        } catch (\Throwable $e) {
            $message = match ($stage) {
                'read' => 'Hyperion checkout: could not read the payment of a failed order submission; nothing was'
                    . ' voided.',
                'lookup' => 'Hyperion checkout: could not tell whether the failed order was saved; the authorization'
                    . ' was not voided.',
                default => 'Hyperion checkout: voiding the authorization of a failed order submission failed.',
            };
            $this->logger->error($message, $context + ['error' => $e->getMessage()]);
        }
    }

    /**
     * Tell, with a fresh read, whether the order row exists.
     *
     * The in-memory entity id can survive a rolled back save, so the database
     * decides. The quote id joins the increment id because a duplicate
     * increment id is itself a cause of a failed save, and the row found then
     * belongs to another order. An order without an increment id cannot be
     * looked up and counts as persisted, so nothing is voided.
     *
     * @param Order $order
     * @param string[] $context
     * @return bool
     */
    private function isPersisted(Order $order, array $context): bool
    {
        $incrementId = (string) $order->getIncrementId();
        if ($incrementId === '') {
            $this->logger->warning(
                'Hyperion checkout: the failed order has no increment id; the authorization was not voided.',
                $context
            );
            return true;
        }

        $collection = $this->orderCollectionFactory->create();
        $collection->addFieldToFilter('increment_id', $incrementId);
        $collection->addFieldToFilter('store_id', ['eq' => (int) $order->getStoreId()]);
        $collection->addFieldToFilter('quote_id', ['eq' => (int) $order->getQuoteId()]);
        if ($collection->getSize() > 0) {
            $this->logger->warning(
                'Hyperion checkout: the order submission failed after the order was saved; the authorization was'
                . ' not voided here.',
                $context
            );
            return true;
        }

        return false;
    }
}

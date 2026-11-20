<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Observer;

use Magento\Framework\DataObject;
use Magento\Framework\Event\Observer;
use Magento\Payment\Model\MethodInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Payment;
use Magento\Sales\Model\ResourceModel\Order\Collection as OrderCollection;
use Magento\Sales\Model\ResourceModel\Order\CollectionFactory as OrderCollectionFactory;
use Magentofullstackdev\HyperionCheckout\Observer\VoidPaymentOnSubmitFailureObserver;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A failed quote submission voids the gateway authorization only when the
 * order row was never written, nothing was captured and the method can void,
 * and never lets an exception out of the observer.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Observer\VoidPaymentOnSubmitFailureObserver
 */
class VoidPaymentOnSubmitFailureObserverTest extends TestCase
{
    private const STORE_ID = 3;
    private const TRANSACTION_ID = 'auth-123';
    private const INCREMENT_ID = '000000042';

    public function testAnEventWithoutAnOrderDoesNothing(): void
    {
        $factory = $this->createMock(OrderCollectionFactory::class);
        $factory->expects(self::never())->method('create');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method(self::anything());

        $observer = new VoidPaymentOnSubmitFailureObserver($factory, $logger);
        $observer->execute(new Observer(['order' => new DataObject(), 'quote' => new DataObject()]));
        $observer->execute(new Observer([]));
    }

    public function testAnOrderWithoutAPaymentDoesNothing(): void
    {
        $order = $this->createStub(Order::class);
        $order->method('getPayment')->willReturn(null);
        $factory = $this->createMock(OrderCollectionFactory::class);
        $factory->expects(self::never())->method('create');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method(self::anything());

        (new VoidPaymentOnSubmitFailureObserver($factory, $logger))->execute(new Observer(['order' => $order]));
    }

    public function testAPaymentThatCannotBeReadIsLoggedAndSwallowed(): void
    {
        $order = $this->createStub(Order::class);
        $order->method('getPayment')->willThrowException(new \RuntimeException('payment load failed'));
        $factory = $this->createMock(OrderCollectionFactory::class);
        $factory->expects(self::never())->method('create');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(
            self::stringContains('could not read the payment'),
            ['error' => 'payment load failed']
        );

        (new VoidPaymentOnSubmitFailureObserver($factory, $logger))->execute(new Observer(['order' => $order]));
    }

    public function testTheMethodInstanceIsResolvedAgainBeforeTheVoid(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $method->method('canVoid')->willReturn(true);
        $method->expects(self::once())->method('void');
        $payment = $this->createMock(Payment::class);
        $payment->method('getLastTransId')->willReturn(self::TRANSACTION_ID);
        $payment->method('getMethod')->willReturn('braintree');
        $payment->method('getParentTransactionId')->willReturn(self::TRANSACTION_ID);
        $calls = [];
        $payment->expects(self::once())->method('unsetData')->with('method_instance')
            ->willReturnCallback(function () use (&$calls, $payment) {
                $calls[] = 'unset';
                return $payment;
            });
        $payment->expects(self::once())->method('getMethodInstance')
            ->willReturnCallback(function () use (&$calls, $method) {
                $calls[] = 'resolve';
                return $method;
            });

        (new VoidPaymentOnSubmitFailureObserver($this->factory(0), $this->createStub(LoggerInterface::class)))
            ->execute(new Observer(['order' => $this->order($payment)]));

        self::assertSame(['unset', 'resolve'], $calls);
    }

    public function testAMethodWhoseModuleCancelsItsOwnFailedOrdersIsLeftAlone(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $method->expects(self::never())->method('void');
        $payment = $this->createStub(Payment::class);
        $payment->method('getLastTransId')->willReturn(self::TRANSACTION_ID);
        $payment->method('getMethod')->willReturn('payment_services_paypal_hosted_fields');
        $payment->method('getMethodInstance')->willReturn($method);
        $factory = $this->createMock(OrderCollectionFactory::class);
        $factory->expects(self::never())->method('create');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method(self::anything());

        (new VoidPaymentOnSubmitFailureObserver($factory, $logger))
            ->execute(new Observer(['order' => $this->order($payment)]));
    }

    public function testAPaymentWithoutATransactionIdDoesNothing(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $method->expects(self::never())->method('void');
        $payment = $this->paymentStub($method, '');
        $factory = $this->createMock(OrderCollectionFactory::class);
        $factory->expects(self::never())->method('create');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method(self::anything());

        (new VoidPaymentOnSubmitFailureObserver($factory, $logger))
            ->execute(new Observer(['order' => $this->order($payment)]));
    }

    public function testAnAuthorizationOfAnOrderNeverSavedIsVoided(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $payment = $this->createMock(Payment::class);
        $payment->method('getLastTransId')->willReturn(self::TRANSACTION_ID);
        $payment->method('getMethod')->willReturn('braintree');
        $payment->method('getMethodInstance')->willReturn($method);
        $payment->method('getAmountPaid')->willReturn(null);
        $payment->method('getBaseAmountPaid')->willReturn(null);
        $payment->method('getParentTransactionId')->willReturn(null);
        $payment->expects(self::once())->method('setParentTransactionId')->with(self::TRANSACTION_ID);

        $method->expects(self::once())->method('setStore')->with(self::STORE_ID);
        $method->method('canVoid')->willReturn(true);
        $method->expects(self::once())->method('void')->with(self::identicalTo($payment));

        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('info')->with(
            self::stringContains('voided the authorization'),
            [
                'method' => 'braintree',
                'transaction_id' => self::TRANSACTION_ID,
                'increment_id' => self::INCREMENT_ID,
            ]
        );
        $logger->expects(self::never())->method('warning');
        $logger->expects(self::never())->method('error');

        (new VoidPaymentOnSubmitFailureObserver($this->factory(0), $logger))
            ->execute(new Observer(['order' => $this->order($payment)]));
    }

    public function testTheLookupFiltersOnIncrementIdStoreAndQuote(): void
    {
        $collection = $this->createMock(OrderCollection::class);
        $filters = [];
        $collection->expects(self::exactly(3))->method('addFieldToFilter')->willReturnCallback(
            function (string $field, $value) use (&$filters, $collection) {
                $filters[$field] = $value;
                return $collection;
            }
        );
        $collection->method('getSize')->willReturn(0);
        $factory = $this->createStub(OrderCollectionFactory::class);
        $factory->method('create')->willReturn($collection);

        $method = $this->createMock(MethodInterface::class);
        $method->method('canVoid')->willReturn(true);
        $method->expects(self::once())->method('void');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('info');

        (new VoidPaymentOnSubmitFailureObserver($factory, $logger))
            ->execute(new Observer(['order' => $this->order($this->paymentStub($method))]));

        self::assertSame(
            [
                'increment_id' => self::INCREMENT_ID,
                'store_id' => ['eq' => self::STORE_ID],
                'quote_id' => ['eq' => 77],
            ],
            $filters
        );
    }

    public function testASavedOrderKeepsItsAuthorizationAndIsLogged(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $method->expects(self::never())->method('void');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(
            self::stringContains('after the order was saved'),
            self::callback(static fn (array $context): bool => $context['increment_id'] === self::INCREMENT_ID)
        );
        $logger->expects(self::never())->method('info');

        (new VoidPaymentOnSubmitFailureObserver($this->factory(1), $logger))
            ->execute(new Observer(['order' => $this->order($this->paymentStub($method))]));
    }

    public function testAnOrderWithoutIncrementIdIsNotVoided(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $method->expects(self::never())->method('void');
        $factory = $this->createMock(OrderCollectionFactory::class);
        $factory->expects(self::never())->method('create');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(self::stringContains('no increment id'));

        (new VoidPaymentOnSubmitFailureObserver($factory, $logger))
            ->execute(new Observer(['order' => $this->order($this->paymentStub($method), '')]));
    }

    public function testAMethodThatCannotVoidLeavesTheTransactionAndWarns(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $method->method('canVoid')->willReturn(false);
        $method->expects(self::never())->method('void');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(
            self::stringContains('left at the gateway'),
            self::callback(static fn (array $context): bool => $context['transaction_id'] === self::TRANSACTION_ID)
        );
        $logger->expects(self::never())->method('info');

        (new VoidPaymentOnSubmitFailureObserver($this->factory(0), $logger))
            ->execute(new Observer(['order' => $this->order($this->paymentStub($method))]));
    }

    /**
     * @return array<string, array{float|null, float|null}>
     */
    public static function capturedAmounts(): array
    {
        return [
            'amount paid' => [25.0, null],
            'base amount paid' => [null, 20.0],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('capturedAmounts')]
    public function testACapturedPaymentIsNeverVoidedEvenWhenTheMethodCouldVoid(
        ?float $amountPaid,
        ?float $baseAmountPaid
    ): void {
        $method = $this->createMock(MethodInterface::class);
        $method->method('canVoid')->willReturn(true);
        $method->expects(self::never())->method('void');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(self::stringContains('left at the gateway'));
        $logger->expects(self::never())->method('info');

        $payment = $this->paymentStub($method, self::TRANSACTION_ID, $amountPaid, $baseAmountPaid);
        (new VoidPaymentOnSubmitFailureObserver($this->factory(0), $logger))
            ->execute(new Observer(['order' => $this->order($payment)]));
    }

    public function testAFailedVoidIsLoggedAndSwallowed(): void
    {
        $method = $this->createMock(MethodInterface::class);
        $method->method('canVoid')->willReturn(true);
        $method->expects(self::once())->method('void')->willThrowException(new \RuntimeException('gateway down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(
            self::stringContains('voiding the authorization'),
            self::callback(static fn (array $context): bool => $context['error'] === 'gateway down')
        );
        $logger->expects(self::never())->method('info');

        (new VoidPaymentOnSubmitFailureObserver($this->factory(0), $logger))
            ->execute(new Observer(['order' => $this->order($this->paymentStub($method))]));
    }

    public function testAFailedLookupDoesNotVoidAndIsLogged(): void
    {
        $collection = $this->createStub(OrderCollection::class);
        $collection->method('addFieldToFilter')->willReturnSelf();
        $collection->method('getSize')->willThrowException(new \RuntimeException('db gone'));
        $factory = $this->createStub(OrderCollectionFactory::class);
        $factory->method('create')->willReturn($collection);

        $method = $this->createMock(MethodInterface::class);
        $method->expects(self::never())->method('void');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(
            self::stringContains('could not tell whether the failed order was saved'),
            self::callback(static fn (array $context): bool => $context['error'] === 'db gone')
        );

        (new VoidPaymentOnSubmitFailureObserver($factory, $logger))
            ->execute(new Observer(['order' => $this->order($this->paymentStub($method))]));
    }

    /**
     * Order payment double that only answers.
     *
     * @param MethodInterface $method
     * @param string $lastTransId
     * @param float|null $amountPaid
     * @param float|null $baseAmountPaid
     * @return Payment
     */
    private function paymentStub(
        MethodInterface $method,
        string $lastTransId = self::TRANSACTION_ID,
        ?float $amountPaid = null,
        ?float $baseAmountPaid = null
    ): Payment {
        $payment = $this->createStub(Payment::class);
        $payment->method('getLastTransId')->willReturn($lastTransId);
        $payment->method('getMethod')->willReturn('braintree');
        $payment->method('getMethodInstance')->willReturn($method);
        $payment->method('getAmountPaid')->willReturn($amountPaid);
        $payment->method('getBaseAmountPaid')->willReturn($baseAmountPaid);
        $payment->method('getParentTransactionId')->willReturn(self::TRANSACTION_ID);
        return $payment;
    }

    /**
     * Order double carrying the payment of the failed submission.
     *
     * @param Payment $payment
     * @param string $incrementId
     * @return Order
     */
    private function order(Payment $payment, string $incrementId = self::INCREMENT_ID): Order
    {
        $order = $this->createStub(Order::class);
        $order->method('getPayment')->willReturn($payment);
        $order->method('getIncrementId')->willReturn($incrementId);
        $order->method('getStoreId')->willReturn(self::STORE_ID);
        $order->method('getQuoteId')->willReturn(77);
        return $order;
    }

    /**
     * Collection factory whose fresh read counts the given number of rows.
     *
     * @param int $size
     * @return OrderCollectionFactory
     */
    private function factory(int $size): OrderCollectionFactory
    {
        $collection = $this->createStub(OrderCollection::class);
        $collection->method('addFieldToFilter')->willReturnSelf();
        $collection->method('getSize')->willReturn($size);
        $factory = $this->createStub(OrderCollectionFactory::class);
        $factory->method('create')->willReturn($collection);
        return $factory;
    }
}

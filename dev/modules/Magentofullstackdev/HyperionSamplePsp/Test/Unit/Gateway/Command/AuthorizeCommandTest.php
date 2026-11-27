<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Test\Unit\Gateway\Command;

use Magento\Payment\Gateway\Command\CommandException;
use Magento\Payment\Gateway\Data\OrderAdapterInterface;
use Magento\Payment\Gateway\Data\PaymentDataObjectInterface;
use Magento\Sales\Model\Order\Payment;
use Magentofullstackdev\HyperionSamplePsp\Gateway\Command\AuthorizeCommand;
use Magentofullstackdev\HyperionSamplePsp\Gateway\Handler\VaultTokenHandler;
use Magentofullstackdev\HyperionSamplePsp\Gateway\NonceVerifier;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class AuthorizeCommandTest extends TestCase
{
    /**
     * @var VaultTokenHandler&MockObject
     */
    private VaultTokenHandler&MockObject $vaultTokenHandler;

    private AuthorizeCommand $command;

    protected function setUp(): void
    {
        $this->vaultTokenHandler = $this->createMock(VaultTokenHandler::class);
        $this->command = new AuthorizeCommand(new NonceVerifier(), $this->vaultTokenHandler);
    }

    public function testAcceptsANonceBuiltFromTheBaseGrandTotalAndOpensAnAuthorization(): void
    {
        $payment = $this->payment(['sample_nonce' => 'sample-45.50-USD', 'sample_last4' => '4242']);
        $this->vaultTokenHandler->expects($this->never())->method('handle');

        $this->command->execute($this->subject($payment, 45.5, 'USD', null));

        self::assertStringStartsWith('sample-', (string) $payment->getTransactionId());
        self::assertFalse($payment->getData('is_transaction_closed'));
        self::assertSame('4242', $payment->getCcLast4());
    }

    /**
     * @return array<string, array{array<string, string>, string}>
     */
    public static function refusedPayments(): array
    {
        return [
            'amount in the display currency' => [
                ['sample_nonce' => 'sample-41.20-EUR', 'sample_last4' => '4242'],
                'The sample payment amount does not match the order total.',
            ],
            'right amount, wrong currency' => [
                ['sample_nonce' => 'sample-45.50-EUR', 'sample_last4' => '4242'],
                'The sample payment amount does not match the order total.',
            ],
            'amount of an older total' => [
                ['sample_nonce' => 'sample-40.50-USD', 'sample_last4' => '4242'],
                'The sample payment amount does not match the order total.',
            ],
            'no nonce' => [
                ['sample_last4' => '4242'],
                'The sample payment amount does not match the order total.',
            ],
            'declined test card' => [
                ['sample_nonce' => 'sample-45.50-USD', 'sample_last4' => '0009'],
                'The sample card was declined.',
            ],
            'verification card without a challenge' => [
                ['sample_nonce' => 'sample-45.50-USD', 'sample_last4' => '0003'],
                'The sample card needs a verification.',
            ],
        ];
    }

    /**
     * @param array<string, string> $additionalInformation
     * @param string $message
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('refusedPayments')]
    public function testRefusesAPaymentTheFakeGatewayWouldDecline(array $additionalInformation, string $message): void
    {
        $payment = $this->payment($additionalInformation);
        $this->vaultTokenHandler->expects($this->never())->method('handle');

        try {
            $this->command->execute($this->subject($payment, 45.5, 'USD', 7));
            self::fail('The payment was accepted.');
        } catch (CommandException $e) {
            self::assertSame($message, $e->getMessage());
        }
        self::assertNull($payment->getTransactionId());
    }

    public function testAcceptsAVerifiedCardAndLetsACustomerStoreIt(): void
    {
        $payment = $this->payment([
            'sample_nonce' => 'sample-120.00-USD',
            'sample_last4' => '3063',
            'sample_threeds' => 'approved',
        ]);
        $this->vaultTokenHandler->expects($this->once())->method('handle')->with($payment, '3063');

        $this->command->execute($this->subject($payment, 120.0, 'usd', 7));

        self::assertStringStartsWith('sample-', (string) $payment->getTransactionId());
    }

    /**
     * A payment whose additional information is fixed; its setters are real.
     *
     * @param array<string, string> $additionalInformation
     * @return Payment&MockObject
     */
    private function payment(array $additionalInformation): Payment&MockObject
    {
        $payment = $this->getMockBuilder(Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getAdditionalInformation'])
            ->getMock();
        $payment->expects($this->atLeastOnce())
            ->method('getAdditionalInformation')
            ->willReturnCallback(static fn ($key = null) => $additionalInformation[$key] ?? null);

        return $payment;
    }

    /**
     * @param Payment $payment
     * @param float $baseGrandTotal
     * @param string $baseCurrency
     * @param int|null $customerId
     * @return array{payment: PaymentDataObjectInterface, amount: float}
     */
    private function subject(Payment $payment, float $baseGrandTotal, string $baseCurrency, ?int $customerId): array
    {
        $order = $this->createStub(OrderAdapterInterface::class);
        $order->method('getGrandTotalAmount')->willReturn($baseGrandTotal);
        $order->method('getCurrencyCode')->willReturn($baseCurrency);
        $order->method('getCustomerId')->willReturn($customerId);

        $paymentDataObject = $this->createStub(PaymentDataObjectInterface::class);
        $paymentDataObject->method('getPayment')->willReturn($payment);
        $paymentDataObject->method('getOrder')->willReturn($order);

        return ['payment' => $paymentDataObject, 'amount' => $baseGrandTotal];
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Test\Unit\ViewModel\Sales;

use Magento\Payment\Block\Info;
use Magento\Payment\Block\Info\Instructions;
use Magento\Sales\Model\Order\Payment;
use Magentofullstackdev\HyperionCustomer\ViewModel\Sales\PaymentInfo;
use PHPUnit\Framework\TestCase;

class PaymentInfoTest extends TestCase
{
    private PaymentInfo $viewModel;

    protected function setUp(): void
    {
        $this->viewModel = new PaymentInfo();
    }

    public function testNothingWithoutBlockAndPayment(): void
    {
        $this->assertSame([], $this->viewModel->getDetails(null, null));
        $this->assertSame([], $this->viewModel->getDetails(false, null));
    }

    public function testBankTransferInstructionsAreOneMultilineRow(): void
    {
        $block = $this->createStub(Instructions::class);
        $block->method('getInstructions')->willReturn(" IBAN 123\nBIC XYZ ");
        $block->method('getSpecificInformation')->willReturn([]);

        $rows = $this->viewModel->getDetails($block, $this->payment([]));

        $this->assertSame([['label' => '', 'value' => "IBAN 123\nBIC XYZ", 'multiline' => true]], $rows);
    }

    public function testCheckMoneyOrderRowsComeFromAdditionalInformation(): void
    {
        $payment = $this->payment(['payable_to' => 'Hyperion Inc', 'mailing_address' => "1 Main St\nCity"]);

        $rows = $this->viewModel->getDetails(null, $payment);

        $this->assertCount(2, $rows);
        $this->assertSame('Make Check payable to', $rows[0]['label']);
        $this->assertSame('Hyperion Inc', $rows[0]['value']);
        $this->assertFalse($rows[0]['multiline']);
        $this->assertSame('Send Check to', $rows[1]['label']);
        $this->assertTrue($rows[1]['multiline']);
    }

    public function testPurchaseOrderNumberAndSpecificInformation(): void
    {
        $payment = $this->payment([], 'PO-42');
        $block = $this->createStub(Info::class);
        $block->method('getSpecificInformation')->willReturn(['Credit Card Type' => 'Visa', 'Empty' => '']);
        $block->method('getValueAsArray')->willReturnCallback(static fn ($value) => $value === '' ? [] : [$value]);

        $rows = $this->viewModel->getDetails($block, $payment);

        $this->assertSame(
            [
                ['label' => 'Purchase Order Number', 'value' => 'PO-42', 'multiline' => false],
                ['label' => 'Credit Card Type', 'value' => 'Visa', 'multiline' => false],
            ],
            $rows
        );
    }

    public function testDuplicateRowsAreCollapsed(): void
    {
        $block = $this->createStub(Instructions::class);
        $block->method('getInstructions')->willReturn('Pay at the counter');
        $block->method('getSpecificInformation')->willReturn(['' => 'Pay at the counter']);
        $block->method('getValueAsArray')->willReturnCallback(static fn ($value) => [$value]);

        $this->assertCount(1, $this->viewModel->getDetails($block, $this->payment([])));
    }

    /**
     * @param array<string, string> $additional
     * @param string|null $poNumber
     * @return Payment
     */
    private function payment(array $additional, ?string $poNumber = null): Payment
    {
        $payment = $this->createStub(Payment::class);
        $payment->method('getAdditionalInformation')
            ->willReturnCallback(static fn ($key = null) => $key === null ? $additional : ($additional[$key] ?? null));
        $payment->method('getPoNumber')->willReturn($poNumber);

        return $payment;
    }
}

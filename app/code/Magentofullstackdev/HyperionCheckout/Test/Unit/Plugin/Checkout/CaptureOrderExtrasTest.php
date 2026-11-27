<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Plugin\Checkout;

use Magento\Checkout\Api\GuestPaymentInformationManagementInterface;
use Magento\Checkout\Api\PaymentInformationManagementInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Quote\Api\Data\PaymentExtensionInterface;
use Magento\Quote\Api\Data\PaymentInterface;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\Config as NewsletterConfig;
use Magentofullstackdev\HyperionCheckout\Model\OrderComment\Config as OrderCommentConfig;
use Magentofullstackdev\HyperionCheckout\Model\OrderExtras;
use Magentofullstackdev\HyperionCheckout\Plugin\Checkout\CaptureOrderExtras;
use Magentofullstackdev\HyperionCheckout\Test\Unit\Fixture\OrderExtrasAttributes;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Checkout\CaptureOrderExtras
 */
class CaptureOrderExtrasTest extends TestCase
{
    private OrderExtras $extras;

    protected function setUp(): void
    {
        $this->extras = new OrderExtras();
    }

    private function plugin(bool $commentOn = true, bool $newsletterOn = true, int $maxLength = 20): CaptureOrderExtras
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnMap([
            [OrderCommentConfig::XML_PATH_ENABLED, 'store', null, $commentOn],
            [NewsletterConfig::XML_PATH_ENABLED, 'store', null, $newsletterOn],
        ]);
        $scopeConfig->method('getValue')->willReturnMap([
            [OrderCommentConfig::XML_PATH_MAX_LENGTH, 'store', null, (string) $maxLength],
        ]);
        return new CaptureOrderExtras(
            $this->extras,
            new OrderCommentConfig($scopeConfig),
            new NewsletterConfig($scopeConfig),
            $this->createStub(LoggerInterface::class)
        );
    }

    private function payment(mixed $comment, mixed $subscribe): PaymentInterface
    {
        // The generated interface declares the two getters once the module is compiled.
        $attributes = method_exists(PaymentExtensionInterface::class, 'getHyperionOrderComment')
            ? $this->createStub(PaymentExtensionInterface::class)
            : $this->createStubForIntersectionOfInterfaces(
                [PaymentExtensionInterface::class, OrderExtrasAttributes::class]
            );
        $attributes->method('getHyperionOrderComment')->willReturn($comment);
        $attributes->method('getHyperionNewsletterSubscribe')->willReturn($subscribe);
        $payment = $this->createStub(PaymentInterface::class);
        $payment->method('getExtensionAttributes')->willReturn($attributes);
        return $payment;
    }

    /**
     * @return array<string, array{0: mixed, 1: string|null}>
     */
    public static function comments(): array
    {
        return [
            'plain text' => ['Leave it at the door', 'Leave it at the door'],
            'tags stripped and trimmed' => ['  <b>Ring</b> twice<script>x</script>  ', 'Ring twicex'],
            'cut at the maximum length' => ['abcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrst'],
            'control characters removed, new lines kept' => ["Floor 2\nRing\x07", "Floor 2\nRing"],
            'only white space' => ['   ', null],
            'not a string' => [['x'], null],
        ];
    }

    #[DataProvider('comments')]
    public function testTheCustomerCommentIsSanitizedBeforeTheOrder(mixed $comment, ?string $expected): void
    {
        $this->plugin()->beforeSavePaymentInformationAndPlaceOrder(
            $this->createStub(PaymentInformationManagementInterface::class),
            12,
            $this->payment($comment, null),
            null
        );

        self::assertSame($expected, $this->extras->getComment());
    }

    public function testTheGuestCallFindsThePaymentAfterTheEmail(): void
    {
        $this->plugin()->beforeSavePaymentInformationAndPlaceOrder(
            $this->createStub(GuestPaymentInformationManagementInterface::class),
            'maskedQuoteId',
            'guest@example.com',
            $this->payment('Gift wrap please', true)
        );

        self::assertSame('Gift wrap please', $this->extras->getComment());
        self::assertTrue($this->extras->shouldSubscribe());
    }

    public function testSavingThePaymentWithoutAnOrderAlsoCaptures(): void
    {
        $this->plugin()->beforeSavePaymentInformation(
            $this->createStub(GuestPaymentInformationManagementInterface::class),
            'maskedQuoteId',
            'guest@example.com',
            $this->payment('Call first', '1')
        );

        self::assertSame('Call first', $this->extras->getComment());
        self::assertTrue($this->extras->shouldSubscribe());
    }

    public function testFeaturesThatAreOffIgnoreTheirAttributes(): void
    {
        $result = $this->plugin(false, false)->beforeSavePaymentInformationAndPlaceOrder(
            $this->createStub(PaymentInformationManagementInterface::class),
            12,
            $this->payment('Leave it at the door', true)
        );

        self::assertNull($result);
        self::assertNull($this->extras->getComment());
        self::assertFalse($this->extras->shouldSubscribe());
    }

    public function testAPaymentWithoutExtensionAttributesCapturesNothing(): void
    {
        $payment = $this->createStub(PaymentInterface::class);
        $payment->method('getExtensionAttributes')->willReturn(null);

        $this->plugin()->beforeSavePaymentInformationAndPlaceOrder(
            $this->createStub(PaymentInformationManagementInterface::class),
            12,
            $payment
        );

        self::assertNull($this->extras->getComment());
        self::assertFalse($this->extras->shouldSubscribe());
    }
}

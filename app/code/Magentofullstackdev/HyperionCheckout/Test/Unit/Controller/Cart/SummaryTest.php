<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Controller\Cart;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\QuoteIdMask;
use Magento\Quote\Model\QuoteIdMaskFactory;
use Magento\Quote\Model\QuoteIdToMaskedQuoteIdInterface;
use Magento\Quote\Model\ResourceModel\Quote\QuoteIdMask as QuoteIdMaskResource;
use Magentofullstackdev\HyperionCheckout\Controller\Cart\Summary;
use Magentofullstackdev\HyperionCheckout\ViewModel\CartData;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The cart summary answers the visitor's cart as JSON, both currencies,
 * never cacheable, `null` for an empty cart.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Controller\Cart\Summary
 */
class SummaryTest extends TestCase
{
    private Raw $raw;

    protected function setUp(): void
    {
        $this->raw = new Raw();
    }

    /**
     * A protected property of the result the controller filled.
     *
     * @param string $name
     * @return mixed
     */
    private function resultData(string $name): mixed
    {
        $property = new \ReflectionProperty($this->raw, $name);

        return $property->getValue($this->raw);
    }

    private function body(): string
    {
        return (string) $this->resultData('contents');
    }

    private function header(string $name): ?string
    {
        foreach ((array) $this->resultData('headers') as $header) {
            if ($header['name'] === $name) {
                return (string) $header['value'];
            }
        }

        return null;
    }

    public function testAGuestCartIsAnsweredWithItsMaskedIdAndBothCurrencies(): void
    {
        $masked = $this->createMock(QuoteIdToMaskedQuoteIdInterface::class);
        $masked->expects(self::once())->method('execute')->with(42)->willReturn('MASKED');

        $this->controller($this->quote(42, 0), $masked)->execute();

        self::assertEquals([
            'cartId' => 'MASKED',
            'isGuest' => true,
            'isVirtual' => false,
            'itemsCount' => 3,
            'display' => [
                'currency' => 'USD',
                'grandTotal' => 120.5,
                'subtotal' => 100.0,
                'shipping' => 10.0,
                'tax' => 15.5,
                'discount' => -5.0,
            ],
            'base' => [
                'currency' => 'EUR',
                'grandTotal' => 110.0,
                'subtotal' => 91.0,
                'shipping' => 9.0,
                'tax' => 14.0,
                'discount' => -4.0,
            ],
        ], json_decode($this->body(), true));
    }

    public function testASignedInCustomerGetsTheQuoteId(): void
    {
        $masked = $this->createMock(QuoteIdToMaskedQuoteIdInterface::class);
        $masked->expects(self::never())->method('execute');

        $this->controller($this->quote(42, 7), $masked, null, null, null, true)->execute();

        $body = json_decode($this->body(), true);
        self::assertSame('42', $body['cartId']);
        self::assertFalse($body['isGuest']);
    }

    public function testARememberedCustomerWhoIsNotSignedInIsAGuestWithAMaskedId(): void
    {
        $masked = $this->createMock(QuoteIdToMaskedQuoteIdInterface::class);
        $masked->expects(self::once())->method('execute')->with(42)->willReturn('');
        $mask = $this->getMockBuilder(QuoteIdMask::class)->disableOriginalConstructor()
            ->onlyMethods(['getData', 'setData'])->getMock();
        $mask->expects(self::once())->method('setData')->with('quote_id', 42)->willReturnSelf();
        $mask->method('getData')->willReturn('NEWMASK');
        $factory = $this->createMock(QuoteIdMaskFactory::class);
        $factory->expects(self::once())->method('create')->willReturn($mask);
        $resource = $this->createMock(QuoteIdMaskResource::class);
        $resource->expects(self::once())->method('save')->with($mask);

        $this->controller($this->quote(42, 7), $masked, null, null, null, false, $factory, $resource)->execute();

        $body = json_decode($this->body(), true);
        self::assertSame('NEWMASK', $body['cartId']);
        self::assertTrue($body['isGuest']);
        self::assertSame(
            ['cartId', 'isGuest', 'isVirtual', 'itemsCount', 'display', 'base'],
            array_keys($body),
            'no email, name or address of the remembered customer'
        );
    }

    public function testAnEmptyCartIsNull(): void
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(null);

        $this->controller($quote)->execute();

        self::assertSame('null', $this->body());
    }

    public function testTheAnswerIsPrivateAndJson(): void
    {
        $cacheHeaders = $this->createMock(CacheHeaders::class);
        $cacheHeaders->expects(self::once())->method('applyPrivate')->willReturnArgument(0);

        $result = $this->controller($this->quote(42, 7), null, $cacheHeaders)->execute();

        self::assertSame($this->raw, $result);
        self::assertSame('application/json; charset=UTF-8', $this->header('Content-Type'));
    }

    public function testAFailureIsLoggedAndAnswersNullWithAServerError(): void
    {
        $session = $this->createStub(CheckoutSession::class);
        $session->method('getQuote')->willThrowException(new \RuntimeException('no session'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $this->controller(null, null, null, $logger, $session)->execute();

        self::assertSame(500, $this->resultData('httpResponseCode'));
        self::assertSame('null', $this->body());
    }

    private function quote(int $id, int $customerId): Quote
    {
        $address = $this->createStub(Address::class);
        $address->method('getData')->willReturnMap([
            ['base_shipping_amount', null, 9.0],
            ['base_tax_amount', null, 14.0],
            ['base_discount_amount', null, -4.0],
        ]);
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn($id);
        $quote->method('hasItems')->willReturn(true);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getShippingAddress')->willReturn($address);
        $quote->method('getData')->willReturnMap([
            ['customer_id', null, $customerId ?: null],
            ['quote_currency_code', null, 'USD'],
            ['base_currency_code', null, 'EUR'],
            ['base_grand_total', null, 110.0],
            ['base_subtotal', null, 91.0],
        ]);

        return $quote;
    }

    private function controller(
        ?Quote $quote,
        ?QuoteIdToMaskedQuoteIdInterface $masked = null,
        ?CacheHeaders $cacheHeaders = null,
        ?LoggerInterface $logger = null,
        ?CheckoutSession $session = null,
        bool $signedIn = false,
        ?QuoteIdMaskFactory $maskFactory = null,
        ?QuoteIdMaskResource $maskResource = null
    ): Summary {
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($signedIn);
        if ($session === null) {
            $session = $this->createStub(CheckoutSession::class);
            $session->method('getQuote')->willReturn($quote);
        }
        $cartData = $this->createStub(CartData::class);
        $cartData->method('isVirtual')->willReturn(false);
        $cartData->method('getItemCount')->willReturn(3);
        $cartData->method('getGrandTotal')->willReturn(120.5);
        $cartData->method('getSubtotal')->willReturn(100.0);
        $cartData->method('getShippingAmount')->willReturn(10.0);
        $cartData->method('getTaxAmount')->willReturn(15.5);
        $cartData->method('getDiscountAmount')->willReturn(-5.0);
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($this->raw);
        if ($cacheHeaders === null) {
            $cacheHeaders = $this->createStub(CacheHeaders::class);
            $cacheHeaders->method('applyPrivate')->willReturnArgument(0);
        }

        return new Summary(
            $session,
            $customerSession,
            $cartData,
            $masked ?? $this->createStub(QuoteIdToMaskedQuoteIdInterface::class),
            $maskFactory ?? $this->createStub(QuoteIdMaskFactory::class),
            $maskResource ?? $this->createStub(QuoteIdMaskResource::class),
            $rawFactory,
            $cacheHeaders,
            new Json(),
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }
}

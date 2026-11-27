<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Cart;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magentofullstackdev\HyperionCheckout\Model\Cart\EstimateDestination;
use PHPUnit\Framework\TestCase;

/**
 * On a customer's cart of a session that is not signed in, the estimator
 * shows the quote's destination only when this session entered it.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Cart\EstimateDestination
 */
class EstimateDestinationTest extends TestCase
{
    private const NONE = ['country_id' => '', 'region_id' => '', 'region' => '', 'postcode' => ''];

    /** @var array<string, mixed> what the shipping address answers */
    private array $address = [];

    /** @var array<string, mixed> what the checkout session holds */
    private array $stored = [];

    protected function setUp(): void
    {
        $this->address = ['country_id' => 'DE', 'region_id' => null, 'region' => null, 'postcode' => '10115'];
        $this->stored = [];
    }

    private function quote(?int $customerId, int $quoteId = 2999): Quote
    {
        $address = $this->createStub(Address::class);
        $address->method('getCountryId')->willReturnCallback(fn () => $this->address['country_id']);
        $address->method('getRegionId')->willReturnCallback(fn () => $this->address['region_id']);
        $address->method('getRegion')->willReturnCallback(fn () => $this->address['region']);
        $address->method('getPostcode')->willReturnCallback(fn () => $this->address['postcode']);
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn($quoteId);
        $quote->method('getData')->willReturnMap([['customer_id', null, $customerId]]);
        $quote->method('getShippingAddress')->willReturn($address);

        return $quote;
    }

    private function checkoutSession(): CheckoutSession
    {
        $session = $this->createStub(CheckoutSession::class);
        $session->method('__call')->willReturnCallback(function (string $method, array $args) {
            if ($method === 'setData') {
                $this->stored[$args[0]] = $args[1];
            }
            return null;
        });
        $session->method('getData')->willReturnCallback(fn ($key = '') => $this->stored[$key] ?? null);

        return $session;
    }

    private function destination(bool $signedIn, ?CheckoutSession $checkoutSession = null): EstimateDestination
    {
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($signedIn);

        return new EstimateDestination($customerSession, $checkoutSession ?? $this->checkoutSession());
    }

    public function testTheShoppersOwnCartShowsItsDestination(): void
    {
        $shown = ['country_id' => 'DE', 'region_id' => '', 'region' => '', 'postcode' => '10115'];

        self::assertSame($shown, $this->destination(true)->ofQuote($this->quote(7)), 'signed-in customer');
        self::assertSame($shown, $this->destination(false)->ofQuote($this->quote(null)), 'guest');
        self::assertTrue($this->destination(false)->mayShow($this->quote(null)));
    }

    public function testACustomersCartOfASessionNotSignedInShowsNoDestination(): void
    {
        $destination = $this->destination(false);

        self::assertSame(self::NONE, $destination->ofQuote($this->quote(7)));
        self::assertFalse($destination->mayShow($this->quote(7)));
    }

    public function testTheDestinationTheSessionEnteredIsShownBackUntilItChanges(): void
    {
        $destination = $this->destination(false);
        $quote = $this->quote(7);

        $destination->rememberEntered($quote, $destination->takeEntered($quote));

        self::assertSame(
            ['country_id' => 'DE', 'region_id' => '', 'region' => '', 'postcode' => '10115'],
            $destination->ofQuote($quote)
        );
        self::assertTrue($destination->mayShow($quote));
        self::assertStringNotContainsString('10115', json_encode($this->stored, JSON_THROW_ON_ERROR));
        self::assertSame(self::NONE, $destination->ofQuote($this->quote(7, 3002)), 'another cart');

        $this->address['postcode'] = '10117';
        self::assertSame(self::NONE, $destination->ofQuote($quote), 'written elsewhere since');
    }

    /**
     * The estimate posts a region id; when the address is read again core
     * also answers the region's name.
     */
    public function testTheRegionNameCoreAddsToAnEnteredRegionIdKeepsItShown(): void
    {
        $this->address = ['country_id' => 'US', 'region_id' => 33, 'region' => null, 'postcode' => '48201'];
        $destination = $this->destination(false);
        $quote = $this->quote(7);
        $destination->rememberEntered($quote, $destination->takeEntered($quote));

        $this->address['region'] = 'Michigan';

        self::assertSame(
            ['country_id' => 'US', 'region_id' => '33', 'region' => 'Michigan', 'postcode' => '48201'],
            $destination->ofQuote($quote)
        );
    }

    public function testNothingIsRecordedForTheShoppersOwnCart(): void
    {
        $session = $this->createMock(CheckoutSession::class);
        $session->expects(self::never())->method('__call');

        $entered = ['country_id' => 'DE', 'region_id' => '', 'region' => '', 'postcode' => '10115'];
        $this->destination(true, $session)->rememberEntered($this->quote(7), $entered);
        $this->destination(false, $session)->rememberEntered($this->quote(null), $entered);
    }

    /**
     * Core imports the address book entry again when it saves a quote
     * address that references one: what the save wrote is never shown.
     */
    public function testADestinationTheSaveReplacedIsNotShown(): void
    {
        $destination = $this->destination(false);
        $quote = $this->quote(7);
        $entered = $destination->takeEntered($quote);

        $this->address = ['country_id' => 'US', 'region_id' => 33, 'region' => 'Michigan', 'postcode' => '49628-7978'];
        $destination->rememberEntered($quote, $entered);

        self::assertSame(self::NONE, $destination->ofQuote($quote));
        self::assertFalse($destination->mayShow($quote));
    }

    public function testTheAddressBookEntryIsDetachedOnlyOnACustomersCartOfASessionNotSignedIn(): void
    {
        $build = function (?int $customerId, int $calls): Quote {
            $address = $this->createMock(Address::class);
            $address->expects(self::exactly($calls))->method('setCustomerAddressId')->with(null);
            $quote = $this->createStub(Quote::class);
            $quote->method('getData')->willReturnMap([['customer_id', null, $customerId]]);
            $quote->method('getShippingAddress')->willReturn($address);

            return $quote;
        };

        $this->destination(false)->takeEntered($build(7, 1));
        $this->destination(true)->takeEntered($build(7, 0));
        $this->destination(false)->takeEntered($build(null, 0));
    }
}

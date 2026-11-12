<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\GuestQuoteConfigProvider;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\GuestQuoteConfigProvider
 */
class GuestQuoteConfigProviderTest extends TestCase
{
    private const SHIPPING = [
        'firstname' => 'Jane',
        'lastname' => 'Doe',
        'company' => null,
        'city' => 'Austin',
        'region' => 'Texas',
        'region_code' => 'TX',
        'postcode' => '78701',
        'country_id' => 'US',
        'telephone' => '5125550100',
        'fax' => null,
        'vat_id' => null,
        'prefix' => null,
        'middlename' => null,
        'suffix' => null,
        'region_id' => 57,
        'email' => 'ship@example.com',
    ];

    /**
     * @param array<string, mixed> $data
     * @param string[] $street
     */
    private function address(array $data, array $street = ['100 Congress Avenue', '']): Address
    {
        $address = $this->createStub(Address::class);
        $address->method('getCountryId')->willReturn($data['country_id'] ?? null);
        $address->method('getRegionId')->willReturn($data['region_id'] ?? null);
        $address->method('getEmail')->willReturn($data['email'] ?? null);
        $address->method('getStreet')->willReturn($street);
        $address->method('getData')->willReturnCallback(static fn (string $key) => $data[$key] ?? null);
        return $address;
    }

    private function quote(?Address $shipping, ?Address $billing, bool $virtual = false, ?string $email = null): Quote
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(144);
        $quote->method('getIsVirtual')->willReturn($virtual);
        $quote->method('getData')->willReturnMap([['customer_email', null, $email]]);
        $quote->method('getShippingAddress')->willReturn($shipping ?? $this->address([]));
        $quote->method('getBillingAddress')->willReturn($billing ?? $this->address([]));
        return $quote;
    }

    private function provider(Quote $quote, bool $loggedIn = false): GuestQuoteConfigProvider
    {
        $checkoutSession = $this->createStub(CheckoutSession::class);
        $checkoutSession->method('getQuote')->willReturn($quote);
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($loggedIn);
        return new GuestQuoteConfigProvider($checkoutSession, $customerSession, $this->createStub(LoggerInterface::class));
    }

    public function testEmitsNullForALoggedInCustomer(): void
    {
        $config = $this->provider($this->quote($this->address(self::SHIPPING), null), true)->getConfig();
        self::assertNull($config['hyperion']['guestQuote']);
    }

    public function testAGuestQuoteWithoutAnAddressIsEmpty(): void
    {
        $config = $this->provider($this->quote(null, null))->getConfig();
        self::assertSame(
            ['email' => null, 'shippingAddress' => null, 'billingAddress' => null],
            $config['hyperion']['guestQuote']
        );
    }

    public function testEmitsTheShippingAddressFlatAndNoBillingWhenItIsTheSame(): void
    {
        $shipping = $this->address(self::SHIPPING);
        $billing = $this->address(self::SHIPPING);
        $guest = $this->provider($this->quote($shipping, $billing))->getConfig()['hyperion']['guestQuote'];

        self::assertSame('ship@example.com', $guest['email']);
        self::assertNull($guest['billingAddress']);
        self::assertSame('57', $guest['shippingAddress']['region_id']);
        self::assertSame(['100 Congress Avenue'], $guest['shippingAddress']['street']);
        self::assertSame('Austin', $guest['shippingAddress']['city']);
        self::assertNull($guest['shippingAddress']['company']);
        self::assertArrayNotHasKey('email', $guest['shippingAddress']);
    }

    public function testEmitsABillingAddressThatDiffersFromTheShippingOne(): void
    {
        $shipping = $this->address(self::SHIPPING);
        $billing = $this->address(['city' => 'Calder', 'region_id' => 33] + self::SHIPPING);
        $guest = $this->provider($this->quote($shipping, $billing, false, 'quote@example.com'))
            ->getConfig()['hyperion']['guestQuote'];

        self::assertSame('quote@example.com', $guest['email']);
        self::assertSame('Calder', $guest['billingAddress']['city']);
        self::assertSame('33', $guest['billingAddress']['region_id']);
    }

    public function testAVirtualQuoteEmitsTheBillingAddressOnly(): void
    {
        $billing = $this->address(self::SHIPPING);
        $guest = $this->provider($this->quote($this->address(self::SHIPPING), $billing, true))
            ->getConfig()['hyperion']['guestQuote'];

        self::assertNull($guest['shippingAddress']);
        self::assertSame('Austin', $guest['billingAddress']['city']);
    }

    #[DataProvider('blankCountries')]
    public function testAnAddressWithoutACountryIsNotEmitted(?string $country): void
    {
        $shipping = $this->address(['country_id' => $country] + self::SHIPPING);
        $guest = $this->provider($this->quote($shipping, null))->getConfig()['hyperion']['guestQuote'];
        self::assertNull($guest['shippingAddress']);
    }

    /**
     * @return array<string, array{?string}>
     */
    public static function blankCountries(): array
    {
        return ['null' => [null], 'empty' => [''], 'blank' => ['  ']];
    }
}

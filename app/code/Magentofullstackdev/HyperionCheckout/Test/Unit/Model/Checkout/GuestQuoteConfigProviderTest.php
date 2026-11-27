<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\AddressFieldsValues;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\GuestQuoteConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\QuoteAddressExporter;
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

    private function quote(
        ?Address $shipping,
        ?Address $billing,
        bool $virtual = false,
        ?string $email = null,
        ?int $customerId = null
    ): Quote {
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(144);
        $quote->method('getIsVirtual')->willReturn($virtual);
        $quote->method('getData')->willReturnMap([
            ['customer_email', null, $email],
            ['customer_id', null, $customerId],
        ]);
        $quote->method('getShippingAddress')->willReturn($shipping ?? $this->address([]));
        $quote->method('getBillingAddress')->willReturn($billing ?? $this->address([]));
        return $quote;
    }

    /**
     * Declared field values read from a `fiscal_code` value of the address data, none without it.
     */
    private function declaredValues(): AddressFieldsValues
    {
        $values = $this->createStub(AddressFieldsValues::class);
        $values->method('export')->willReturnCallback(static function (Address $address): array {
            $code = $address->getData('fiscal_code');
            return $code === null ? [] : ['custom_attributes' => [['attribute_code' => 'fiscal_code', 'value' => $code]]];
        });
        return $values;
    }

    private function provider(Quote $quote, bool $loggedIn = false): GuestQuoteConfigProvider
    {
        $checkoutSession = $this->createStub(CheckoutSession::class);
        $checkoutSession->method('getQuote')->willReturn($quote);
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($loggedIn);
        return new GuestQuoteConfigProvider(
            $checkoutSession,
            $customerSession,
            $this->createStub(LoggerInterface::class),
            new QuoteAddressExporter(),
            $this->declaredValues()
        );
    }

    public function testEmitsNullForALoggedInCustomer(): void
    {
        $config = $this->provider($this->quote($this->address(self::SHIPPING), null), true)->getConfig();
        self::assertNull($config['hyperion']['guestQuote']);
    }

    public function testEmitsNullForAQuoteOfACustomerWhoIsNotLoggedIn(): void
    {
        $quote = $this->quote(
            $this->address(self::SHIPPING),
            $this->address(self::SHIPPING),
            false,
            'customer@example.com',
            7
        );

        self::assertNull($this->provider($quote)->getConfig()['hyperion']['guestQuote']);
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

    public function testABillingAddressThatDiffersOnlyByADeclaredFieldStaysASeparateBillingAddress(): void
    {
        $shipping = $this->address(self::SHIPPING);
        $billing = $this->address(['fiscal_code' => 'RSSMRA80A01H501U'] + self::SHIPPING);
        $guest = $this->provider($this->quote($shipping, $billing))->getConfig()['hyperion']['guestQuote'];

        self::assertArrayNotHasKey('custom_attributes', $guest['shippingAddress']);
        self::assertSame(
            [['attribute_code' => 'fiscal_code', 'value' => 'RSSMRA80A01H501U']],
            $guest['billingAddress']['custom_attributes']
        );
    }

    public function testEqualDeclaredValuesStillCollapseToSameAsShipping(): void
    {
        $shipping = $this->address(['fiscal_code' => 'RSSMRA80A01H501U'] + self::SHIPPING);
        $billing = $this->address(['fiscal_code' => 'RSSMRA80A01H501U'] + self::SHIPPING);
        $guest = $this->provider($this->quote($shipping, $billing))->getConfig()['hyperion']['guestQuote'];

        self::assertNull($guest['billingAddress']);
        self::assertSame(
            [['attribute_code' => 'fiscal_code', 'value' => 'RSSMRA80A01H501U']],
            $guest['shippingAddress']['custom_attributes']
        );
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

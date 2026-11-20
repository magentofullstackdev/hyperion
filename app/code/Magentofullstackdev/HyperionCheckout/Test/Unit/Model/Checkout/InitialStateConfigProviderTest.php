<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Reflection\DataObjectProcessor;
use Magento\Quote\Api\Data\PaymentMethodInterface;
use Magento\Quote\Api\Data\ShippingMethodInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Model\Cart\ShippingMethodConverter;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Address\Rate;
use Magento\Quote\Model\ResourceModel\Quote\Address\Collection as AddressCollection;
use Magento\Quote\Model\ResourceModel\Quote\Address\CollectionFactory as AddressCollectionFactory;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\InitialStateConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\QuoteAddressExporter;
use Magentofullstackdev\HyperionCheckout\Model\Config\Source\RateFields;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\InitialStateConfigProvider
 */
class InitialStateConfigProviderTest extends TestCase
{
    private const ADDRESS = [
        'address_type' => 'shipping',
        'firstname' => 'Jane',
        'lastname' => 'Doe',
        'city' => 'Calder',
        'region' => 'Michigan',
        'region_id' => 33,
        'postcode' => '49628-7978',
        'country_id' => 'US',
        'telephone' => '5125550100',
        'street' => ['6146 Honey Bluff Parkway'],
        'shipping_method' => 'flatrate_flatrate',
        'customer_address_id' => null,
        'same_as_billing' => 0,
    ];

    private const FLAT_RATE = [
        'code' => 'flatrate_flatrate',
        'carrier' => 'flatrate',
        'method' => 'flatrate',
        'carrier_title' => 'Flat Rate',
        'method_title' => 'Fixed',
        'price' => 15.0,
        'error_message' => null,
    ];

    private const TABLE_RATE = [
        'code' => 'tablerate_bestway',
        'carrier' => 'tablerate',
        'method' => 'bestway',
        'carrier_title' => 'Best Way',
        'method_title' => 'Table Rate',
        'price' => 5.0,
        'error_message' => null,
    ];

    /**
     * The emitted state the client's hydration tests read, relative to
     * this file inside the repository.
     */
    private const CLIENT_FIXTURE = '/../../../../../../../../frontend/packages/module-checkout/src/fixtures'
        . '/hyperion.initial.json';

    /** @var array<int, array{string, string}> */
    private array $converted = [];

    /**
     * @param array<string, mixed> $data
     */
    private function rate(array $data): Rate
    {
        $rate = $this->createStub(Rate::class);
        $rate->method('getData')->willReturnCallback(static fn (string $key) => $data[$key] ?? null);
        return $rate;
    }

    /**
     * A stored quote address row with its stored rates.
     *
     * @param array<string, mixed> $data
     * @param array<int, array<string, mixed>> $rates
     */
    private function address(array $data, array $rates = []): Address
    {
        $models = [];
        $grouped = [];
        foreach ($rates as $rateData) {
            $model = $this->rate($rateData);
            $models[(string)$rateData['code']] = $model;
            $grouped[(string)$rateData['carrier']][] = $model;
        }
        $address = $this->createStub(Address::class);
        $address->method('getCountryId')->willReturn($data['country_id'] ?? null);
        $address->method('getRegionId')->willReturn($data['region_id'] ?? null);
        $address->method('getStreet')->willReturn($data['street'] ?? []);
        $address->method('getShippingMethod')->willReturn($data['shipping_method'] ?? null);
        $address->method('getData')->willReturnCallback(
            static fn (string $key) => $key === 'street' ? null : ($data[$key] ?? null)
        );
        $address->method('getShippingRateByCode')->willReturnCallback(
            static fn ($code) => $models[(string)$code] ?? false
        );
        $address->method('getGroupedAllShippingRates')->willReturn($grouped);
        return $address;
    }

    /**
     * @param Quote&Stub $quote
     * @param array<string, mixed> $data
     */
    private function configureQuote(Quote $quote, array $data = []): Quote
    {
        $data += [
            'id' => 144,
            'has_items' => true,
            'virtual' => false,
            'customer_id' => null,
            'items_count' => 1,
            'items_qty' => 3,
            'subtotal' => 99.0,
        ];
        $quote->method('getId')->willReturn($data['id']);
        $quote->method('hasItems')->willReturn($data['has_items']);
        $quote->method('isVirtual')->willReturn($data['virtual']);
        $quote->method('getItemsCount')->willReturn($data['items_count']);
        $quote->method('getItemsQty')->willReturn($data['items_qty']);
        $quote->method('getData')->willReturnMap([
            ['customer_id', null, $data['customer_id']],
            ['quote_currency_code', null, 'EUR'],
            ['subtotal', null, $data['subtotal']],
        ]);
        return $quote;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function quote(array $data = []): Quote
    {
        return $this->configureQuote($this->createStub(Quote::class), $data);
    }

    /**
     * @param Address[] $storedAddresses
     * @param string|null $rateFields
     */
    private function provider(
        Quote $quote,
        array $storedAddresses,
        bool $loggedIn = false,
        ?PaymentMethodManagementInterface $payments = null,
        ?LoggerInterface $logger = null,
        ?string $rateFields = 'country_id,region,postcode'
    ): InitialStateConfigProvider {
        $checkoutSession = $this->createStub(CheckoutSession::class);
        $checkoutSession->method('getQuote')->willReturn($quote);
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($loggedIn);

        $collection = $this->createStub(AddressCollection::class);
        $collection->method('setQuoteFilter')->willReturnSelf();
        $collection->method('getItems')->willReturn($storedAddresses);
        $collectionFactory = $this->createStub(AddressCollectionFactory::class);
        $collectionFactory->method('create')->willReturn($collection);

        $converter = $this->createStub(ShippingMethodConverter::class);
        $converter->method('modelToDataObject')->willReturnCallback(
            function (Rate $rate, string $currency): ShippingMethodInterface {
                $this->converted[] = [(string)$rate->getData('code'), $currency];
                $method = $this->createStub(ShippingMethodInterface::class);
                $method->method('getCarrierCode')->willReturn($rate->getData('carrier'));
                $method->method('getMethodCode')->willReturn($rate->getData('method'));
                $method->method('getCarrierTitle')->willReturn($rate->getData('carrier_title'));
                $method->method('getMethodTitle')->willReturn($rate->getData('method_title'));
                $method->method('getAmount')->willReturn($rate->getData('price'));
                $method->method('getBaseAmount')->willReturn($rate->getData('price'));
                $method->method('getAvailable')->willReturn(!$rate->getData('error_message'));
                $method->method('getErrorMessage')->willReturn((string)$rate->getData('error_message'));
                $method->method('getPriceExclTax')->willReturn($rate->getData('price'));
                $method->method('getPriceInclTax')->willReturn($rate->getData('price') * 1.1);
                return $method;
            }
        );
        $processor = $this->createStub(DataObjectProcessor::class);
        $processor->method('buildOutputDataArray')->willReturnCallback(
            static fn (ShippingMethodInterface $method, string $type): array => [
                'carrier_code' => $method->getCarrierCode(),
                'method_code' => $method->getMethodCode(),
                'carrier_title' => $method->getCarrierTitle(),
                'method_title' => $method->getMethodTitle(),
                'amount' => $method->getAmount(),
                'base_amount' => $method->getBaseAmount(),
                'available' => $method->getAvailable(),
                'error_message' => $method->getErrorMessage(),
                'price_excl_tax' => $method->getPriceExclTax(),
                'price_incl_tax' => $method->getPriceInclTax(),
                'serialized_as' => $type,
            ]
        );

        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn($rateFields);

        return new InitialStateConfigProvider(
            $checkoutSession,
            $customerSession,
            $collectionFactory,
            $converter,
            $processor,
            $payments ?? $this->payments(),
            new QuoteAddressExporter(),
            new RateFields(),
            $scopeConfig,
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    private function payments(): PaymentMethodManagementInterface
    {
        $checkmo = $this->createStub(PaymentMethodInterface::class);
        $checkmo->method('getCode')->willReturn('checkmo');
        $checkmo->method('getTitle')->willReturn('Check / Money order');
        $payments = $this->createStub(PaymentMethodManagementInterface::class);
        $payments->method('getList')->willReturn([$checkmo]);
        return $payments;
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>|null
     */
    private function initial(array $config): ?array
    {
        self::assertSame(['hyperion'], array_keys($config));
        self::assertSame(['initial'], array_keys($config['hyperion']));
        return $config['hyperion']['initial'];
    }

    public function testAGuestQuoteWithAConfirmedMethodEmitsTheStoredState(): void
    {
        $shipping = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        $initial = $this->initial($this->provider($this->quote(), [$shipping])->getConfig());

        self::assertNotNull($initial);
        self::assertSame(
            ['shippingMethods', 'paymentMethods', 'appliedShippingMethod', 'quoteAddresses', 'fingerprint'],
            array_keys($initial)
        );
        self::assertSame(
            ['carrier_code' => 'flatrate', 'method_code' => 'flatrate'],
            $initial['appliedShippingMethod']
        );
        self::assertSame([['code' => 'checkmo', 'title' => 'Check / Money order']], $initial['paymentMethods']);
        self::assertNull($initial['quoteAddresses']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{40}$/', $initial['fingerprint']);
    }

    /**
     * The client hydrates from exactly what is emitted here: the JSON of a
     * guest and of a customer (a saved shipping address, a typed billing
     * address) is the fixture its tests load. A change of a key or of a
     * type on either side fails one of the two suites.
     */
    public function testTheEmittedJsonIsTheFixtureTheClientHydratesFrom(): void
    {
        $guest = $this->provider(
            $this->quote(),
            [$this->address(['region_code' => 'MI'] + self::ADDRESS, [self::FLAT_RATE])]
        );
        $shipping = $this->address(
            ['customer_address_id' => '12', 'region_code' => 'MI'] + self::ADDRESS,
            [self::FLAT_RATE]
        );
        $billing = $this->address(
            [
                'address_type' => 'billing',
                'city' => 'Austin',
                'region' => 'Texas',
                'region_code' => 'TX',
                'region_id' => 57,
            ] + self::ADDRESS
        );
        $customer = $this->provider($this->quote(['customer_id' => 7]), [$shipping, $billing], true);

        $emitted = [];
        foreach (['guest' => $guest, 'customer' => $customer] as $name => $provider) {
            $initial = (array)$this->initial($provider->getConfig());
            // The key the web API serializer double of this test adds.
            foreach ($initial['shippingMethods'] as $index => $method) {
                unset($initial['shippingMethods'][$index]['serialized_as']);
            }
            $emitted[$name] = json_decode((string)json_encode($initial), true);
        }
        self::assertIsArray($emitted['customer']['quoteAddresses']['shipping']);
        self::assertSame(12, $emitted['customer']['quoteAddresses']['shipping']['customer_address_id']);
        self::assertFalse($emitted['customer']['quoteAddresses']['billingSameAsShipping']);
        self::assertNull($emitted['guest']['quoteAddresses']);

        // Without the frontend sources next to the module (an installed
        // package) there is nothing to compare with.
        $path = __DIR__ . self::CLIENT_FIXTURE;
        if (is_file($path)) {
            self::assertSame(json_decode((string)file_get_contents($path), true), $emitted);
        }
    }

    public function testAStoredRateIsEmittedInTheShapeOfTheWebApi(): void
    {
        $shipping = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        $initial = $this->initial($this->provider($this->quote(), [$shipping])->getConfig());

        self::assertSame(
            [[
                'carrier_code' => 'flatrate',
                'method_code' => 'flatrate',
                'carrier_title' => 'Flat Rate',
                'method_title' => 'Fixed',
                'amount' => 15.0,
                'base_amount' => 15.0,
                'available' => true,
                'error_message' => '',
                'price_excl_tax' => 15.0,
                'price_incl_tax' => 16.5,
                'serialized_as' => ShippingMethodInterface::class,
            ]],
            $initial['shippingMethods'] ?? null
        );
        self::assertSame([['flatrate_flatrate', 'EUR']], $this->converted);
        self::assertStringContainsString('"amount":15', (string)json_encode($initial));
    }

    public function testEveryStoredRateIsEmittedIncludingAnErrorRateOfAnotherCarrier(): void
    {
        $error = ['code' => 'ups_error', 'carrier' => 'ups', 'method' => null, 'error_message' => 'Not available'];
        $shipping = $this->address(self::ADDRESS, [self::TABLE_RATE, self::FLAT_RATE, $error + self::FLAT_RATE]);
        $initial = $this->initial($this->provider($this->quote(), [$shipping])->getConfig());

        self::assertSame(
            ['tablerate', 'flatrate', 'ups'],
            array_column($initial['shippingMethods'] ?? [], 'carrier_code')
        );
        self::assertSame([true, true, false], array_column($initial['shippingMethods'] ?? [], 'available'));
    }

    public function testNoMethodOnTheQuoteEmitsNull(): void
    {
        $shipping = $this->address(['shipping_method' => null] + self::ADDRESS, [self::FLAT_RATE]);
        self::assertNull($this->initial($this->provider($this->quote(), [$shipping])->getConfig()));
    }

    public function testAMethodWithoutAStoredRateEmitsNull(): void
    {
        $shipping = $this->address(self::ADDRESS, [self::TABLE_RATE]);
        self::assertNull($this->initial($this->provider($this->quote(), [$shipping])->getConfig()));
    }

    /**
     * @param array<string, mixed> $change
     */
    #[DataProvider('unusableRates')]
    public function testAnErrorRateOrARateWithoutAMethodEmitsNull(array $change): void
    {
        $shipping = $this->address(self::ADDRESS, [$change + self::FLAT_RATE]);
        self::assertNull($this->initial($this->provider($this->quote(), [$shipping])->getConfig()));
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function unusableRates(): array
    {
        return [
            'error message' => [['error_message' => 'This shipping method is not available.']],
            'no method code' => [['method' => '']],
        ];
    }

    /**
     * @param array<string, mixed> $quoteData
     */
    #[DataProvider('quotesWithoutAShipment')]
    public function testAVirtualEmptyOrUnsavedQuoteEmitsNull(array $quoteData): void
    {
        $shipping = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        self::assertNull($this->initial($this->provider($this->quote($quoteData), [$shipping])->getConfig()));
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function quotesWithoutAShipment(): array
    {
        return [
            'virtual' => [['virtual' => true]],
            'no items' => [['has_items' => false]],
            'no id' => [['id' => null]],
        ];
    }

    public function testAnAddressWithoutACountryEmitsNull(): void
    {
        $shipping = $this->address(['country_id' => ''] + self::ADDRESS, [self::FLAT_RATE]);
        self::assertNull($this->initial($this->provider($this->quote(), [$shipping])->getConfig()));
    }

    public function testNoStoredShippingAddressOrSeveralEmitNull(): void
    {
        $billing = $this->address(['address_type' => 'billing'] + self::ADDRESS);
        self::assertNull($this->initial($this->provider($this->quote(), [$billing])->getConfig()));

        $first = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        $second = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        self::assertNull($this->initial($this->provider($this->quote(), [$first, $second])->getConfig()));
    }

    public function testAQuoteOfACustomerWhoIsNotLoggedInEmitsNull(): void
    {
        $shipping = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        $provider = $this->provider($this->quote(['customer_id' => 7]), [$shipping]);

        self::assertNull($this->initial($provider->getConfig()));
    }

    public function testACustomerWithASavedAddressGetsTheQuoteAddresses(): void
    {
        $shipping = $this->address(
            ['customer_address_id' => '12', 'same_as_billing' => '1'] + self::ADDRESS,
            [self::FLAT_RATE]
        );
        $billing = $this->address(['address_type' => 'billing', 'customer_address_id' => '12'] + self::ADDRESS);
        $provider = $this->provider($this->quote(['customer_id' => 7]), [$billing, $shipping], true);
        $addresses = $this->initial($provider->getConfig())['quoteAddresses'] ?? null;

        self::assertSame(['shipping', 'billing', 'billingSameAsShipping'], array_keys((array)$addresses));
        self::assertSame(12, $addresses['shipping']['customer_address_id']);
        self::assertTrue($addresses['shipping']['same_as_billing']);
        self::assertSame('Calder', $addresses['shipping']['city']);
        self::assertSame('33', $addresses['shipping']['region_id']);
        self::assertSame(['6146 Honey Bluff Parkway'], $addresses['shipping']['street']);
        self::assertNull($addresses['billing']);
        self::assertTrue($addresses['billingSameAsShipping']);
    }

    public function testACustomerWithATypedAddressAndAnotherBillingAddress(): void
    {
        $shipping = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        $billing = $this->address(
            ['address_type' => 'billing', 'customer_address_id' => 4, 'city' => 'Austin', 'region_id' => 57]
            + self::ADDRESS
        );
        $provider = $this->provider($this->quote(['customer_id' => 7]), [$shipping, $billing], true);
        $addresses = $this->initial($provider->getConfig())['quoteAddresses'] ?? null;

        self::assertNull($addresses['shipping']['customer_address_id']);
        self::assertFalse($addresses['shipping']['same_as_billing']);
        self::assertSame(4, $addresses['billing']['customer_address_id']);
        self::assertSame('Austin', $addresses['billing']['city']);
        self::assertFalse($addresses['billingSameAsShipping']);
    }

    public function testTheSameValuesUnderAnotherSavedAddressAreNotTheSameBillingAddress(): void
    {
        $shipping = $this->address(['customer_address_id' => 12] + self::ADDRESS, [self::FLAT_RATE]);
        $billing = $this->address(['address_type' => 'billing', 'customer_address_id' => 13] + self::ADDRESS);
        $provider = $this->provider($this->quote(['customer_id' => 7]), [$shipping, $billing], true);
        $addresses = $this->initial($provider->getConfig())['quoteAddresses'] ?? null;

        self::assertSame(13, $addresses['billing']['customer_address_id']);
        self::assertFalse($addresses['billingSameAsShipping']);
    }

    public function testACustomerWithoutAStoredBillingAddressBillsToTheShippingAddress(): void
    {
        $shipping = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        $billing = $this->address(['address_type' => 'billing', 'country_id' => null]);
        $provider = $this->provider($this->quote(['customer_id' => 7]), [$shipping, $billing], true);
        $addresses = $this->initial($provider->getConfig())['quoteAddresses'] ?? null;

        self::assertNull($addresses['billing']);
        self::assertTrue($addresses['billingSameAsShipping']);
    }

    /**
     * The checkout page assigns the customer to the session quote, which
     * copies the default address over the address fields in memory while
     * the row keeps its id and its shipping method.
     */
    public function testTheStoredAddressWinsOverTheAddressOfTheSessionQuote(): void
    {
        $quote = $this->createMock(Quote::class);
        $quote->expects(self::never())->method('getShippingAddress');
        $quote->expects(self::never())->method('getBillingAddress');
        $quote->expects(self::never())->method('save');
        $quote->expects(self::never())->method('collectTotals');
        $this->configureQuote($quote, ['customer_id' => 7]);

        $stored = $this->address(['customer_address_id' => 9] + self::ADDRESS, [self::FLAT_RATE]);
        $initial = $this->initial($this->provider($quote, [$stored], true)->getConfig());

        self::assertSame('Calder', $initial['quoteAddresses']['shipping']['city'] ?? null);
        self::assertSame(9, $initial['quoteAddresses']['shipping']['customer_address_id'] ?? null);
        self::assertSame(
            ['carrier_code' => 'flatrate', 'method_code' => 'flatrate'],
            $initial['appliedShippingMethod'] ?? null
        );
    }

    public function testASessionAddressThatDiffersFromTheStoredOneIsNotEmitted(): void
    {
        $inMemory = $this->address(
            ['city' => 'Austin', 'region_id' => 57, 'postcode' => '78701', 'customer_address_id' => 3]
            + self::ADDRESS,
            [self::FLAT_RATE]
        );
        $quote = $this->createStub(Quote::class);
        $quote->method('getShippingAddress')->willReturn($inMemory);
        $quote->method('getBillingAddress')->willReturn($inMemory);
        $this->configureQuote($quote, ['customer_id' => 7]);

        $stored = $this->address(
            ['customer_address_id' => 9, 'shipping_method' => 'tablerate_bestway'] + self::ADDRESS,
            [self::TABLE_RATE]
        );
        $initial = $this->initial($this->provider($quote, [$stored], true)->getConfig());

        self::assertSame('Calder', $initial['quoteAddresses']['shipping']['city'] ?? null);
        self::assertSame('49628-7978', $initial['quoteAddresses']['shipping']['postcode'] ?? null);
        self::assertSame(9, $initial['quoteAddresses']['shipping']['customer_address_id'] ?? null);
        self::assertSame(
            ['carrier_code' => 'tablerate', 'method_code' => 'bestway'],
            $initial['appliedShippingMethod'] ?? null
        );
        self::assertSame(['tablerate'], array_column($initial['shippingMethods'] ?? [], 'carrier_code'));
    }

    public function testTheFingerprintFollowsTheRateFieldsAndTheCartContent(): void
    {
        $fingerprint = fn (array $address, array $quote = [], ?string $fields = 'country_id,region,postcode'): string
            => (string)$this->initial($this->provider(
                $this->quote($quote),
                [$this->address($address + self::ADDRESS, [self::FLAT_RATE])],
                false,
                null,
                null,
                $fields
            )->getConfig())['fingerprint'];
        $base = $fingerprint([]);

        self::assertSame($base, $fingerprint([]));
        self::assertSame($base, $fingerprint(['telephone' => '1', 'city' => 'Austin', 'postcode' => ' 49628-7978 ']));
        self::assertNotSame($base, $fingerprint(['postcode' => '49629']));
        self::assertNotSame($base, $fingerprint(['region_id' => 57]));
        self::assertNotSame($base, $fingerprint([], ['items_qty' => 4]));
        self::assertNotSame($base, $fingerprint([], ['subtotal' => 100.0]));
        self::assertNotSame(
            $fingerprint([], [], 'country_id,region,postcode,city'),
            $fingerprint(['city' => 'Austin'], [], 'country_id,region,postcode,city')
        );
    }

    public function testAFailureOfThePaymentListIsLoggedAndEmitsNull(): void
    {
        $payments = $this->createStub(PaymentMethodManagementInterface::class);
        $payments->method('getList')->willThrowException(new \RuntimeException('payment list failed'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('payment list failed'));

        $shipping = $this->address(self::ADDRESS, [self::FLAT_RATE]);
        $provider = $this->provider($this->quote(), [$shipping], false, $payments, $logger);

        self::assertNull($this->initial($provider->getConfig()));
    }

    public function testAnErrorWhileReadingTheQuoteIsLoggedAndEmitsNull(): void
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willThrowException(new \TypeError('broken quote'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('broken quote'));

        $provider = $this->provider($quote, [], false, null, $logger);

        self::assertNull($this->initial($provider->getConfig()));
    }
}

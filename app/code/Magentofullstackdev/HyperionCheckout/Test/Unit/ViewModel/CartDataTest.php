<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\ViewModel;

use Magento\Catalog\Helper\Image;
use Magento\Catalog\Helper\Product\ConfigurationPool;
use Magento\CatalogInventory\Api\Data\StockItemInterface;
use Magento\CatalogInventory\Api\StockRegistryInterface;
use Magento\Checkout\Model\Session;
use Magento\Customer\Api\Data\AddressInterface as CustomerAddressData;
use Magento\Customer\Api\Data\RegionInterface;
use Magento\Customer\Model\Address as CustomerAddress;
use Magento\Customer\Model\Customer;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\UrlInterface;
use Magento\Catalog\Model\Product;
use Magento\Quote\Api\Data\ShippingMethodInterface;
use Magento\Quote\Model\Cart\ShippingMethodConverter;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as QuoteAddress;
use Magento\Quote\Model\Quote\Address\Rate;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magento\Tax\Helper\Data as TaxHelper;
use Magento\Tax\Model\Config as TaxConfig;
use Magentofullstackdev\HyperionCheckout\Model\WeeeBridge;
use Magentofullstackdev\HyperionCheckout\ViewModel\CartData;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A quote that cannot be loaded answers 0 items like an empty cart; the
 * `hasLoadFailure()` flag is what tells the templates apart. Amounts follow
 * the tax display settings and the quote currency; quantities follow the
 * stock item of the product.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\ViewModel\CartData
 */
class CartDataTest extends TestCase
{
    /** @var Session&Stub */
    private Session $checkoutSession;
    /** @var CustomerSession&Stub */
    private CustomerSession $customerSession;
    /** @var ScopeConfigInterface&Stub */
    private ScopeConfigInterface $scopeConfig;
    /** @var TaxConfig&Stub */
    private TaxConfig $taxConfig;
    /** @var TaxHelper&Stub */
    private TaxHelper $taxHelper;
    /** @var ShippingMethodConverter&Stub */
    private ShippingMethodConverter $shippingMethodConverter;
    /** @var StockRegistryInterface&Stub */
    private StockRegistryInterface $stockRegistry;
    private CartData $viewModel;

    protected function setUp(): void
    {
        $this->checkoutSession = $this->createStub(Session::class);
        $this->customerSession = $this->createStub(CustomerSession::class);
        $this->scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $this->taxConfig = $this->createStub(TaxConfig::class);
        $this->taxHelper = $this->createStub(TaxHelper::class);
        $this->shippingMethodConverter = $this->createStub(ShippingMethodConverter::class);
        $this->stockRegistry = $this->createStub(StockRegistryInterface::class);
        $this->viewModel = $this->viewModel($this->createStub(LoggerInterface::class));
    }

    /**
     * The logger is the one dependency a test verifies: a stub by default, a
     * mock when the test hands one in.
     */
    private function viewModel(LoggerInterface $logger): CartData
    {
        $priceCurrency = $this->createStub(PriceCurrencyInterface::class);
        $priceCurrency->method('format')->willReturnCallback(
            static fn ($amount): string => number_format((float) $amount, 2)
        );

        return new CartData(
            $this->checkoutSession,
            $priceCurrency,
            $this->createStub(UrlInterface::class),
            $this->createStub(Image::class),
            $this->createStub(ConfigurationPool::class),
            $logger,
            $this->taxConfig,
            $this->createStub(WeeeBridge::class),
            $this->customerSession,
            $this->createStub(ModuleManager::class),
            $this->scopeConfig,
            $this->createStub(Availability::class),
            $this->shippingMethodConverter,
            $this->taxHelper,
            $this->stockRegistry
        );
    }

    public function testLoadedQuoteLeavesTheFlagDown(): void
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getItemsQty')->willReturn(3.0);
        $quote->method('getAllVisibleItems')->willReturn([]);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        $this->scopeConfig->method('isSetFlag')->willReturn(true);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('error');
        $viewModel = $this->viewModel($logger);

        self::assertSame(3, $viewModel->getItemCount());
        self::assertTrue($viewModel->hasItems());
        self::assertSame([], $viewModel->getItems());
        self::assertFalse($viewModel->hasLoadFailure());
    }

    /**
     * The messages core attaches to a line (the stock validator on a refused
     * quantity) travel with the item so the cart page and the
     * mini-cart print them under the line.
     */
    public function testItemsCarryTheMessagesOfTheirQuoteLine(): void
    {
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn('simple');
        $product->method('getProductUrl')->willReturn('https://shop.test/bag.html');
        $refused = $this->createStub(QuoteItem::class);
        $refused->method('getId')->willReturn(7);
        $refused->method('getProduct')->willReturn($product);
        $refused->method('getData')->willReturnMap([['has_error', null, true], ['product_id', null, 3]]);
        $refused->method('getMessage')->willReturnCallback(
            static fn (bool $string = true) => $string
                ? "The requested qty is not available\n "
                : ['The requested qty is not available', ' ']
        );
        $fine = $this->createStub(QuoteItem::class);
        $fine->method('getId')->willReturn(9);
        $fine->method('getProduct')->willReturn($product);
        $fine->method('getData')->willReturnMap([['has_error', null, null], ['product_id', null, 4]]);
        $fine->method('getMessage')->willReturnCallback(static fn (bool $string = true) => $string ? '' : []);
        $quote = $this->createStub(Quote::class);
        $quote->method('getAllVisibleItems')->willReturn([$refused, $fine]);
        $this->checkoutSession->method('getQuote')->willReturn($quote);

        $items = $this->viewModel->getItems();

        self::assertCount(2, $items);
        self::assertSame(7, $items[0]['id']);
        self::assertSame(
            [['text' => 'The requested qty is not available', 'type' => 'error']],
            $items[0]['messages'],
            'the flagged line carries its message, blank entries dropped'
        );
        self::assertSame([], $items[1]['messages']);
        self::assertFalse($this->viewModel->hasLoadFailure());
    }

    public function testEmptyQuoteIsNotAFailure(): void
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getItemsQty')->willReturn(0.0);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        $this->scopeConfig->method('isSetFlag')->willReturn(true);

        self::assertSame(0, $this->viewModel->getItemCount());
        self::assertFalse($this->viewModel->hasItems());
        self::assertFalse($this->viewModel->hasLoadFailure());
    }

    public function testThrowingSessionSetsTheFlagAndAnswersZeroItems(): void
    {
        $this->checkoutSession->method('getQuote')->willThrowException(new \RuntimeException('quote gone'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::atLeastOnce())
            ->method('error')
            ->with(self::stringContains('quote gone'));
        $viewModel = $this->viewModel($logger);

        self::assertFalse($viewModel->hasLoadFailure(), 'nothing read yet');
        self::assertSame(0, $viewModel->getItemCount());
        self::assertFalse($viewModel->hasItems());
        self::assertTrue($viewModel->hasLoadFailure());
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('quoteReaders')]
    public function testEveryQuoteReaderRaisesTheFlag(string $method, mixed $fallback): void
    {
        $this->checkoutSession->method('getQuote')->willThrowException(new \RuntimeException('quote gone'));

        self::assertSame($fallback, $this->viewModel->{$method}());
        self::assertTrue($this->viewModel->hasLoadFailure(), $method);
    }

    /**
     * @return array<string, array{string, mixed}>
     */
    public static function quoteReaders(): array
    {
        return [
            'items' => ['getItems', []],
            'subtotal' => ['getSubtotal', 0.0],
            'formatted subtotal' => ['getFormattedSubtotal', ''],
            'grand total' => ['getGrandTotal', 0.0],
            'formatted grand total' => ['getFormattedGrandTotal', ''],
            'discount' => ['getDiscountAmount', 0.0],
            'coupon' => ['getAppliedCoupon', ''],
            'shipping' => ['getShippingAmount', 0.0],
            'tax' => ['getTaxAmount', 0.0],
            'totals rows' => ['getTotalsRows', []],
            'shipping rates' => ['getShippingRates', []],
            'selected shipping method' => ['getSelectedShippingMethod', ''],
            'fpt lines' => ['getFptLines', []],
            'estimate address' => ['getEstimateAddress', ['country_id' => '', 'region_id' => '', 'region' => '', 'postcode' => '']],
        ];
    }

    /**
     * The header count follows the cart link setting like core: the sum of
     * the quantities (a decimal sum is not truncated) or the number of lines.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('cartCounts')]
    public function testTheCartCountFollowsTheCartLinkSetting(
        bool $useQty,
        float $itemsQty,
        int $itemsCount,
        float|int $expected,
        string $display
    ): void {
        $quote = $this->createStub(Quote::class);
        $quote->method('getItemsQty')->willReturn($itemsQty);
        $quote->method('getItemsCount')->willReturn($itemsCount);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        $this->scopeConfig->method('isSetFlag')->willReturn($useQty);

        self::assertSame($expected, $this->viewModel->getItemCount());
        self::assertSame($display, $this->viewModel->getItemCountDisplay());
        self::assertSame($expected > 0, $this->viewModel->hasItems());
    }

    /**
     * @return array<string, array{bool, float, int, float|int, string}>
     */
    public static function cartCounts(): array
    {
        return [
            'sum of whole quantities' => [true, 3.0, 2, 3, '3'],
            'sum with a decimal quantity' => [true, 2.5, 2, 2.5, '2.5'],
            'half a unit is not an empty cart' => [true, 0.5, 1, 0.5, '0.5'],
            'sum rounded to two decimals' => [true, 1.999, 1, 2, '2'],
            'number of lines' => [false, 7.5, 2, 2, '2'],
            'empty cart' => [true, 0.0, 0, 0, ''],
        ];
    }

    /**
     * A quote line with the amounts the tax collector stores on it: 34.00 a
     * unit, 36.81 with 8.25 % tax, quantity 2 unless told otherwise.
     *
     * @param array<string, mixed> $magic answers of the item's magic getters
     */
    private function line(int $id, float $qty = 2.0, array $magic = []): QuoteItem&Stub
    {
        $magic += ['getRowTotal' => 68.0, 'getPriceInclTax' => 36.81, 'getRowTotalInclTax' => 73.61];
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn('simple');
        $item = $this->createStub(QuoteItem::class);
        $item->method('getId')->willReturn($id);
        $item->method('getProduct')->willReturn($product);
        $item->method('getQty')->willReturn($qty);
        $item->method('getCalculationPrice')->willReturn(34.0);
        $item->method('getData')->willReturnMap([['has_error', null, null], ['product_id', null, $id + 100]]);
        $item->method('getMessage')->willReturn([]);
        $item->method('__call')->willReturnCallback(static fn (string $method) => $magic[$method] ?? null);

        return $item;
    }

    /**
     * @param QuoteItem[] $items
     */
    private function quoteWithItems(array $items): void
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getAllVisibleItems')->willReturn($items);
        $quote->method('getStore')->willReturn($this->createStub(\Magento\Store\Model\Store::class));
        $this->checkoutSession->method('getQuote')->willReturn($quote);
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('cartPriceDisplays')]
    public function testItemPricesFollowTheCartPriceTaxDisplay(
        bool $including,
        bool $both,
        string $price,
        ?string $priceExcl,
        string $rowTotal,
        ?string $rowTotalExcl
    ): void {
        $this->taxConfig->method('displayCartPricesInclTax')->willReturn($including);
        $this->taxConfig->method('displayCartPricesBoth')->willReturn($both);
        $this->quoteWithItems([$this->line(7)]);

        $item = $this->viewModel->getItems()[0];

        self::assertSame($price, $item['price_display']);
        self::assertSame($priceExcl, $item['price_display_excl']);
        self::assertSame($rowTotal, $item['row_total_display']);
        self::assertSame($rowTotalExcl, $item['row_total_display_excl']);
        self::assertSame(68.0, $item['row_total'], 'the float keeps its excluding-tax meaning');
        self::assertSame(73.61, $item['row_total_incl']);
        self::assertFalse($this->viewModel->hasLoadFailure());
    }

    /**
     * @return array<string, array{bool, bool, string, string|null, string, string|null}>
     */
    public static function cartPriceDisplays(): array
    {
        return [
            'excluding tax' => [false, false, '34.00', null, '68.00', null],
            'including tax' => [true, false, '36.81', null, '73.61', null],
            'both' => [false, true, '36.81', '34.00', '73.61', '68.00'],
        ];
    }

    private function stockItem(bool $decimal, float|false $increments, float $minSale, float $maxSale): StockItemInterface&Stub
    {
        $stockItem = $this->createStub(StockItemInterface::class);
        $stockItem->method('getIsQtyDecimal')->willReturn($decimal);
        $stockItem->method('getQtyIncrements')->willReturn($increments);
        $stockItem->method('getMinSaleQty')->willReturn($minSale);
        $stockItem->method('getMaxSaleQty')->willReturn($maxSale);

        return $stockItem;
    }

    /**
     * @param array{bool, float|false, float, float} $stock decimal, increments, minimum and maximum sale quantity
     * @param array{is_qty_decimal: bool, qty_step: float|int|string, qty_min: float|int, qty_max: float|int|null} $expected
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('quantityRules')]
    public function testQuantityRulesComeFromTheStockItem(array $stock, float $qty, array $expected): void
    {
        $this->stockRegistry->method('getStockItem')->willReturn($this->stockItem(...$stock));
        $this->quoteWithItems([$this->line(7, $qty)]);

        $item = $this->viewModel->getItems()[0];

        self::assertSame($qty, $item['qty'], 'the quantity is never truncated');
        self::assertSame(
            $expected,
            array_intersect_key($item, $expected)
        );
    }

    /**
     * @return array<string, array{array{bool, float|false, float, float}, float, array<string, mixed>}>
     */
    public static function quantityRules(): array
    {
        return [
            'whole-unit product' => [
                [false, false, 1.0, 10000.0],
                2.0,
                ['is_qty_decimal' => false, 'qty_step' => 1, 'qty_min' => 1, 'qty_max' => 10000],
            ],
            'decimal product' => [
                [true, false, 1.0, 10000.0],
                1.5,
                ['is_qty_decimal' => true, 'qty_step' => 'any', 'qty_min' => 1, 'qty_max' => 10000],
            ],
            'decimal product sold from half a unit' => [
                [true, false, 0.5, 0.0],
                1.5,
                ['is_qty_decimal' => true, 'qty_step' => 'any', 'qty_min' => 0.5, 'qty_max' => null],
            ],
            'decimal product without a minimum' => [
                [true, false, 0.0, 0.0],
                0.25,
                ['is_qty_decimal' => true, 'qty_step' => 'any', 'qty_min' => 0.0001, 'qty_max' => null],
            ],
            'product sold in increments of five' => [
                [false, 5.0, 1.0, 10000.0],
                10.0,
                ['is_qty_decimal' => false, 'qty_step' => 5, 'qty_min' => 5, 'qty_max' => 10000],
            ],
            'decimal increments' => [
                [true, 0.25, 1.0, 0.0],
                1.25,
                ['is_qty_decimal' => true, 'qty_step' => 0.25, 'qty_min' => 1, 'qty_max' => null],
            ],
        ];
    }

    public function testAnUnreadableStockItemLeavesWholeUnitRulesAndNoLoadFailure(): void
    {
        $this->stockRegistry->method('getStockItem')->willThrowException(new \RuntimeException('no stock item'));
        $this->quoteWithItems([$this->line(7)]);

        $item = $this->viewModel->getItems()[0];

        self::assertSame([false, 1, 1, null], [$item['is_qty_decimal'], $item['qty_step'], $item['qty_min'], $item['qty_max']]);
        self::assertFalse($this->viewModel->hasLoadFailure());
    }

    /**
     * @param array<string, mixed> $data code, carrier_title, method_title, method, price, error_message
     */
    private function rate(array $data): Rate&Stub
    {
        $rate = $this->createStub(Rate::class);
        $rate->method('__call')->willReturnCallback(
            static fn (string $method) => $data[strtolower((string) preg_replace('/(?<!^)[A-Z]/', '_$0', substr($method, 3)))] ?? null
        );

        return $rate;
    }

    /**
     * A quote in `$currency` whose shipping address carries the rates. The
     * converter double does what core's does: base price times the rate of
     * the quote currency, with 8.25 % tax for the including amount, and
     * `available` false for a rate that carries an error message.
     *
     * @param Rate[] $rates
     */
    private function quoteWithRates(array $rates, string $currency = 'EUR', float $currencyRate = 1.0): void
    {
        $address = $this->createStub(QuoteAddress::class);
        $address->method('getCountryId')->willReturn('US');
        $address->method('getPostcode')->willReturn('48201');
        $address->method('getGroupedAllShippingRates')->willReturn(['carrier' => $rates]);
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(5);
        $quote->method('getShippingAddress')->willReturn($address);
        $quote->method('__call')->willReturnCallback(
            static fn (string $method) => $method === 'getQuoteCurrencyCode' ? $currency : null
        );
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        $this->shippingMethodConverter->method('modelToDataObject')->willReturnCallback(
            function (Rate $rate, string $code) use ($currency, $currencyRate): ShippingMethodInterface {
                self::assertSame($currency, $code, 'the converter gets the quote currency');
                $error = (string) $rate->getErrorMessage();
                $excl = round((float) $rate->getPrice() * $currencyRate, 2);
                $method = $this->createStub(ShippingMethodInterface::class);
                $method->method('getAvailable')->willReturn($error === '');
                $method->method('getErrorMessage')->willReturn($error === '' ? false : $error);
                $method->method('getPriceExclTax')->willReturn($excl);
                $method->method('getPriceInclTax')->willReturn(round($excl * 1.0825, 2));

                return $method;
            }
        );
    }

    private function flatRate(): Rate&Stub
    {
        return $this->rate([
            'code' => 'flatrate_flatrate',
            'carrier_title' => 'Flat Rate',
            'method_title' => 'Fixed',
            'method' => 'flatrate',
            'price' => 5.0,
        ]);
    }

    public function testARateIsConvertedToTheQuoteCurrencyBeforeItIsFormatted(): void
    {
        $this->quoteWithRates([$this->flatRate()], 'USD', 1.09);

        $rates = $this->viewModel->getShippingRates();

        self::assertCount(1, $rates);
        self::assertSame('flatrate_flatrate', $rates[0]['code']);
        self::assertSame('Flat Rate -- Fixed', $rates[0]['title']);
        self::assertSame(5.45, $rates[0]['price'], '5.00 in the base currency at 1.09');
        self::assertSame('5.45', $rates[0]['formatted_price']);
        self::assertNull($rates[0]['formatted_price_excl']);
        self::assertTrue($rates[0]['available']);
        self::assertSame('', $rates[0]['error_message']);
        self::assertFalse($this->viewModel->hasLoadFailure());
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('shippingTaxDisplays')]
    public function testRatesFollowTheShippingTaxDisplay(bool $including, bool $both, string $price, ?string $priceExcl): void
    {
        $this->taxHelper->method('displayShippingPriceIncludingTax')->willReturn($including);
        $this->taxHelper->method('displayShippingBothPrices')->willReturn($both);
        $this->quoteWithRates([$this->flatRate()]);

        $rate = $this->viewModel->getShippingRates()[0];

        self::assertSame($price, $rate['formatted_price']);
        self::assertSame($priceExcl, $rate['formatted_price_excl']);
    }

    /**
     * @return array<string, array{bool, bool, string, string|null}>
     */
    public static function shippingTaxDisplays(): array
    {
        return [
            'excluding tax' => [false, false, '5.00', null],
            'including tax' => [true, false, '5.41', null],
            'both' => [false, true, '5.41', '5.00'],
        ];
    }

    public function testAnErrorRateStaysInTheListAsUnavailableWithItsMessageAndNoPrice(): void
    {
        $error = $this->rate([
            'code' => 'freeshipping_error',
            'carrier_title' => 'Free Shipping',
            'price' => 0.0,
            'error_message' => 'This shipping method is not available.',
        ]);
        $this->quoteWithRates([$this->flatRate(), $error]);

        $rates = $this->viewModel->getShippingRates();

        self::assertCount(2, $rates);
        self::assertTrue($rates[0]['available']);
        self::assertSame(
            [
                'code' => 'freeshipping_error',
                'title' => 'Free Shipping',
                'price' => 0.0,
                'formatted_price' => '',
                'formatted_price_excl' => null,
                'available' => false,
                'error_message' => 'This shipping method is not available.',
            ],
            $rates[1]
        );
    }

    /**
     * A quote address with a country only (the default country core copies in)
     * is no destination: the quote shipping address of the fixture carries
     * `US` and nothing else.
     */
    private function quoteWithoutDestination(bool $virtual = false): QuoteAddress&Stub
    {
        $address = $this->createStub(QuoteAddress::class);
        $address->method('getCountryId')->willReturn('US');
        $address->method('getRegionId')->willReturn(null);
        $address->method('getRegion')->willReturn(null);
        $address->method('getPostcode')->willReturn(null);
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(5);
        $quote->method('isVirtual')->willReturn($virtual);
        $quote->method('getShippingAddress')->willReturn($address);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        return $address;
    }

    private function customerWithDefaultShipping(?array $address): void
    {
        $this->customerSession->method('isLoggedIn')->willReturn(true);
        $customer = $this->createStub(Customer::class);
        if ($address === null) {
            $customer->method('getDefaultShippingAddress')->willReturn(false);
        } else {
            $region = $this->createStub(RegionInterface::class);
            $region->method('getRegionId')->willReturn($address['region_id']);
            $region->method('getRegion')->willReturn($address['region']);
            $data = $this->createStub(CustomerAddressData::class);
            $data->method('getCountryId')->willReturn($address['country_id']);
            $data->method('getRegion')->willReturn($region);
            $data->method('getPostcode')->willReturn($address['postcode']);
            $model = $this->createStub(CustomerAddress::class);
            $model->method('getDataModel')->willReturn($data);
            $customer->method('getDefaultShippingAddress')->willReturn($model);
        }
        $this->customerSession->method('getCustomer')->willReturn($customer);
    }

    public function testEstimateAddressFallsBackToTheCustomerDefaultShippingAddress(): void
    {
        $this->quoteWithoutDestination();
        $this->customerWithDefaultShipping(['country_id' => 'US', 'region_id' => 33, 'region' => 'Michigan', 'postcode' => '49628']);

        self::assertSame(
            ['country_id' => 'US', 'region_id' => '33', 'region' => 'Michigan', 'postcode' => '49628'],
            $this->viewModel->getEstimateAddress()
        );
        self::assertFalse($this->viewModel->hasLoadFailure());
    }

    public function testEstimateAddressKeepsTheDestinationOfTheQuote(): void
    {
        $address = $this->createStub(QuoteAddress::class);
        $address->method('getCountryId')->willReturn('DE');
        $address->method('getRegionId')->willReturn(0);
        $address->method('getRegion')->willReturn(null);
        $address->method('getPostcode')->willReturn('10115');
        $quote = $this->createStub(Quote::class);
        $quote->method('getShippingAddress')->willReturn($address);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        $this->customerWithDefaultShipping(['country_id' => 'US', 'region_id' => 33, 'region' => 'Michigan', 'postcode' => '49628']);

        self::assertSame(
            ['country_id' => 'DE', 'region_id' => '', 'region' => '', 'postcode' => '10115'],
            $this->viewModel->getEstimateAddress()
        );
    }

    public function testAGuestStartsFromTheDefaultCountry(): void
    {
        $address = $this->createStub(QuoteAddress::class);
        $address->method('getCountryId')->willReturn(null);
        $address->method('getRegionId')->willReturn(null);
        $address->method('getRegion')->willReturn(null);
        $address->method('getPostcode')->willReturn(null);
        $quote = $this->createStub(Quote::class);
        $quote->method('getShippingAddress')->willReturn($address);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        $this->customerSession->method('isLoggedIn')->willReturn(false);
        $this->scopeConfig->method('getValue')->willReturn('IT');

        self::assertSame(
            ['country_id' => 'IT', 'region_id' => '', 'region' => '', 'postcode' => ''],
            $this->viewModel->getEstimateAddress()
        );
    }

    public function testACustomerWithoutADefaultAddressStartsFromTheQuoteCountry(): void
    {
        $this->quoteWithoutDestination();
        $this->customerWithDefaultShipping(null);

        self::assertSame(
            ['country_id' => 'US', 'region_id' => '', 'region' => '', 'postcode' => ''],
            $this->viewModel->getEstimateAddress()
        );
    }

    public function testShippingRatesAreCollectedInMemoryForTheDefaultAddress(): void
    {
        $address = $this->createMock(QuoteAddress::class);
        $address->method('getCountryId')->willReturn('US');
        $address->method('getRegionId')->willReturn(null);
        $address->method('getRegion')->willReturn(null);
        $address->method('getPostcode')->willReturn(null);
        $address->expects(self::exactly(2))->method('getGroupedAllShippingRates')->willReturn([]);
        $address->expects(self::once())->method('setCountryId')->with('US')->willReturnSelf();
        $address->expects(self::once())->method('setRegionId')->with(33)->willReturnSelf();
        $address->expects(self::once())->method('setRegion')->with('Michigan')->willReturnSelf();
        $address->expects(self::once())->method('setPostcode')->with('49628')->willReturnSelf();
        $address->expects(self::once())->method('__call')->with('setCollectShippingRates', [true])->willReturnSelf();
        $address->expects(self::once())->method('collectShippingRates')->willReturnSelf();
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(5);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getShippingAddress')->willReturn($address);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
        $this->customerWithDefaultShipping(['country_id' => 'US', 'region_id' => 33, 'region' => 'Michigan', 'postcode' => '49628']);

        self::assertSame([], $this->viewModel->getShippingRates());
        self::assertFalse($this->viewModel->hasLoadFailure());
    }

    public function testNoRatesAreCollectedForAGuestOrAVirtualQuote(): void
    {
        $address = $this->quoteWithoutDestination(true);
        $this->customerWithDefaultShipping(['country_id' => 'US', 'region_id' => 33, 'region' => 'Michigan', 'postcode' => '49628']);
        $address->method('getGroupedAllShippingRates')->willReturn([]);

        self::assertSame([], $this->viewModel->getShippingRates());

        $guest = $this->createMock(QuoteAddress::class);
        $guest->method('getCountryId')->willReturn('US');
        $guest->method('getRegionId')->willReturn(null);
        $guest->method('getRegion')->willReturn(null);
        $guest->method('getPostcode')->willReturn(null);
        $guest->method('getGroupedAllShippingRates')->willReturn([]);
        $guest->expects(self::never())->method('collectShippingRates');
        $quote = $this->createStub(Quote::class);
        $quote->method('getId')->willReturn(6);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getShippingAddress')->willReturn($guest);
        $session = $this->createStub(Session::class);
        $session->method('getQuote')->willReturn($quote);
        $this->checkoutSession = $session;
        $this->customerSession = $this->createStub(CustomerSession::class);
        $this->customerSession->method('isLoggedIn')->willReturn(false);

        self::assertSame([], $this->viewModel($this->createStub(LoggerInterface::class))->getShippingRates());
    }
}

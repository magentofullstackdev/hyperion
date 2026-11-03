<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\ViewModel;

use Magento\Catalog\Helper\Image;
use Magento\Catalog\Helper\Product\ConfigurationPool;
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
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as QuoteAddress;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magento\Tax\Model\Config as TaxConfig;
use Magentofullstackdev\HyperionCheckout\Model\WeeeBridge;
use Magentofullstackdev\HyperionCheckout\ViewModel\CartData;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A quote that cannot be loaded answers 0 items like an empty cart; the
 * `hasLoadFailure()` flag is what tells the templates apart.
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
    private CartData $viewModel;

    protected function setUp(): void
    {
        $this->checkoutSession = $this->createStub(Session::class);
        $this->customerSession = $this->createStub(CustomerSession::class);
        $this->scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $this->viewModel = $this->viewModel($this->createStub(LoggerInterface::class));
    }

    /**
     * The logger is the one dependency a test verifies: a stub by default, a
     * mock when the test hands one in.
     */
    private function viewModel(LoggerInterface $logger): CartData
    {
        return new CartData(
            $this->checkoutSession,
            $this->createStub(PriceCurrencyInterface::class),
            $this->createStub(UrlInterface::class),
            $this->createStub(Image::class),
            $this->createStub(ConfigurationPool::class),
            $logger,
            $this->createStub(TaxConfig::class),
            $this->createStub(WeeeBridge::class),
            $this->customerSession,
            $this->createStub(ModuleManager::class),
            $this->scopeConfig,
            $this->createStub(Availability::class)
        );
    }

    public function testLoadedQuoteLeavesTheFlagDown(): void
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getItemsQty')->willReturn(3.0);
        $quote->method('getAllVisibleItems')->willReturn([]);
        $this->checkoutSession->method('getQuote')->willReturn($quote);
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

    /**
     * @dataProvider quoteReaders
     */
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

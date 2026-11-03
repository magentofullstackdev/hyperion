<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\ViewModel;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Item as OrderItem;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Store\Model\Website;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use Magentofullstackdev\HyperionCore\ViewModel\GoogleGtag;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class GoogleGtagTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $config = [];
    private GoogleGtag $viewModel;

    protected function setUp(): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(fn (string $path) => !empty($this->config[$path]));
        $scopeConfig->method('getValue')->willReturnCallback(fn (string $path) => $this->config[$path] ?? null);
        $store = $this->createStub(Store::class);
        $store->method('getCurrentCurrencyCode')->willReturn('EUR');
        $website = $this->createStub(Website::class);
        $website->method('getId')->willReturn(2);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $storeManager->method('getWebsite')->willReturn($website);
        $summary = $this->createStub(ProductSummary::class);
        $summary->method('toJson')->willReturnCallback(static fn (array $data) => (string) json_encode($data));
        $this->viewModel = new GoogleGtag($scopeConfig, $storeManager, $summary, $this->createStub(LoggerInterface::class));
    }

    public function testDisabledUntilActiveWithAnId(): void
    {
        $this->assertFalse($this->viewModel->isEnabled());
        $this->config[GoogleGtag::XML_PATH_GA4_ACTIVE] = 1;
        $this->assertFalse($this->viewModel->isAnalyticsEnabled());
        $this->config[GoogleGtag::XML_PATH_GA4_MEASUREMENT_ID] = ' G-TEST12345 ';
        $this->assertTrue($this->viewModel->isAnalyticsEnabled());
        $this->assertSame('G-TEST12345', $this->viewModel->getMeasurementId());
        $this->assertFalse($this->viewModel->isAdsEnabled());
        $this->config[GoogleGtag::XML_PATH_ADS_ACTIVE] = 1;
        $this->config[GoogleGtag::XML_PATH_ADS_CONVERSION_ID] = 'AW-1';
        $this->assertTrue($this->viewModel->isAdsEnabled());
        $this->assertSame(2, $this->viewModel->getWebsiteId());
        $this->assertSame('EUR', $this->viewModel->getCurrencyCode());
    }

    public function testPurchasePayloadMatchesCoreOrderTracking(): void
    {
        $item = $this->createStub(OrderItem::class);
        $item->method('getSku')->willReturn('24-MB01');
        $item->method('getName')->willReturn('Joust Duffle Bag');
        $item->method('getPrice')->willReturn(34.0);
        $item->method('getQtyOrdered')->willReturn(2.0);
        $order = $this->createStub(Order::class);
        $order->method('getAllVisibleItems')->willReturn([$item]);
        $order->method('getIncrementId')->willReturn('000000123');
        $order->method('getGrandTotal')->willReturn(76.805);
        $order->method('getTaxAmount')->willReturn(3.8);
        $order->method('getShippingAmount')->willReturn(5.0);
        $order->method('getOrderCurrencyCode')->willReturn('USD');
        $order->method('getCouponCode')->willReturn('SAVE');

        $this->assertSame(
            [
                'transaction_id' => '000000123',
                'value' => 76.81,
                'tax' => 3.8,
                'shipping' => 5.0,
                'currency' => 'USD',
                'items' => [['item_id' => '24-MB01', 'item_name' => 'Joust Duffle Bag', 'price' => 34.0, 'quantity' => 2]],
                'coupon' => 'SAVE',
            ],
            $this->viewModel->purchase($order)
        );
    }

    public function testAddToCartAndBeginCheckoutUseQuoteItems(): void
    {
        $item = $this->createStub(QuoteItem::class);
        $item->method('getSku')->willReturn('WH01-S-Red');
        $item->method('getName')->willReturn('Hoodie');
        $item->method('getPrice')->willReturn(52.0);
        $item->method('getQty')->willReturn(3.0);

        $add = $this->viewModel->addToCart($item, 2);
        $this->assertSame('EUR', $add['currency']);
        $this->assertSame(104.0, $add['value']);
        $this->assertSame(2.0, $add['items'][0]['quantity']);

        $quote = $this->createStub(Quote::class);
        $quote->method('getAllVisibleItems')->willReturn([$item]);
        // Magic DataObject getters (quote_currency_code, grand_total, coupon_code) go through __call.
        $quote->method('__call')->willReturnCallback(static fn (string $name) => match ($name) {
            'getQuoteCurrencyCode' => 'EUR',
            'getGrandTotal' => 161.0,
            default => null,
        });
        $begin = $this->viewModel->beginCheckout($quote);
        $this->assertSame(161.0, $begin['value']);
        $this->assertSame(3.0, $begin['items'][0]['quantity']);
        $this->assertArrayNotHasKey('coupon', $begin);
        $this->assertEquals($begin, json_decode($this->viewModel->toJson($begin), true));
    }
}

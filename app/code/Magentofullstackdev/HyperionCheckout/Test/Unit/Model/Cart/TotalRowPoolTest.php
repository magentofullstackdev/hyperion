<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Cart;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Address\Total;
use Magentofullstackdev\HyperionCheckout\Api\Cart\TotalRowRendererInterface;
use Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow\RendererInterface;
use Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow\RowBuilder;
use Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The cart summary lists what the quote collected: a renderer per known
 * total code, a plain row for any other total, in the store's totals sort
 * order. Renderers are class names built on first use; an entry that is
 * not a usable renderer is logged and its total prints as the plain row.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool
 */
class TotalRowPoolTest extends TestCase
{
    /**
     * The codes a stock address `getTotals()` returns, each with a renderer
     * of its own: the fetch() methods of the quote collectors Magento_Quote,
     * Magento_SalesRule, Magento_Tax and Magento_Weee declare in sales.xml.
     * The collectors `tax_subtotal`, `tax_shipping`, `weee` and
     * `shipping_discount` return no total of their own code.
     */
    private const STOCK_CODES = ['subtotal', 'discount', 'shipping', 'weee_tax', 'tax', 'grand_total'];

    /** Core's default `sales/totals_sort`, with the two Magento_Weee entries. */
    private const TOTALS_SORT = [
        'discount' => '20',
        'grand_total' => '100',
        'shipping' => '30',
        'subtotal' => '10',
        'tax' => '40',
        'weee' => '35',
        'weee_tax' => '35',
    ];

    /**
     * @param array<int, array{0: string, 1: string, 2: mixed}> $totals code, title, value in collection order
     * @param string[] $expected row codes in display order
     */
    #[DataProvider('stockQuotes')]
    public function testAStockQuoteListsItsTotalsInTheConfiguredOrder(array $totals, array $expected): void
    {
        $pool = $this->pool($this->echoRenderers(self::STOCK_CODES));

        self::assertSame($expected, array_column($pool->getRows($this->quote($totals)), 'code'));
    }

    /**
     * What the address of a stock quote returns, in the order the collectors
     * run (subtotal, discount, shipping, tax, weee_tax, grand_total).
     *
     * @return array<string, array{array<int, array{0: string, 1: string, 2: mixed}>, string[]}>
     */
    public static function stockQuotes(): array
    {
        return [
            'physical' => [
                [
                    ['subtotal', 'Subtotal', '59.0000'],
                    ['shipping', 'Shipping & Handling (Flat Rate - Fixed)', '5.0000'],
                    ['tax', 'Tax', '4.8700'],
                    ['grand_total', 'Grand Total', '68.8700'],
                ],
                ['subtotal', 'shipping', 'tax', 'grand_total'],
            ],
            'coupon' => [
                [
                    ['subtotal', 'Subtotal', '7.0000'],
                    ['discount', 'Discount (Use promo code H20 at checkout)', '-4.9000'],
                    ['shipping', 'Shipping & Handling (Flat Rate - Fixed)', '5.0000'],
                    ['tax', 'Tax', '0.0000'],
                    ['grand_total', 'Grand Total', '7.1000'],
                ],
                ['subtotal', 'discount', 'shipping', 'tax', 'grand_total'],
            ],
            'virtual' => [
                [
                    ['subtotal', 'Subtotal', '9.9900'],
                    ['shipping', '', null],
                    ['tax', 'Tax', '0.0000'],
                    ['grand_total', 'Grand Total', '9.9900'],
                ],
                ['subtotal', 'shipping', 'tax', 'grand_total'],
            ],
            'fixed product tax' => [
                [
                    ['subtotal', 'Subtotal', '59.0000'],
                    ['discount', 'Discount', '-5.0000'],
                    ['shipping', 'Shipping & Handling (Flat Rate - Fixed)', '5.0000'],
                    ['tax', 'Tax', '4.8700'],
                    ['weee_tax', 'FPT', 5.0],
                    ['grand_total', 'Grand Total', '68.8700'],
                ],
                ['subtotal', 'discount', 'shipping', 'weee_tax', 'tax', 'grand_total'],
            ],
        ];
    }

    public function testEveryStockCodeHasARendererInTheFrontendConfiguration(): void
    {
        $di = new \DOMDocument();
        self::assertTrue($di->load(dirname(__DIR__, 4) . '/etc/frontend/di.xml'));
        $items = (new \DOMXPath($di))->query(
            '//type[@name="' . TotalRowPool::class . '"]/arguments/argument[@name="renderers"]/item'
        );
        $declared = [];
        foreach ($items as $item) {
            /** @var \DOMElement $item */
            $class = trim($item->textContent);
            self::assertSame('string', $item->getAttribute('xsi:type'), $class . ' must be a class name string');
            self::assertTrue(is_a($class, TotalRowRendererInterface::class, true), $class);
            self::assertFalse(is_a($class, RendererInterface::class, true), $class . ' implements the deprecated name');
            $declared[] = $item->getAttribute('name');
        }
        sort($declared);
        $stock = self::STOCK_CODES;
        sort($stock);

        self::assertSame($stock, $declared);
    }

    public function testATotalWithoutARendererIsAPlainRowBehindTheTotalCollectedBeforeIt(): void
    {
        $pool = $this->pool($this->echoRenderers(self::STOCK_CODES));
        $rows = $pool->getRows($this->quote([
            ['subtotal', 'Subtotal', '59.0000'],
            ['shipping', 'Shipping', '5.0000'],
            ['hyperion_test_fee', 'Handling Fee', '2.5000'],
            ['tax', 'Tax', '4.8700'],
            ['grand_total', 'Grand Total', '71.3700'],
        ]));

        self::assertSame(
            ['subtotal', 'shipping', 'hyperion_test_fee', 'tax', 'grand_total'],
            array_column($rows, 'code')
        );
        self::assertSame(
            ['code' => 'hyperion_test_fee', 'label' => 'Handling Fee', 'note' => '', 'value' => '2.50', 'kind' => 'regular'],
            $rows[2]
        );
    }

    public function testATotalCollectedBehindTheFixedProductTaxPrintsBehindItAndBeforeTheTax(): void
    {
        $pool = $this->pool($this->echoRenderers(self::STOCK_CODES));
        $rows = $pool->getRows($this->quote([
            ['subtotal', 'Subtotal', '59.0000'],
            ['shipping', 'Shipping', '5.0000'],
            ['tax', 'Tax', '4.8700'],
            ['weee_tax', 'FPT', 5.0],
            ['hyperion_test_fee', 'Handling Fee', '2.5000'],
            ['grand_total', 'Grand Total', '76.3700'],
        ]));

        self::assertSame(
            ['subtotal', 'shipping', 'weee_tax', 'hyperion_test_fee', 'tax', 'grand_total'],
            array_column($rows, 'code')
        );
    }

    public function testATotalCollectedAfterTheGrandTotalStillPrintsBeforeIt(): void
    {
        $pool = $this->pool($this->echoRenderers(self::STOCK_CODES));
        $rows = $pool->getRows($this->quote([
            ['subtotal', 'Subtotal', '59.0000'],
            ['tax', 'Tax', '4.8700'],
            ['grand_total', 'Grand Total', '64.8700'],
            ['late_fee', 'Late Fee', 1.0],
        ]));

        self::assertSame(['subtotal', 'tax', 'late_fee', 'grand_total'], array_column($rows, 'code'));
    }

    public function testANegativeUnknownTotalReadsAsADiscount(): void
    {
        $rows = $this->pool([])->getRows($this->quote([['store_credit', 'Store Credit', '-3.0000']]));

        self::assertSame(
            [['code' => 'store_credit', 'label' => 'Store Credit', 'note' => '', 'value' => '-3.00', 'kind' => 'discount']],
            $rows
        );
    }

    public function testNullZeroUntitledAndStructuralTotalsAreNotRows(): void
    {
        $rows = $this->pool([])->getRows($this->quote([
            ['null_total', 'Null', null],
            ['zero_total', 'Zero', '0.0000'],
            ['untitled_total', '', '4.0000'],
            ['tax_subtotal', 'Tax Subtotal', '1.0000'],
            ['tax_shipping', 'Tax Shipping', '1.0000'],
            ['weee', 'FPT', '1.0000'],
            ['msrp', 'MSRP', '1.0000'],
            ['kept', 'Kept', '1.0000'],
        ]));

        self::assertSame(['kept'], array_column($rows, 'code'));
    }

    public function testAVirtualQuoteReadsTheTotalsOfItsBillingAddress(): void
    {
        $quote = $this->quote([['fee', 'Billing Fee', '2.0000']], true);

        self::assertSame(['Billing Fee'], array_column($this->pool([])->getRows($quote), 'label'));
    }

    public function testARendererMayAnswerSeveralRowsOrNone(): void
    {
        $two = $this->createStub(TotalRowRendererInterface::class);
        $two->method('render')->willReturn([
            ['code' => 'subtotal_excl', 'label' => 'A', 'note' => '', 'value' => '1.00', 'kind' => 'regular'],
            ['code' => 'subtotal_incl', 'label' => 'B', 'note' => '', 'value' => '2.00', 'kind' => 'regular'],
        ]);
        $none = $this->createStub(TotalRowRendererInterface::class);
        $none->method('render')->willReturn([]);
        $rows = $this->pool(['subtotal' => $two, 'shipping' => $none])->getRows($this->quote([
            ['subtotal', 'Subtotal', '1.0000'],
            ['shipping', 'Shipping', '0.0000'],
        ]));

        self::assertSame(['subtotal_excl', 'subtotal_incl'], array_column($rows, 'code'));
    }

    public function testAClassNameIsBuiltOnlyWhenTheQuoteCarriesItsTotalAndOnlyOnce(): void
    {
        $renderer = $this->echoRenderers(['hyperion_test_fee'])['hyperion_test_fee'];
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects(self::once())->method('get')->with('Vendor\\Fee\\Renderer')->willReturn($renderer);
        $pool = $this->pool(
            ['hyperion_test_fee' => '\\Vendor\\Fee\\Renderer', 'unused_total' => 'Vendor\\Unused\\Renderer'],
            $objectManager
        );
        $quote = $this->quote([['subtotal', 'Subtotal', '9.0000'], ['hyperion_test_fee', 'Fee', '2.0000']]);

        $pool->getRows($quote);
        $rows = $pool->getRows($quote);

        self::assertSame(['subtotal', 'hyperion_test_fee'], array_column($rows, 'code'));
    }

    public function testARendererWrittenAgainstTheDeprecatedNameIsAccepted(): void
    {
        $legacy = $this->createStub(RendererInterface::class);
        $legacy->method('render')->willReturn([
            ['code' => 'fee', 'label' => 'Legacy fee', 'note' => '', 'value' => '1.00', 'kind' => 'regular'],
        ]);

        $rows = $this->pool(['fee' => $legacy])->getRows($this->quote([['fee', 'Fee', '1.0000']]));

        self::assertSame(['Legacy fee'], array_column($rows, 'label'));
    }

    /**
     * @param mixed $entry
     */
    #[DataProvider('unusableEntries')]
    public function testAnUnusableEntryIsLoggedOnceAndItsTotalPrintsAsThePlainRow($entry, bool $builds): void
    {
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        if ($builds) {
            $objectManager->method('get')->willReturn(new \stdClass());
        } else {
            $objectManager->method('get')->willThrowException(new \ReflectionException('Class "Vendor\\Missing" does not exist'));
        }
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('"fee"'));
        $pool = $this->pool(['fee' => $entry], $objectManager, $logger);
        $quote = $this->quote([['fee', 'Handling Fee', '2.5000']]);

        $pool->getRows($quote);
        $rows = $pool->getRows($quote);

        self::assertSame(
            [['code' => 'fee', 'label' => 'Handling Fee', 'note' => '', 'value' => '2.50', 'kind' => 'regular']],
            $rows
        );
    }

    /**
     * @return array<string, array{0: mixed, 1: bool}>
     */
    public static function unusableEntries(): array
    {
        return [
            'unknown class' => ['Vendor\\Missing', false],
            'class that is not a renderer' => ['Vendor\\NotARenderer', true],
            'object that is not a renderer' => [new \stdClass(), false],
            'empty string' => ['', false],
            'array' => [['class' => 'Vendor\\Fee'], false],
        ];
    }

    public function testARendererThatThrowsIsLoggedAndItsTotalPrintsAsThePlainRow(): void
    {
        $broken = $this->createStub(TotalRowRendererInterface::class);
        $broken->method('render')->willThrowException(new \RuntimeException('fee service down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('fee service down'));

        $rows = $this->pool(['fee' => $broken], null, $logger)->getRows($this->quote([['fee', 'Handling Fee', '2.5000']]));

        self::assertSame(['Handling Fee'], array_column($rows, 'label'));
    }

    public function testRowsOfAnotherShapeAreSkippedAndTheRestNormalized(): void
    {
        $renderer = $this->createStub(TotalRowRendererInterface::class);
        $renderer->method('render')->willReturn([
            ['code' => 'fee', 'label' => 'Fee', 'value' => '1.00'],
            ['code' => 'fee_detail', 'label' => 'Detail', 'note' => 'n', 'value' => '0.50', 'kind' => 'sparkly'],
            ['label' => 'No code', 'value' => '1.00'],
            ['code' => 'fee_amount', 'label' => 'Amount', 'value' => 1.0],
        ]);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('2 row(s)'));

        $pool = $this->pool(['fee' => $renderer], null, $logger);
        $pool->getRows($this->quote([['fee', 'Fee', '1.0000']]));
        $rows = $pool->getRows($this->quote([['fee', 'Fee', '1.0000']]));

        self::assertSame(
            [
                ['code' => 'fee', 'label' => 'Fee', 'note' => '', 'value' => '1.00', 'kind' => 'regular'],
                ['code' => 'fee_detail', 'label' => 'Detail', 'note' => 'n', 'value' => '0.50', 'kind' => 'regular'],
            ],
            $rows
        );
    }

    public function testARendererWhoseRowsAreAllUnusablePrintsThePlainRow(): void
    {
        $renderer = $this->createStub(TotalRowRendererInterface::class);
        $renderer->method('render')->willReturn([
            ['code' => 'fee', 'label' => 'Fee', 'value' => 1.0],
        ]);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('the plain row is shown'));

        $rows = $this->pool(['fee' => $renderer], null, $logger)->getRows($this->quote([['fee', 'Handling Fee', '2.5000']]));

        self::assertSame(['Handling Fee'], array_column($rows, 'label'));
    }

    /**
     * @param array<string, mixed> $renderers
     */
    private function pool(
        array $renderers,
        ?ObjectManagerInterface $objectManager = null,
        ?LoggerInterface $logger = null
    ): TotalRowPool {
        $priceCurrency = $this->createStub(PriceCurrencyInterface::class);
        $priceCurrency->method('format')->willReturnCallback(
            static fn ($amount): string => number_format((float) $amount, 2)
        );
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn(self::TOTALS_SORT);

        return new TotalRowPool(
            new RowBuilder($priceCurrency),
            $scopeConfig,
            $objectManager ?? $this->createStub(ObjectManagerInterface::class),
            $logger ?? $this->createStub(LoggerInterface::class),
            $renderers
        );
    }

    /**
     * Renderers that answer one row carrying the code of their total.
     *
     * @param string[] $codes
     * @return array<string, TotalRowRendererInterface>
     */
    private function echoRenderers(array $codes): array
    {
        $renderers = [];
        foreach ($codes as $code) {
            $renderer = $this->createStub(TotalRowRendererInterface::class);
            $renderer->method('render')->willReturnCallback(
                static fn (Total $total): array => [[
                    'code' => (string) $total->getCode(),
                    'label' => (string) $total->getData('title'),
                    'note' => '',
                    'value' => (string) $total->getData('value'),
                    'kind' => 'regular',
                ]]
            );
            $renderers[$code] = $renderer;
        }

        return $renderers;
    }

    /**
     * A quote whose totals address (billing when virtual, shipping
     * otherwise) returns the given totals; the other address has none.
     *
     * @param array<int, array{0: string, 1: string, 2: mixed}> $totals code, title, value in collection order
     */
    private function quote(array $totals, bool $virtual = false): Quote
    {
        $collected = [];
        foreach ($totals as [$code, $title, $value]) {
            $collected[$code] = new Total(
                ['code' => $code, 'title' => $title, 'value' => $value],
                $this->createStub(Json::class)
            );
        }
        $carrying = $this->createStub(Address::class);
        $carrying->method('getTotals')->willReturn($collected);
        $other = $this->createStub(Address::class);
        $other->method('getTotals')->willReturn([]);

        $quote = $this->createStub(Quote::class);
        $quote->method('isVirtual')->willReturn($virtual);
        $quote->method('getBillingAddress')->willReturn($virtual ? $carrying : $other);
        $quote->method('getShippingAddress')->willReturn($virtual ? $other : $carrying);

        return $quote;
    }
}

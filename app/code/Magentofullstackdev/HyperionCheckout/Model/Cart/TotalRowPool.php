<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magento\Quote\Model\Quote\Address\Total\Collector;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow\RendererInterface;
use Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow\RowBuilder;

/**
 * The rows of the cart summary, from the totals the quote really collected.
 *
 * Source: the totals of the address that carries them (billing for a
 * virtual quote, shipping otherwise), the list core's cart reads. Each
 * total goes to the renderer registered for its code (`renderers` argument,
 * etc/frontend/di.xml); a total without a renderer, such as one a third
 * party collector adds, becomes a plain row from its title and value.
 *
 * Order: the display order of Stores > Configuration > Sales > Checkout
 * Totals Sort Order. A code that setting does not list stays behind the
 * total collected before it, and never moves past the grand total.
 */
class TotalRowPool
{
    private const GRAND_TOTAL = 'grand_total';

    /**
     * Totals that only feed other totals or are shown elsewhere: never a row.
     */
    private const SKIPPED_CODES = ['tax_subtotal', 'tax_shipping', 'weee', 'msrp'];

    /**
     * @param RowBuilder $rowBuilder
     * @param ScopeConfigInterface $scopeConfig
     * @param array<string, RendererInterface> $renderers total code => renderer
     */
    public function __construct(
        private readonly RowBuilder $rowBuilder,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly array $renderers = []
    ) {
        foreach ($renderers as $code => $renderer) {
            if (!$renderer instanceof RendererInterface) {
                throw new \InvalidArgumentException(
                    sprintf('The cart total renderer "%s" must implement %s.', $code, RendererInterface::class)
                );
            }
        }
    }

    /**
     * The summary rows of the quote, in display order.
     *
     * @param Quote $quote
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>
     */
    public function getRows(Quote $quote): array
    {
        $totals = [];
        foreach ($this->rowBuilder->totalsAddress($quote)->getTotals() as $key => $total) {
            if (!$total instanceof Total) {
                continue;
            }
            $code = (string) ($total->getCode() ?: $key);
            if ($code === '' || in_array($code, self::SKIPPED_CODES, true)) {
                continue;
            }
            $totals[$code] = $total;
        }

        $rows = [];
        foreach ($this->sort(array_keys($totals), $quote) as $code) {
            $renderer = $this->renderers[$code] ?? null;
            if ($renderer !== null) {
                array_push($rows, ...$renderer->render($totals[$code], $quote));
                continue;
            }
            $row = $this->genericRow($code, $totals[$code], $quote);
            if ($row !== null) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    /**
     * A total nobody registered a renderer for: its title and value, when it
     * has both. A negative amount reads as a discount.
     *
     * @param string $code
     * @param Total $total
     * @param Quote $quote
     * @return array{code: string, label: string, note: string, value: string, kind: string}|null
     */
    private function genericRow(string $code, Total $total, Quote $quote): ?array
    {
        $value = $total->getData('value');
        $title = trim((string) $total->getData('title'));
        if ($value === null || !is_numeric($value) || (float) $value === 0.0 || $title === '') {
            return null;
        }

        return $this->rowBuilder->row(
            $quote,
            $code,
            $title,
            (float) $value,
            (float) $value < 0 ? RowBuilder::KIND_DISCOUNT : RowBuilder::KIND_REGULAR
        );
    }

    /**
     * The codes in display order.
     *
     * @param string[] $codes in collection order
     * @param Quote $quote
     * @return string[]
     */
    private function sort(array $codes, Quote $quote): array
    {
        $configured = (array) $this->scopeConfig->getValue(
            Collector::XML_PATH_SALES_TOTALS_SORT,
            ScopeInterface::SCOPE_STORE,
            $quote->getStoreId()
        );
        $grandTotal = isset($configured[self::GRAND_TOTAL]) && is_numeric($configured[self::GRAND_TOTAL])
            ? (float) $configured[self::GRAND_TOTAL]
            : INF;
        $beforeGrandTotal = is_finite($grandTotal) ? $grandTotal - 0.5 : PHP_FLOAT_MAX;

        $positions = [];
        $previous = -PHP_FLOAT_MAX;
        foreach ($codes as $code) {
            if (isset($configured[$code]) && is_numeric($configured[$code])) {
                $previous = (float) $configured[$code];
                $positions[$code] = $previous;
                continue;
            }
            $positions[$code] = $code === self::GRAND_TOTAL ? INF : min($previous, $beforeGrandTotal);
        }
        // The sort is stable: codes that share a position keep their collection order.
        uasort($positions, static fn (float $a, float $b): int => $a <=> $b);

        return array_keys($positions);
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magento\Quote\Model\Quote\Address\Total\Collector;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCheckout\Api\Cart\TotalRowRendererInterface;
use Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow\RowBuilder;
use Psr\Log\LoggerInterface;

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
 *
 * Public contract: the `renderers` argument, declared in etc/frontend/di.xml
 * only (item name = total code, value = the class name of a
 * TotalRowRendererInterface as `xsi:type="string"`), and the row shape
 * `{code, label, note, value, kind}` of getRows() (see
 * TotalRowRendererInterface). A renderer class is built the first time a
 * quote carries its total. An entry that is not a usable renderer (unknown
 * class, a class that cannot be built or does not implement the interface,
 * a renderer that throws, rows of another shape) is logged once and its
 * total falls back to the plain row: the cart never breaks on a renderer.
 * An already built renderer object is accepted too.
 *
 * @api
 * @since 0.9.0
 */
class TotalRowPool
{
    private const GRAND_TOTAL = 'grand_total';

    /**
     * Totals that only feed other totals or are shown elsewhere: never a row.
     */
    private const SKIPPED_CODES = ['tax_subtotal', 'tax_shipping', 'weee', 'msrp'];

    private const KINDS = [
        RowBuilder::KIND_REGULAR,
        RowBuilder::KIND_DETAIL,
        RowBuilder::KIND_DISCOUNT,
        RowBuilder::KIND_GRAND,
    ];

    /** @var array<string, TotalRowRendererInterface|null> total code => resolved renderer, null when unusable */
    private array $resolved = [];

    /** @var array<string, bool> total codes whose refused rows were already logged in this request */
    private array $reported = [];

    /**
     * @param RowBuilder $rowBuilder
     * @param ScopeConfigInterface $scopeConfig
     * @param ObjectManagerInterface $objectManager
     * @param LoggerInterface $logger
     * @param array<string|int, mixed> $renderers total code => renderer class name
     */
    public function __construct(
        private readonly RowBuilder $rowBuilder,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly ObjectManagerInterface $objectManager,
        private readonly LoggerInterface $logger,
        private readonly array $renderers = []
    ) {
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
            $rendered = $this->render($code, $totals[$code], $quote);
            if ($rendered !== null) {
                array_push($rows, ...$rendered);
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
     * The rows of the registered renderer, null when the code has none or
     * the renderer failed (the caller prints the plain row instead).
     *
     * @param string $code
     * @param Total $total
     * @param Quote $quote
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>|null
     */
    private function render(string $code, Total $total, Quote $quote): ?array
    {
        $renderer = $this->renderer($code);
        if ($renderer === null) {
            return null;
        }
        try {
            $rows = $renderer->render($total, $quote);
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion cart totals: the renderer of "%s" failed, the plain row is shown: %s',
                $code,
                $e->getMessage()
            ), ['exception' => $e]);
            return null;
        }

        $valid = [];
        $refused = 0;
        foreach ($rows as $row) {
            $normalized = $this->normalizeRow($row);
            if ($normalized === null) {
                $refused++;
                continue;
            }
            $valid[] = $normalized;
        }
        if ($refused > 0 && !isset($this->reported[$code])) {
            $this->reported[$code] = true;
            $this->logger->error(sprintf(
                'Hyperion cart totals: the renderer of "%s" answered %d row(s) without a string code, label'
                . ' and value; %s.',
                $code,
                $refused,
                $valid === [] ? 'the plain row is shown' : 'they are skipped'
            ));
        }

        // Rows were answered and none is usable: the plain row, as for a renderer that failed.
        return $refused > 0 && $valid === [] ? null : $valid;
    }

    /**
     * The renderer registered for the code, built on first use; null when
     * none is registered or the entry is unusable (logged once).
     *
     * @param string $code
     * @return TotalRowRendererInterface|null
     */
    private function renderer(string $code): ?TotalRowRendererInterface
    {
        if (array_key_exists($code, $this->resolved)) {
            return $this->resolved[$code];
        }
        if (!array_key_exists($code, $this->renderers)) {
            return $this->resolved[$code] = null;
        }

        $entry = $this->renderers[$code];
        try {
            $renderer = is_string($entry) && $entry !== '' ? $this->objectManager->get(ltrim($entry, '\\')) : $entry;
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion cart totals: the renderer "%s" of "%s" could not be built, the plain row is shown: %s',
                $entry,
                $code,
                $e->getMessage()
            ), ['exception' => $e]);
            return $this->resolved[$code] = null;
        }
        if (!$renderer instanceof TotalRowRendererInterface) {
            $this->logger->error(sprintf(
                'Hyperion cart totals: the renderer of "%s" (%s) must implement %s, the plain row is shown.',
                $code,
                is_string($entry) ? $entry : get_debug_type($entry),
                TotalRowRendererInterface::class
            ));
            return $this->resolved[$code] = null;
        }

        return $this->resolved[$code] = $renderer;
    }

    /**
     * A row of the documented shape, or null when a required key is missing.
     *
     * @param mixed $row
     * @return array{code: string, label: string, note: string, value: string, kind: string}|null
     */
    private function normalizeRow($row): ?array
    {
        if (!is_array($row)) {
            return null;
        }
        foreach (['code', 'label', 'value'] as $key) {
            if (!isset($row[$key]) || !is_string($row[$key])) {
                return null;
            }
        }
        $kind = $row['kind'] ?? RowBuilder::KIND_REGULAR;

        return [
            'code' => $row['code'],
            'label' => $row['label'],
            'note' => is_string($row['note'] ?? null) ? $row['note'] : '',
            'value' => $row['value'],
            'kind' => in_array($kind, self::KINDS, true) ? $kind : RowBuilder::KIND_REGULAR,
        ];
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

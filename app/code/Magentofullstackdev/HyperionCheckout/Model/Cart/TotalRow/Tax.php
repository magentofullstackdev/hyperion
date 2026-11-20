<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Address\Total;
use Magento\Tax\Model\Config as TaxConfig;

/**
 * The tax row, with one detail row per applied rate when the cart shows the
 * full tax summary. A zero tax is printed only when the store asks for it.
 */
class Tax implements RendererInterface
{
    /**
     * @param RowBuilder $rowBuilder
     * @param TaxConfig $taxConfig
     */
    public function __construct(
        private readonly RowBuilder $rowBuilder,
        private readonly TaxConfig $taxConfig
    ) {
    }

    /**
     * @inheritDoc
     */
    public function render(Total $total, Quote $quote): array
    {
        $address = $this->rowBuilder->totalsAddress($quote);
        $store = $quote->getStore();
        $tax = (float) $address->getTaxAmount();
        if ($tax <= 0 && !$this->taxConfig->displayCartZeroTax($store)) {
            return [];
        }
        $rows = [];
        if ($this->taxConfig->displayCartFullSummary($store)) {
            foreach ($this->appliedRates($address) as $rate) {
                $rows[] = $this->rowBuilder->row(
                    $quote,
                    'tax_rate',
                    $rate['label'],
                    $rate['amount'],
                    RowBuilder::KIND_DETAIL
                );
            }
        }
        $rows[] = $this->rowBuilder->row($quote, 'tax', (string) __('Tax'), $tax);

        return $rows;
    }

    /**
     * Applied tax rates of the address for the full tax summary.
     *
     * @param Address $address
     * @return array<int, array{label: string, amount: float}>
     */
    private function appliedRates(Address $address): array
    {
        $rates = [];
        foreach ((array) $address->getAppliedTaxes() as $applied) {
            $titles = [];
            foreach ((array) ($applied['rates'] ?? []) as $rate) {
                $percent = isset($rate['percent']) ? ' (' . (float) $rate['percent'] . '%)' : '';
                $titles[] = ($rate['title'] ?? '') . $percent;
            }
            $rates[] = ['label' => implode(', ', $titles), 'amount' => (float) ($applied['amount'] ?? 0)];
        }

        return $rates;
    }
}

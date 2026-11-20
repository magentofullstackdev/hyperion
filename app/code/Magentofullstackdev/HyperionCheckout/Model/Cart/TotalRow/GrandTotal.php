<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magento\Tax\Model\Config as TaxConfig;

/**
 * The order total, preceded by the total excluding tax when the cart shows
 * the tax inside the grand total.
 */
class GrandTotal implements RendererInterface
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
        $grandTotal = (float) $quote->getGrandTotal();
        if (!$this->taxConfig->displayCartTaxWithGrandTotal($quote->getStore())) {
            return [
                $this->rowBuilder->row(
                    $quote,
                    'grand_total',
                    (string) __('Order Total'),
                    $grandTotal,
                    RowBuilder::KIND_GRAND
                ),
            ];
        }
        $tax = (float) $this->rowBuilder->totalsAddress($quote)->getTaxAmount();

        return [
            $this->rowBuilder->row(
                $quote,
                'grand_total_excl',
                (string) __('Order Total Excl. Tax'),
                $grandTotal - $tax
            ),
            $this->rowBuilder->row(
                $quote,
                'grand_total',
                (string) __('Order Total Incl. Tax'),
                $grandTotal,
                RowBuilder::KIND_GRAND
            ),
        ];
    }
}

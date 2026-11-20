<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magento\Tax\Model\Config as TaxConfig;

/**
 * Subtotal excluding tax, including tax or both, as the cart tax display asks.
 */
class Subtotal implements RendererInterface
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

        return $this->rowBuilder->exclInclRows(
            $quote,
            'subtotal',
            (string) __('Subtotal'),
            (float) $address->getSubtotal(),
            (float) $address->getSubtotalInclTax(),
            (bool) $this->taxConfig->displayCartSubtotalBoth($store),
            (bool) $this->taxConfig->displayCartSubtotalInclTax($store)
        );
    }
}

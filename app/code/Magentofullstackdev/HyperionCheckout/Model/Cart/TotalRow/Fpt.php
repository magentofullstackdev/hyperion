<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magentofullstackdev\HyperionCheckout\Model\WeeeBridge;

/**
 * Fixed Product Tax of the quote, unless the store adds it to the subtotal.
 */
class Fpt implements RendererInterface
{
    /**
     * @param RowBuilder $rowBuilder
     * @param WeeeBridge $weee
     */
    public function __construct(
        private readonly RowBuilder $rowBuilder,
        private readonly WeeeBridge $weee
    ) {
    }

    /**
     * @inheritDoc
     */
    public function render(Total $total, Quote $quote): array
    {
        $fpt = $this->weee->getTotal($quote);
        if ($fpt <= 0 || $this->weee->isIncludedInSubtotal((int) $quote->getStoreId())) {
            return [];
        }

        return [$this->rowBuilder->row($quote, 'weee_tax', (string) __('FPT'), $fpt)];
    }
}

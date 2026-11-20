<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;

/**
 * Turns one collected total of the quote into the rows the cart summary
 * prints for it. Registered by total code on
 * Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool.
 */
interface RendererInterface
{
    /**
     * The rows of this total, none when the total has nothing to show.
     *
     * @param Total $total
     * @param Quote $quote
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>
     */
    public function render(Total $total, Quote $quote): array;
}

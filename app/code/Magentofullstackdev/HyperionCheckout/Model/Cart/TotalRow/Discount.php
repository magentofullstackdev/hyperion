<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magentofullstackdev\HyperionCheckout\Api\Cart\TotalRowRendererInterface;

/**
 * The discount of the quote. The note names it: the description the price
 * rules gave the address (their labels, or the coupon code when a rule has
 * no label), else the coupon code.
 */
class Discount implements TotalRowRendererInterface
{
    /**
     * @param RowBuilder $rowBuilder
     */
    public function __construct(
        private readonly RowBuilder $rowBuilder
    ) {
    }

    /**
     * @inheritDoc
     */
    public function render(Total $total, Quote $quote): array
    {
        $address = $this->rowBuilder->totalsAddress($quote);
        $discount = (float) $address->getDiscountAmount();
        if ($discount >= 0) {
            return [];
        }
        $note = trim((string) $address->getDiscountDescription());
        if ($note === '') {
            $note = (string) $quote->getCouponCode();
        }

        return [
            $this->rowBuilder->row(
                $quote,
                'discount',
                (string) __('Discount'),
                $discount,
                RowBuilder::KIND_DISCOUNT,
                $note
            ),
        ];
    }
}

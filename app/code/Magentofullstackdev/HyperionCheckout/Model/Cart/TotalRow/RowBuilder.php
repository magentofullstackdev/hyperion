<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRow;

use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;

/**
 * Builds the rows of the cart summary: one shape, one way to format an
 * amount, one rule for the address the totals live on.
 */
class RowBuilder
{
    public const KIND_REGULAR = 'regular';
    public const KIND_DETAIL = 'detail';
    public const KIND_DISCOUNT = 'discount';
    public const KIND_GRAND = 'grand';

    /**
     * @param PriceCurrencyInterface $priceCurrency
     */
    public function __construct(
        private readonly PriceCurrencyInterface $priceCurrency
    ) {
    }

    /**
     * The address that carries the totals: billing for a virtual quote,
     * shipping otherwise.
     *
     * @param Quote $quote
     * @return Address
     */
    public function totalsAddress(Quote $quote): Address
    {
        return $quote->isVirtual() ? $quote->getBillingAddress() : $quote->getShippingAddress();
    }

    /**
     * One row. Quote amounts are already in the quote currency, so they are
     * formatted without conversion.
     *
     * @param Quote $quote
     * @param string $code
     * @param string $label
     * @param float $amount
     * @param string $kind regular, detail, discount or grand
     * @param string $note
     * @return array{code: string, label: string, note: string, value: string, kind: string}
     */
    public function row(
        Quote $quote,
        string $code,
        string $label,
        float $amount,
        string $kind = self::KIND_REGULAR,
        string $note = ''
    ): array {
        return [
            'code' => $code,
            'label' => $label,
            'note' => $note,
            'value' => (string) $this->priceCurrency->format(
                $amount,
                false,
                PriceCurrencyInterface::DEFAULT_PRECISION,
                $quote->getStore(),
                $quote->getQuoteCurrencyCode() ?: null
            ),
            'kind' => $kind,
        ];
    }

    /**
     * One row (excluding or including tax) or both labeled rows for an amount.
     *
     * @param Quote $quote
     * @param string $code
     * @param string $label
     * @param float $excl
     * @param float $incl
     * @param bool $both
     * @param bool $inclOnly
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>
     */
    public function exclInclRows(
        Quote $quote,
        string $code,
        string $label,
        float $excl,
        float $incl,
        bool $both,
        bool $inclOnly
    ): array {
        if ($both) {
            return [
                $this->row($quote, $code . '_excl', (string) __('%1 (Excl. Tax)', $label), $excl),
                $this->row($quote, $code . '_incl', (string) __('%1 (Incl. Tax)', $label), $incl),
            ];
        }

        return [$this->row($quote, $code, $label, $inclOnly ? $incl : $excl)];
    }
}

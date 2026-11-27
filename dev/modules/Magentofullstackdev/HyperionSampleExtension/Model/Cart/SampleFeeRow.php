<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model\Cart;

use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magentofullstackdev\HyperionCheckout\Api\Cart\TotalRowRendererInterface;

/**
 * The cart totals row of the sample fee, registered by total code on
 * Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool. Shows what a
 * renderer adds over the plain row: a note under the label.
 */
class SampleFeeRow implements TotalRowRendererInterface
{
    /**
     * @param PriceCurrencyInterface $priceCurrency
     */
    public function __construct(
        private readonly PriceCurrencyInterface $priceCurrency
    ) {
    }

    /**
     * @inheritDoc
     */
    public function render(Total $total, Quote $quote): array
    {
        $value = $total->getData('value');
        if (!is_numeric($value) || (float) $value === 0.0) {
            return [];
        }

        return [[
            'code' => (string) $total->getCode(),
            'label' => (string) __('Sample fee'),
            'note' => (string) __('Sample extension'),
            // Address totals are already in the quote currency: format without converting.
            'value' => (string) $this->priceCurrency->format(
                (float) $value,
                false,
                PriceCurrencyInterface::DEFAULT_PRECISION,
                $quote->getStore(),
                $quote->getQuoteCurrencyCode() ?: null
            ),
            'kind' => 'regular',
        ]];
    }
}

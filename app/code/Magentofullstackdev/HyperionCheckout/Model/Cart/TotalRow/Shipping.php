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
 * Shipping cost excluding tax, including tax or both, only once a method is
 * applied to the quote.
 */
class Shipping implements RendererInterface
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
        if ($quote->isVirtual()) {
            return [];
        }
        $address = $quote->getShippingAddress();
        if (!$address->getShippingMethod() || $this->carriesErrorRate($address)) {
            return [];
        }
        $store = $quote->getStore();

        return $this->rowBuilder->exclInclRows(
            $quote,
            'shipping',
            (string) __('Shipping'),
            (float) $address->getShippingAmount(),
            (float) $address->getShippingInclTax(),
            (bool) $this->taxConfig->displayCartShippingBoth($store),
            (bool) $this->taxConfig->displayCartShippingInclTax($store)
        );
    }

    /**
     * Whether the method applied to the address is a rate the carrier
     * answered with an error: its 0.00 amount is not a shipping cost to show.
     *
     * @param Address $address
     * @return bool
     */
    private function carriesErrorRate(Address $address): bool
    {
        $method = (string) $address->getShippingMethod();
        foreach ((array) $address->getGroupedAllShippingRates() as $carrierRates) {
            foreach ($carrierRates as $rate) {
                if ((string) $rate->getCode() === $method) {
                    return (string) $rate->getErrorMessage() !== '';
                }
            }
        }

        return false;
    }
}

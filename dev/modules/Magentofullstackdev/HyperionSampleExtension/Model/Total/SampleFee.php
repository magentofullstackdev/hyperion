<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model\Total;

use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Quote\Api\Data\ShippingAssignmentInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magento\Quote\Model\Quote\Address\Total\AbstractTotal;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;

/**
 * A flat fee of 1.00 in the base currency on every quote with items, while
 * hyperion_sample_extension/general/sample_fee is on: part of the grand
 * total, a row of the cart totals and a segment of the REST totals. The
 * amount is not stored on the address, so fetch() computes it again.
 */
class SampleFee extends AbstractTotal
{
    public const CODE = 'hyperion_sample_fee';
    private const BASE_AMOUNT = 1.00;

    /**
     * @param PriceCurrencyInterface $priceCurrency
     * @param Config $config
     */
    public function __construct(
        private readonly PriceCurrencyInterface $priceCurrency,
        private readonly Config $config
    ) {
        $this->setCode(self::CODE);
    }

    /**
     * @inheritDoc
     */
    public function collect(Quote $quote, ShippingAssignmentInterface $shippingAssignment, Total $total)
    {
        parent::collect($quote, $shippingAssignment, $total);
        if (!$this->applies($quote) || !count($shippingAssignment->getItems())) {
            return $this;
        }
        $total->setTotalAmount(self::CODE, $this->amount($quote));
        $total->setBaseTotalAmount(self::CODE, self::BASE_AMOUNT);

        return $this;
    }

    /**
     * @inheritDoc
     */
    public function fetch(Quote $quote, Total $total)
    {
        if (!$this->applies($quote) || (int) $quote->getItemsCount() === 0) {
            return [];
        }

        return ['code' => self::CODE, 'title' => __('Sample fee'), 'value' => $this->amount($quote)];
    }

    /**
     * Whether the fee is on for the quote's store.
     *
     * @param Quote $quote
     * @return bool
     */
    private function applies(Quote $quote): bool
    {
        return $this->config->isSampleFeeEnabled($quote->getStoreId());
    }

    /**
     * The fee in the quote currency.
     *
     * @param Quote $quote
     * @return float
     */
    private function amount(Quote $quote): float
    {
        return (float) $this->priceCurrency->convertAndRound(self::BASE_AMOUNT, $quote->getStore());
    }
}

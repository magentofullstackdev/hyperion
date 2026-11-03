<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel\Sales;

use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Creditmemo;
use Magento\Sales\Model\Order\Invoice;
use Magento\Tax\Helper\Data as TaxHelper;

/**
 * Per-rate tax breakdown for the order / invoice / credit memo totals.
 */
class TaxSummary implements ArgumentInterface
{
    /**
     * @param TaxHelper $taxHelper
     */
    public function __construct(
        private readonly TaxHelper $taxHelper
    ) {
    }

    /**
     * Calculated taxes of the sales document, one row per applied rate.
     *
     * @param Order|Invoice|Creditmemo $source
     * @return array<int, array{title: string, percent: float|null, tax_amount: float, base_tax_amount: float}>
     */
    public function getCalculatedTaxes(Order|Invoice|Creditmemo $source): array
    {
        return $this->taxHelper->getCalculatedTaxes($source);
    }
}

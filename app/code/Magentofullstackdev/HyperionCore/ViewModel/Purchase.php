<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;

/**
 * Whether the current visitor may buy at all.
 *
 * Every template that renders a purchase affordance (Add to Cart forms,
 * reorder, mini-cart, PayPal buttons) asks this view model through the
 * registry: `$viewModels->require(Purchase::class)->canPurchase()`.
 * Modules add rules on Magentofullstackdev\HyperionCore\Model\Purchase\Availability.
 */
class Purchase implements ArgumentInterface
{
    public function __construct(
        private readonly Availability $availability
    ) {
    }

    /**
     * @return bool
     */
    public function canPurchase(): bool
    {
        return $this->availability->canPurchase();
    }

    /**
     * Plain-text notice to print instead of the Add to Cart button, '' when allowed.
     *
     * @return string
     */
    public function getRestrictionMessage(): string
    {
        return $this->availability->getMessage();
    }
}

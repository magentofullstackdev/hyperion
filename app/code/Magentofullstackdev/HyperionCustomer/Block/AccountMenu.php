<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block;

use Magentofullstackdev\HyperionCustomer\ViewModel\CustomerData;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;

/**
 * Renders the header account dropdown contents (logged-in or guest links).
 *
 * Used by the /hyperion/fragment/accountmenu endpoint so the panel is always
 * lazy-loaded from a non-cached response, bypassing the page-level FPC that
 * would otherwise serve stale state for a just-logged-in visitor.
 */
class AccountMenu extends Template
{
    public function __construct(
        Context $context,
        private readonly CustomerData $customerData,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function getCustomerData(): CustomerData
    {
        return $this->customerData;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block\Sidebar;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\View\Element\Template\Context;
use Magento\Sales\Block\Reorder\Sidebar;

/**
 * "Recently Ordered" sidebar of the account pages (`hyperion.reorder.sidebar`).
 *
 * Core's block renders for an authenticated HTTP context; this one also
 * requires a logged-in customer session, because the rows come from that
 * session. Declare it only on private, uncacheable handles.
 */
class Reorder extends Sidebar
{
    /**
     * @param Context $context
     * @param HttpContext $httpContext
     * @param CustomerSession $customerSession
     * @param array $data
     */
    public function __construct(
        Context $context,
        HttpContext $httpContext,
        private readonly CustomerSession $customerSession,
        array $data = []
    ) {
        parent::__construct($context, $httpContext, $data);
    }

    /**
     * @return string
     */
    protected function _toHtml()
    {
        if (!$this->customerSession->isLoggedIn()) {
            return '';
        }
        return parent::_toHtml();
    }
}

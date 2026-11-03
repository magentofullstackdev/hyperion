<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block\Sidebar;

use Magento\Sales\Block\Reorder\Sidebar;

/**
 * Hyperion "Recently Ordered" sidebar block.
 *
 * Extends Magento's core Sidebar but drops the HTTP-context auth gate
 * in `_toHtml()`. The core check returns an empty string for anything
 * that isn't an authenticated Luma request -- but Hyperion's Varnish /
 * ESI boundaries don't populate `Context::CONTEXT_AUTH` the same way,
 * so logged-in customers often saw nothing at all.
 *
 * The Hyperion override template (`Magento_Sales::reorder/sidebar.phtml`)
 * already performs its own `isLoggedIn()` guard via the
 * SidebarWidgets view-model and returns empty HTML for guests, so we
 * defer the "should we render?" decision entirely to the template and
 * let the block call `parent::_toHtml()` unconditionally.
 */
class Reorder extends Sidebar
{
    /**
     * @return string
     */
    protected function _toHtml()
    {
        return \Magento\Framework\View\Element\Template::_toHtml();
    }
}

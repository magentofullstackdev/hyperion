<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Observer;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\View\LayoutInterface;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCheckout\Controller\Index\Index;

/**
 * Adds the Lit checkout layout handle to the checkout page.
 *
 * Observes `layout_load_before`, which the layout builder dispatches right
 * before it loads the handles. Core's checkout action sets the page title
 * before it returns, and reading the title of a page builds its layout, so a
 * handle added to the page the action returns would arrive after the load
 * and change nothing. Here the handle joins the update after the page's own
 * handles (`default`, `checkout_index_index`), which is the order
 * `hyperion_checkout_index.xml` needs to remove core's checkout blocks.
 *
 * Nothing is added for any other action, nor while
 * `hyperion_checkout/general/enabled` is off for the store view: the page is
 * then core's, with core's layout.
 */
class AddCheckoutHandle implements ObserverInterface
{
    /** Full action name of the checkout page. */
    public const FULL_ACTION_NAME = 'checkout_index_index';

    /**
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(private readonly ScopeConfigInterface $scopeConfig)
    {
    }

    /**
     * Add the handle when the checkout page is about to load its layout.
     *
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        if ($observer->getData('full_action_name') !== self::FULL_ACTION_NAME) {
            return;
        }
        $layout = $observer->getData('layout');
        if (!$layout instanceof LayoutInterface) {
            return;
        }
        if (!$this->scopeConfig->isSetFlag(Index::CONFIG_ENABLED, ScopeInterface::SCOPE_STORE)) {
            return;
        }

        $layout->getUpdate()->addHandle(Index::HYPERION_HANDLE);
    }
}

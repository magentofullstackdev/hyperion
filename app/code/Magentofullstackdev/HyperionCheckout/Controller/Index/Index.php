<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Controller\Index;

use Magento\Checkout\Helper\Data as CheckoutHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;
use Magento\Store\Model\ScopeInterface;

/**
 * Entry-point controller for the Lit one-step checkout.
 *
 * Registered `before="Magento_Checkout"` in etc/frontend/routes.xml so
 * this resolves for /checkout/index/index ahead of stock Magento.
 * Action name stays `checkout_index_index` -- the shared layout handle
 * lets the Hyperion layout override cohabit cleanly with any third-
 * party module that also contributes to this handle.
 *
 * Feature-flag rollback (Q3): the admin config
 * `hyperion_checkout/general/enabled` gates whether the Hyperion-specific
 * layout handle is added. When disabled, only stock Magento_Checkout's
 * layout runs and the page renders the Knockout checkout -- zero code
 * change, cache flush only.
 *
 * Empty-cart guard: `Magento\Checkout\Model\DefaultConfigProvider`
 * reads the current quote eagerly. When the quote session has no cart
 * at all (fresh session, expired cart), its `getConfig()` throws
 * `NoSuchEntityException`. The `Magentofullstackdev\Core` observer
 * `CheckoutEmptyCartRedirect` sets a Location header at predispatch
 * but does not stop dispatch, so the controller continues to render
 * and trips the exception. The stock Magento controller fronts the
 * same observer with its own redirect-early check; we mirror that
 * pattern here. When the quote has no items we return a ResultRedirect
 * to `/checkout/cart` and never touch the composite config provider.
 *
 * Why `extends Action`: `CheckoutEmptyCartRedirect` calls
 * `$controllerAction->getResponse()` -- a method present only on the
 * legacy `Action` base class. Stock Magento pairs `extends Action` +
 * `implements HttpGetActionInterface` for the same compatibility
 * reason; we do the same.
 *
 * Core guards: this controller replaces `Magento\Checkout\Controller\Index\Index`,
 * so it repeats that controller's checks (one-page checkout enabled, quote
 * without errors and above the minimum amount, guest checkout allowed for
 * this quote). A guest who may not check out (store setting, or a cart with
 * downloadable products) is sent to the login page and comes back here.
 *
 * Caching: the `hyperion.checkout` block in `hyperion_checkout_index.xml`
 * carries `cacheable="false"`, so Varnish / built-in FPC skip storage.
 */
class Index extends Action implements HttpGetActionInterface
{
    public const CONFIG_ENABLED = 'hyperion_checkout/general/enabled';
    public const HYPERION_HANDLE = 'hyperion_checkout_index';

    public function __construct(
        Context $context,
        private readonly PageFactory $pageFactory,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly CheckoutSession $checkoutSession,
        private readonly CustomerSession $customerSession,
        private readonly CheckoutHelper $checkoutHelper
    ) {
        parent::__construct($context);
    }

    public function execute(): ResultInterface
    {
        /** @var Redirect $redirect */
        $redirect = $this->resultRedirectFactory->create();

        if (!$this->checkoutHelper->canOnepageCheckout()) {
            $this->messageManager->addErrorMessage((string) __('One-page checkout is turned off.'));
            return $redirect->setPath('checkout/cart');
        }

        $quote = $this->checkoutSession->getQuote();
        if (!$quote->hasItems() || $quote->getData('has_error') || !$quote->validateMinimumAmount()) {
            return $redirect->setPath('checkout/cart');
        }

        if (!$this->customerSession->isLoggedIn() && !$this->checkoutHelper->isAllowedGuestCheckout($quote)) {
            $this->messageManager->addNoticeMessage(
                __('Guest checkout is disabled.') . ' ' . __('Please sign in or create an account to continue.')
            );
            $this->customerSession->setBeforeAuthUrl($this->_url->getUrl('checkout', ['_secure' => true]));
            return $redirect->setPath('customer/account/login');
        }

        /** @var Page $result */
        $result = $this->pageFactory->create();

        if ($this->scopeConfig->isSetFlag(self::CONFIG_ENABLED, ScopeInterface::SCOPE_STORE)) {
            $result->addHandle(self::HYPERION_HANDLE);
        }

        return $result;
    }
}

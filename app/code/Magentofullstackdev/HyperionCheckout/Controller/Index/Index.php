<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Controller\Index;

use Magento\Checkout\Controller\Index\Index as CoreIndex;
use Magento\Checkout\Helper\Data as CheckoutHelper;
use Magento\Customer\Api\AccountManagementInterface;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Registry;
use Magento\Framework\Translate\InlineInterface;
use Magento\Framework\View\LayoutFactory;
use Magento\Framework\View\Result\LayoutFactory as ResultLayoutFactory;
use Magento\Framework\View\Result\PageFactory;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCheckout\Model\Cart\CheckoutBlocker;

/**
 * Entry point of the checkout page: core's controller, plus the Lit checkout.
 *
 * Registered `before="Magento_Checkout"` in etc/frontend/routes.xml, so
 * /checkout/index/index resolves here; the action name stays
 * `checkout_index_index`. The class extends core's controller and lets it
 * run: its guards (one-page checkout enabled, a quote with items, without
 * errors and above the minimum order amount), its checkout initialization,
 * and every plugin declared on `Magento\Checkout\Controller\Index\Index`
 * (plugins of a class apply to its subclasses).
 *
 * What this class adds:
 *
 * - When `hyperion_checkout/general/enabled` is on for the store view, the
 *   `hyperion_checkout_index` layout handle replaces the Knockout checkout
 *   with the Lit one. The handle is added by
 *   `Magentofullstackdev\HyperionCheckout\Observer\AddCheckoutHandle` right
 *   before the layout loads, not here: core's action reads the page title,
 *   which builds the layout before the page is returned. With the flag off
 *   the result is core's page, untouched.
 * - A guest who may not check out (store setting, or a cart with
 *   downloadable products) is sent to the login page and comes back here,
 *   where core would send them to the cart with an error. The notice names
 *   the downloadable products when they are the reason, since the store
 *   setting alone allows guests.
 * - When core is about to send the shopper back to the cart for a quote
 *   error or the minimum order amount, the reason is added as a notice, so
 *   a direct visit explains itself.
 *
 * Caching: the `hyperion.checkout` block in `hyperion_checkout_index.xml`
 * carries `cacheable="false"`, as core's checkout root block does.
 */
class Index extends CoreIndex
{
    public const CONFIG_ENABLED = 'hyperion_checkout/general/enabled';
    public const HYPERION_HANDLE = 'hyperion_checkout_index';

    /** Product type id of `Magento_Downloadable`, by name so the module stays optional. */
    private const TYPE_DOWNLOADABLE = 'downloadable';

    /**
     * @param Context $context
     * @param CustomerSession $customerSession
     * @param CustomerRepositoryInterface $customerRepository
     * @param AccountManagementInterface $accountManagement
     * @param Registry $coreRegistry
     * @param InlineInterface $translateInline
     * @param FormKeyValidator $formKeyValidator
     * @param ScopeConfigInterface $scopeConfig
     * @param LayoutFactory $layoutFactory
     * @param CartRepositoryInterface $quoteRepository
     * @param PageFactory $resultPageFactory
     * @param ResultLayoutFactory $resultLayoutFactory
     * @param RawFactory $resultRawFactory
     * @param JsonFactory $resultJsonFactory
     * @param CheckoutHelper $checkoutHelper
     * @param CheckoutBlocker $checkoutBlocker
     * @SuppressWarnings(PHPMD.ExcessiveParameterList)
     */
    public function __construct(
        Context $context,
        CustomerSession $customerSession,
        CustomerRepositoryInterface $customerRepository,
        AccountManagementInterface $accountManagement,
        Registry $coreRegistry,
        InlineInterface $translateInline,
        FormKeyValidator $formKeyValidator,
        ScopeConfigInterface $scopeConfig,
        LayoutFactory $layoutFactory,
        CartRepositoryInterface $quoteRepository,
        PageFactory $resultPageFactory,
        ResultLayoutFactory $resultLayoutFactory,
        RawFactory $resultRawFactory,
        JsonFactory $resultJsonFactory,
        private readonly CheckoutHelper $checkoutHelper,
        private readonly CheckoutBlocker $checkoutBlocker
    ) {
        parent::__construct(
            $context,
            $customerSession,
            $customerRepository,
            $accountManagement,
            $coreRegistry,
            $translateInline,
            $formKeyValidator,
            $scopeConfig,
            $layoutFactory,
            $quoteRepository,
            $resultPageFactory,
            $resultLayoutFactory,
            $resultRawFactory,
            $resultJsonFactory
        );
    }

    /**
     * Checkout page.
     *
     * @return ResultInterface
     */
    public function execute(): ResultInterface
    {
        $loginRedirect = $this->explainRefusal();
        if ($loginRedirect !== null) {
            return $loginRedirect;
        }

        return parent::execute();
    }

    /**
     * What core's guards leave unexplained, checked in core's order so that
     * its own answers (checkout turned off, empty cart) stay the first ones.
     * A quote core will bounce to the cart gets its reason as a notice and
     * null is returned, core then redirects. A guest who may not check out
     * gets the login redirect returned.
     *
     * @return Redirect|null the login redirect, null when core's controller should answer
     */
    private function explainRefusal(): ?Redirect
    {
        if (!$this->checkoutHelper->canOnepageCheckout()) {
            return null;
        }
        $quote = $this->getOnepage()->getQuote();
        if (!$quote->hasItems()) {
            return null;
        }

        $blocker = $this->checkoutBlocker->forQuote($quote);
        if ($blocker !== null) {
            foreach ($blocker['messages'] as $message) {
                $this->messageManager->addNoticeMessage($message);
            }
            return null;
        }

        if ($this->_customerSession->isLoggedIn() || $this->checkoutHelper->isAllowedGuestCheckout($quote)) {
            return null;
        }
        $reason = $this->isBlockedByDownloadable($quote)
            ? __('Your cart contains downloadable products, which require a customer account.')
            : __('Guest checkout is disabled.');
        $this->messageManager->addNoticeMessage(
            $reason . ' ' . __('Please sign in or create an account to continue.')
        );
        $this->_customerSession->setBeforeAuthUrl($this->_url->getUrl('checkout', ['_secure' => true]));

        return $this->resultRedirectFactory->create()->setPath('customer/account/login');
    }

    /**
     * True when the store allows guest checkout, so the refusal comes from the
     * downloadable items of the cart (`catalog/downloadable/disable_guest_checkout`
     * or links that are not shareable, both decided by core's observer).
     *
     * @param Quote $quote
     * @return bool
     */
    private function isBlockedByDownloadable(Quote $quote): bool
    {
        if (!$this->scopeConfig->isSetFlag(
            CheckoutHelper::XML_PATH_GUEST_CHECKOUT,
            ScopeInterface::SCOPE_STORE,
            $quote->getStoreId()
        )) {
            return false;
        }
        foreach ($quote->getAllItems() as $item) {
            if ((string) $item->getProductType() === self::TYPE_DOWNLOADABLE) {
                return true;
            }
        }
        return false;
    }
}

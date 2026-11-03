<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block\Account;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Psr\Log\LoggerInterface;

/**
 * Hyperion customer account shell header.
 *
 * Exposes the data the shell-open template needs to render the account
 * page H1 and HTMX-aware sidebar/content grid. The customer object is
 * fetched from the session via the Magento core CustomerSession so we
 * stay aligned with the native account module's access pattern --
 * dedicated ViewModels are only worth it for data that needs caching
 * or transformation.
 */
class Shell extends Template
{
    /** Routes whose title ("Order # 000000001") is set by the core sales blocks. */
    private const ORDER_DOCUMENT_ROUTES = [
        'sales/order/view',
        'sales/order/invoice',
        'sales/order/shipment',
        'sales/order/creditmemo',
    ];

    public function __construct(
        Context $context,
        private readonly CustomerSession $customerSession,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * Resolve the page heading for the current account route -- derived
     * from the route controller+action so `/customer/account/edit` shows
     * "Account Information", `/customer/address/new` shows "Add New
     * Address", etc. Falls back to the generic "My Account" title.
     */
    public function getPageHeading(): string
    {
        $request = $this->getRequest();
        $module = (string) $request->getModuleName();
        $controller = $request instanceof HttpRequest ? (string) $request->getControllerName() : '';
        $action = (string) $request->getActionName();
        $key = $module . '/' . $controller . '/' . $action;
        $id = $request->getParam('id');

        $map = [
            'customer/account/index' => __('My Account'),
            'customer/account/edit' => __('Account Information'),
            'customer/address/index' => __('Address Book'),
            'customer/address/new' => __('Add New Address'),
            'customer/address/edit' => __('Edit Address'),
            'customer/address/form' => $id ? __('Edit Address') : __('Add New Address'),
            'customer/address/formPost' => __('Address Book'),
            'wishlist/index/index' => __('My Wish List'),
            'wishlist/index/share' => __('Share Wish List'),
            'wishlist/index/configure' => __('Edit Wish List Item'),
            'sales/order/history' => __('My Orders'),
            'sales/order/reorder' => __('Reorder'),
            'downloadable/customer/products' => __('My Downloadable Products'),
            'review/customer/index' => __('My Product Reviews'),
            'review/customer/view' => __('Review Details'),
            'newsletter/manage/index' => __('Newsletter Subscription'),
            'vault/cards/listaction' => __('Stored Payment Methods'),
        ];

        if (in_array($key, self::ORDER_DOCUMENT_ROUTES, true)) {
            return (string) $this->pageConfig->getTitle()->getShort();
        }

        if (isset($map[$key])) {
            return (string) $map[$key];
        }

        return (string) __('My Account');
    }

    /**
     * Customer first name if logged-in, otherwise empty string. Wrapped
     * defensively because the session may not have fully initialized on
     * certain HTMX preflight requests.
     */
    public function getCustomerFirstname(): string
    {
        try {
            if (!$this->customerSession->isLoggedIn()) {
                return '';
            }
            return (string) $this->customerSession->getCustomer()->getData('firstname');
        } catch (\Throwable $e) {
            $this->logger->warning(
                'Shell::getCustomerFirstname: customer session not available',
                ['exception' => $e]
            );
            return '';
        }
    }

    /**
     * @return RequestInterface
     */
    public function getRequest()
    {
        return parent::getRequest();
    }
}

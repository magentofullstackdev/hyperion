<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Customer\Model\Url as CustomerUrl;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Url\EncoderInterface as UrlEncoder;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Wishlist\Helper\Data as WishlistHelper;
use Magentofullstackdev\HyperionCore\Model\Htmx\RequestContext;
use Psr\Log\LoggerInterface;

class CustomerData implements ArgumentInterface
{
    /**
     * @param CustomerSession $customerSession
     * @param WishlistHelper $wishlistHelper
     * @param CustomerUrl $customerUrl
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CustomerSession $customerSession,
        private readonly WishlistHelper $wishlistHelper,
        private readonly CustomerUrl $customerUrl,
        private readonly LoggerInterface $logger,
        private readonly RequestContext $htmxRequest,
        private readonly UrlInterface $urlBuilder,
        private readonly UrlEncoder $urlEncoder,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * @return bool
     */
    public function isLoggedIn(): bool
    {
        try {
            return $this->customerSession->isLoggedIn();
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::isLoggedIn -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * @return string
     */
    public function getCustomerFirstName(): string
    {
        try {
            if (!$this->customerSession->isLoggedIn()) {
                return '';
            }
            return (string) $this->customerSession->getCustomer()->getData('firstname');
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::getCustomerFirstName -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getCustomerName(): string
    {
        return $this->getCustomerFirstName();
    }

    /**
     * @return int
     */
    public function getWishlistItemCount(): int
    {
        try {
            return (int) $this->wishlistHelper->getItemCount();
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::getWishlistItemCount -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * @return string
     */
    public function getLoginUrl(): string
    {
        try {
            if (!$this->htmxRequest->isHtmx()) {
                return $this->customerUrl->getLoginUrl();
            }
            // Rendered for an htmx fragment (the header state): core would put the
            // fragment's own URL in the referer and send the customer there after the
            // login. The page the fragment was asked from is HX-Current-URL.
            $params = [];
            $current = $this->htmxRequest->getCurrentUrl();
            $toDashboard = $this->scopeConfig->isSetFlag(
                CustomerUrl::XML_PATH_CUSTOMER_STARTUP_REDIRECT_TO_DASHBOARD,
                ScopeInterface::SCOPE_STORE
            );
            $referer = $current !== null && !$toDashboard ? $this->refererFor($current) : null;
            if ($referer !== null) {
                $params[CustomerUrl::REFERER_QUERY_PARAM_NAME] = $referer;
            }
            return $this->urlBuilder->getUrl(CustomerUrl::ROUTE_ACCOUNT_LOGIN, $params);
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::getLoginUrl -- ' . $e->getMessage());
            return '/customer/account/login';
        }
    }

    /**
     * The encoded page to return to after the login. An account page (sign in,
     * create, forgot password and their posts) is never that page: the link
     * keeps the referer the page already carries, or none, like core's own
     * link on the login page. Otherwise every header state request on the
     * login page would wrap the previous referer once more.
     */
    private function refererFor(string $current): ?string
    {
        $path = (string) parse_url($current, PHP_URL_PATH);
        if (preg_match('#/customer/account/(login|loginPost|create|createPost|forgotpassword|forgotpasswordpost)(/|$)#i', $path)) {
            return preg_match('#/' . CustomerUrl::REFERER_QUERY_PARAM_NAME . '/([A-Za-z0-9_~-]+)#', $path, $match)
                ? $match[1]
                : null;
        }
        return $this->urlEncoder->encode($current);
    }

    /**
     * @return string
     */
    public function getRegisterUrl(): string
    {
        try {
            return $this->customerUrl->getRegisterUrl();
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::getRegisterUrl -- ' . $e->getMessage());
            return '/customer/account/create';
        }
    }

    /**
     * @return string
     */
    public function getAccountUrl(): string
    {
        try {
            return $this->customerUrl->getAccountUrl();
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::getAccountUrl -- ' . $e->getMessage());
            return '/customer/account';
        }
    }

    /**
     * @return string
     */
    public function getLogoutUrl(): string
    {
        try {
            return $this->customerUrl->getLogoutUrl();
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::getLogoutUrl -- ' . $e->getMessage());
            return '/customer/account/logout';
        }
    }

    /**
     * @return string
     */
    public function getWishlistUrl(): string
    {
        try {
            return $this->wishlistHelper->getListUrl();
        } catch (\Throwable $e) {
            $this->logger->error('CustomerData::getWishlistUrl -- ' . $e->getMessage());
            return '/wishlist';
        }
    }
}

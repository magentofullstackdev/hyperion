<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * "Login as Customer" (admin impersonation) state for the storefront.
 *
 * Magento_LoginAsCustomer is optional, so its API interface is resolved
 * by name at run time. `isEnabled()` is the store config flag only (the
 * placeholder must exist on edge-cached pages whoever rendered them);
 * `isImpersonated()` is the live session check used by the header-state
 * fragment.
 */
class LoginAsCustomer implements ArgumentInterface
{
    private const MODULE_NAME = 'Magento_LoginAsCustomer';
    private const XML_PATH_ENABLED = 'login_as_customer/general/enabled';
    private const ADMIN_ID_INTERFACE = 'Magento\LoginAsCustomerApi\Api\GetLoggedAsCustomerAdminIdInterface';

    /**
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     * @param ScopeConfigInterface $scopeConfig
     * @param CustomerSession $customerSession
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly CustomerSession $customerSession,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Feature installed and switched on for the current store.
     *
     * @return bool
     */
    public function isEnabled(): bool
    {
        return $this->moduleManager->isEnabled(self::MODULE_NAME)
            && interface_exists(self::ADMIN_ID_INTERFACE)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    /**
     * Whether the current customer session was opened by an admin user.
     *
     * @return bool
     */
    public function isImpersonated(): bool
    {
        if (!$this->isEnabled() || !$this->customerSession->isLoggedIn()) {
            return false;
        }

        try {
            $adminId = $this->objectManager->get(self::ADMIN_ID_INTERFACE)->execute();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LoginAsCustomer: admin id lookup failed -- ' . $e->getMessage());
            return false;
        }

        return (int) $adminId > 0;
    }

    /**
     * @return string
     */
    public function getWebsiteName(): string
    {
        try {
            return (string) $this->storeManager->getWebsite()->getName();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LoginAsCustomer: website lookup failed -- ' . $e->getMessage());
            return '';
        }
    }
}

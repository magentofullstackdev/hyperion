<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Newsletter;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * `Magento_Newsletter`, reached by name: the module is optional, so its
 * classes are resolved only when it is enabled and never type hinted.
 */
class SubscriptionBridge
{
    private const MODULE = 'Magento_Newsletter';
    private const MANAGER = 'Magento\\Newsletter\\Model\\SubscriptionManagerInterface';
    private const SUBSCRIBER = 'Magento\\Newsletter\\Model\\Subscriber';
    private const XML_PATH_ACTIVE = 'newsletter/general/active';
    private const XML_PATH_ALLOW_GUEST = 'newsletter/subscription/allow_guest_subscribe';

    /**
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * Whether the newsletter module is enabled and the newsletter is active for the store.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isAvailable(int|string|null $storeId = null): bool
    {
        return $this->moduleManager->isEnabled(self::MODULE)
            && interface_exists(self::MANAGER)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_ACTIVE, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * Whether visitors without an account may subscribe (`newsletter/subscription/allow_guest_subscribe`).
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isGuestSubscriptionAllowed(int|string|null $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ALLOW_GUEST, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * Whether the customer is subscribed on the website.
     *
     * @param int $customerId
     * @param int $websiteId
     * @return bool
     */
    public function isCustomerSubscribed(int $customerId, int $websiteId): bool
    {
        $subscriber = $this->objectManager->create(self::SUBSCRIBER);
        return (bool) $subscriber->loadByCustomer($customerId, $websiteId)->isSubscribed();
    }

    /**
     * Subscribes a customer account.
     *
     * @param int $customerId
     * @param int $storeId
     * @return void
     */
    public function subscribeCustomer(int $customerId, int $storeId): void
    {
        $this->objectManager->get(self::MANAGER)->subscribeCustomer($customerId, $storeId);
    }

    /**
     * Subscribes an email address without an account.
     *
     * @param string $email
     * @param int $storeId
     * @return void
     */
    public function subscribeGuest(string $email, int $storeId): void
    {
        $this->objectManager->get(self::MANAGER)->subscribe($email, $storeId);
    }
}

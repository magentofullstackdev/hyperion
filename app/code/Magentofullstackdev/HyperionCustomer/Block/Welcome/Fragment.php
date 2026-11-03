<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block\Welcome;

use Magentofullstackdev\HyperionCustomer\ViewModel\CustomerData;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\View\Element\Template;
use Psr\Log\LoggerInterface;

class Fragment extends Template
{
    /**
     * @param Template\Context $context
     * @param CustomerData $customerData
     * @param CustomerSession $customerSession
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        private readonly CustomerData $customerData,
        private readonly CustomerSession $customerSession,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * @return bool
     */
    public function isLoggedIn(): bool
    {
        try {
            return $this->customerData->isLoggedIn();
        } catch (\Throwable $e) {
            $this->logger->error('Welcome\Fragment::isLoggedIn -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * @return string
     */
    public function getCustomerName(): string
    {
        try {
            return $this->customerData->getCustomerName();
        } catch (\Throwable $e) {
            $this->logger->error('Welcome\Fragment::getCustomerName -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getLoginUrl(): string
    {
        try {
            return $this->customerData->getLoginUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Welcome\Fragment::getLoginUrl -- ' . $e->getMessage());
            return '/customer/account/login';
        }
    }

    /**
     * @return string
     */
    public function getRegisterUrl(): string
    {
        try {
            return $this->customerData->getRegisterUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Welcome\Fragment::getRegisterUrl -- ' . $e->getMessage());
            return '/customer/account/create';
        }
    }

    /**
     * @return string
     */
    public function getAccountUrl(): string
    {
        try {
            return $this->customerData->getAccountUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Welcome\Fragment::getAccountUrl -- ' . $e->getMessage());
            return '/customer/account';
        }
    }

    /**
     * @return string
     */
    public function getLogoutUrl(): string
    {
        try {
            return $this->customerData->getLogoutUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Welcome\Fragment::getLogoutUrl -- ' . $e->getMessage());
            return '/customer/account/logout';
        }
    }

    /**
     * @return array
     */
    public function getCacheKeyInfo(): array
    {
        try {
            $customerId = (int) $this->customerSession->getCustomerId();
            if ($customerId > 0) {
                return ['hyperion_welcome_customer_' . $customerId];
            }
            return ['hyperion_welcome_anon'];
        } catch (\Throwable $e) {
            $this->logger->error('Welcome\Fragment::getCacheKeyInfo -- ' . $e->getMessage());
            return ['hyperion_welcome_anon'];
        }
    }

    /**
     * @return null
     */
    public function getCacheLifetime(): ?int
    {
        return null;
    }
}

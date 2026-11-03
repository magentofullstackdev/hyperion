<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block\LoginAsCustomer;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\View\Element\Template;
use Magentofullstackdev\HyperionCustomer\ViewModel\LoginAsCustomer;
use Psr\Log\LoggerInterface;

/**
 * Header-state fragment: the sticky "You are connected as ..." banner of
 * an admin impersonation session (see layout hyperion_customer_lac_notice).
 */
class Notice extends Template
{
    /**
     * @param Template\Context $context
     * @param LoginAsCustomer $loginAsCustomer
     * @param CustomerSession $customerSession
     * @param FormKey $formKey
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        private readonly LoginAsCustomer $loginAsCustomer,
        private readonly CustomerSession $customerSession,
        private readonly FormKey $formKey,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * @return bool
     */
    public function isImpersonated(): bool
    {
        try {
            return $this->loginAsCustomer->isImpersonated();
        } catch (\Throwable $e) {
            $this->logger->error('LoginAsCustomer\Notice::isImpersonated -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Full name of the impersonated customer.
     *
     * @return string
     */
    public function getCustomerName(): string
    {
        try {
            return trim((string) $this->customerSession->getCustomer()->getName());
        } catch (\Throwable $e) {
            $this->logger->error('LoginAsCustomer\Notice::getCustomerName -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getWebsiteName(): string
    {
        return $this->loginAsCustomer->getWebsiteName();
    }

    /**
     * @return string
     */
    public function getLogoutUrl(): string
    {
        return $this->getUrl('customer/account/logout');
    }

    /**
     * @return string
     */
    public function getFormKey(): string
    {
        return (string) $this->formKey->getFormKey();
    }

    /**
     * Nothing at all when the session is not an impersonation: the
     * header-state response must not carry an out-of-band element whose
     * placeholder may be missing.
     *
     * @inheritdoc
     */
    protected function _toHtml(): string
    {
        return $this->isImpersonated() ? parent::_toHtml() : '';
    }
}

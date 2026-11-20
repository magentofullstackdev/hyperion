<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Whether the store has a contact page a template can link to, and its URL.
 *
 * Magento_Contact is reached by module name and configuration path only: the
 * page answers 404 when the module is disabled or its "Enable Contact Us"
 * setting is off.
 */
class ContactLink implements ArgumentInterface
{
    private const MODULE = 'Magento_Contact';
    private const XML_PATH_ENABLED = 'contact/contact/enabled';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly ModuleManager $moduleManager,
        private readonly UrlInterface $urlBuilder
    ) {
    }

    public function isAvailable(): bool
    {
        return $this->moduleManager->isEnabled(self::MODULE)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    public function getUrl(): string
    {
        return $this->urlBuilder->getUrl('contact');
    }
}

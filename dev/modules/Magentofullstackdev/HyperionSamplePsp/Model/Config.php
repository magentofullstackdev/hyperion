<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * The switches of the sample payment provider. Every method and page is
 * inert until the master switch AND the method's own active flag are on.
 */
class Config
{
    public const CARD = 'hyperion_sample_card';
    public const CARD_VAULT = 'hyperion_sample_card_vault';
    public const REDIRECT = 'hyperion_sample_redirect';
    public const FORM = 'hyperion_sample_form';

    public const XML_PATH_ENABLED = 'hyperion_sample/general/enabled';
    public const XML_PATH_EXPRESS_ENABLED = 'hyperion_sample/express/enabled';

    /**
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * Whether the sample provider is switched on for the store.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isEnabled(int|string|null $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * Whether a sample method is usable: the master switch and its own flag.
     *
     * @param string $code
     * @param int|string|null $storeId
     * @return bool
     */
    public function isMethodActive(string $code, int|string|null $storeId = null): bool
    {
        return $this->isEnabled($storeId)
            && $this->scopeConfig->isSetFlag('payment/' . $code . '/active', ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * Whether the express button may show: it pays with the hosted page method.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isExpressEnabled(int|string|null $storeId = null): bool
    {
        return $this->isMethodActive(self::REDIRECT, $storeId)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_EXPRESS_ENABLED, ScopeInterface::SCOPE_STORE, $storeId);
    }
}

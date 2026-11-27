<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * The switches of the sample extension. Every part is inert until the
 * master switch is on; markers and the fee have a flag of their own.
 */
class Config
{
    public const XML_PATH_ENABLED = 'hyperion_sample_extension/general/enabled';
    public const XML_PATH_MARKERS = 'hyperion_sample_extension/general/markers';
    public const XML_PATH_SAMPLE_FEE = 'hyperion_sample_extension/general/sample_fee';

    /**
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * Whether the module is switched on for the store.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isEnabled(int|string|null $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * Whether the storefront marker blocks render.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function areMarkersEnabled(int|string|null $storeId = null): bool
    {
        return $this->isEnabled($storeId)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_MARKERS, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * Whether the sample fee is collected.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isSampleFeeEnabled(int|string|null $storeId = null): bool
    {
        return $this->isEnabled($storeId)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_SAMPLE_FEE, ScopeInterface::SCOPE_STORE, $storeId);
    }
}

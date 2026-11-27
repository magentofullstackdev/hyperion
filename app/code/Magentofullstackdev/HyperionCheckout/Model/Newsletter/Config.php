<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Newsletter;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Settings of the newsletter opt-in of the checkout
 * (`hyperion_checkout/newsletter/*`, store scope, off by default).
 */
class Config
{
    public const XML_PATH_ENABLED = 'hyperion_checkout/newsletter/enabled';
    /**
     * Whether the box starts ticked. Off by default: a box ticked in advance
     * is not valid consent under the GDPR, so only turn it on where the law
     * of the store allows it.
     */
    public const XML_PATH_CHECKED_BY_DEFAULT = 'hyperion_checkout/newsletter/checked_by_default';

    /**
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(private readonly ScopeConfigInterface $scopeConfig)
    {
    }

    /**
     * Whether the checkout offers the newsletter opt-in.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isEnabled(int|string|null $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * Whether the opt-in box starts ticked.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isCheckedByDefault(int|string|null $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_CHECKED_BY_DEFAULT,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );
    }
}

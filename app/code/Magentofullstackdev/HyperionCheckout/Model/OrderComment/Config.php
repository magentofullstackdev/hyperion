<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\OrderComment;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Settings of the order comment field of the checkout
 * (`hyperion_checkout/order_comment/*`, store scope, off by default).
 */
class Config
{
    public const XML_PATH_ENABLED = 'hyperion_checkout/order_comment/enabled';
    public const XML_PATH_MAX_LENGTH = 'hyperion_checkout/order_comment/max_length';
    public const DEFAULT_MAX_LENGTH = 500;
    /** Upper bound of the setting, whatever is stored. */
    public const LIMIT_MAX_LENGTH = 5000;

    /**
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(private readonly ScopeConfigInterface $scopeConfig)
    {
    }

    /**
     * Whether shoppers may leave a comment with the order.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function isEnabled(int|string|null $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * The maximum length of a comment in characters.
     *
     * @param int|string|null $storeId
     * @return int
     */
    public function getMaxLength(int|string|null $storeId = null): int
    {
        $value = (int) $this->scopeConfig->getValue(self::XML_PATH_MAX_LENGTH, ScopeInterface::SCOPE_STORE, $storeId);
        if ($value <= 0) {
            return self::DEFAULT_MAX_LENGTH;
        }
        return min($value, self::LIMIT_MAX_LENGTH);
    }
}

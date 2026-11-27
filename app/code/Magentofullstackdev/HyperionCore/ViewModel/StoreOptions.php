<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Core store configuration options the theme templates honor on edge cached pages.
 *
 * Every answer depends on the store configuration only, never on the visitor, so a
 * header, footer or listing printed from it is the same for every visitor of the
 * store view. Core's own helpers mix in the customer session (the wish list's
 * `isAllow()` also asks whether a customer is logged in), which a cached page must
 * not do.
 */
class StoreOptions implements ArgumentInterface
{
    public const XML_PATH_WISHLIST_ACTIVE = 'wishlist/general/active';
    public const XML_PATH_SEARCH_MAX_QUERY_LENGTH = 'catalog/search/max_query_length';
    public const XML_PATH_LAYER_PRODUCT_COUNT = 'catalog/layered_navigation/display_product_count';

    private const WISHLIST_MODULE = 'Magento_Wishlist';

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param ModuleManager $moduleManager
     */
    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly ModuleManager $moduleManager
    ) {
    }

    /**
     * Whether the wish list is switched on for the store ("Enabled" under Wish List > General Options).
     *
     * @return bool
     */
    public function isWishlistEnabled(): bool
    {
        return $this->moduleManager->isEnabled(self::WISHLIST_MODULE)
            && $this->scopeConfig->isSetFlag(self::XML_PATH_WISHLIST_ACTIVE, ScopeInterface::SCOPE_STORE);
    }

    /**
     * Longest search query core keeps, 0 when none (or no positive number) is configured.
     *
     * @return int
     */
    public function getSearchMaxQueryLength(): int
    {
        return $this->positiveInt(self::XML_PATH_SEARCH_MAX_QUERY_LENGTH);
    }

    /**
     * Whether the layered navigation prints the number of products next to each filter option.
     *
     * @return bool
     */
    public function isLayerProductCountDisplayed(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_LAYER_PRODUCT_COUNT, ScopeInterface::SCOPE_STORE);
    }

    /**
     * A configured value as a non-negative integer, 0 when it is missing or not a number.
     *
     * @param string $path
     * @return int
     */
    private function positiveInt(string $path): int
    {
        $value = $this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE);

        return is_numeric($value) ? max(0, (int) $value) : 0;
    }
}

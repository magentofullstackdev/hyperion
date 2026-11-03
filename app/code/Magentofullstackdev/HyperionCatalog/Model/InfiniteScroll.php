<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model;

use Magento\Catalog\Api\Data\CategoryInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Infinite loading of the listing pages: the mode of a listing is
 * the category's own value when the category has one, the store configuration
 * otherwise (the search results page has no category and follows the
 * configuration only). The automatic mode may hand over to the button after
 * a number of automatic loads so the footer stays reachable.
 */
class InfiniteScroll
{
    public const XML_PATH_MODE = 'hyperion/catalog/infinite_scroll';
    public const XML_PATH_AUTO_PAGES = 'hyperion/catalog/infinite_scroll_auto_pages';
    public const CATEGORY_ATTRIBUTE = 'hyperion_infinite_scroll';

    public const MODE_DISABLED = 'disabled';
    public const MODE_BUTTON = 'button';
    public const MODE_SCROLL = 'scroll';
    public const MODES = [self::MODE_DISABLED, self::MODE_BUTTON, self::MODE_SCROLL];

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * @param CategoryInterface|null $category the listing's category, null on search results
     * @param int|string|null $storeId
     */
    public function resolve(?CategoryInterface $category = null, int|string|null $storeId = null): string
    {
        if ($category !== null) {
            $own = $category->getCustomAttribute(self::CATEGORY_ATTRIBUTE)?->getValue();
            if ($own === null && method_exists($category, 'getData')) {
                $own = $category->getData(self::CATEGORY_ATTRIBUTE);
            }
            $own = is_string($own) ? trim($own) : '';
            if (in_array($own, self::MODES, true)) {
                return $own;
            }
        }

        return $this->normalize((string) $this->scopeConfig->getValue(self::XML_PATH_MODE, ScopeInterface::SCOPE_STORE, $storeId));
    }

    /**
     * Automatic loads before the button takes over; 0 = no limit.
     *
     * @param int|string|null $storeId
     */
    public function getAutoPages(int|string|null $storeId = null): int
    {
        return max(0, (int) $this->scopeConfig->getValue(self::XML_PATH_AUTO_PAGES, ScopeInterface::SCOPE_STORE, $storeId));
    }

    /**
     * Whether the page currently shown may load the next one automatically:
     * the visitor has made `currentPage - 1` automatic loads so far.
     *
     * @param int|string|null $storeId
     */
    public function isAutomaticLoadAllowed(string $mode, int $currentPage, int|string|null $storeId = null): bool
    {
        if ($mode !== self::MODE_SCROLL) {
            return false;
        }
        $cap = $this->getAutoPages($storeId);

        return $cap === 0 || $currentPage <= $cap;
    }

    public function normalize(string $mode): string
    {
        return in_array($mode, self::MODES, true) ? $mode : self::MODE_DISABLED;
    }
}

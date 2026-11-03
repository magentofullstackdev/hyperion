<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Settings of Stores > Configuration > Hyperion > Search.
 */
class Config
{
    public const XML_PATH_FUZZINESS = 'hyperion_search/general/fuzziness';
    public const XML_PATH_FUZZY_MIN_LENGTH = 'hyperion_search/general/fuzzy_min_query_length';
    public const XML_PATH_SKU_BOOST = 'hyperion_search/general/sku_boost';
    public const XML_PATH_PROMOTED_SKUS = 'hyperion_search/general/promoted_skus';
    public const XML_PATH_PROMOTED_BOOST = 'hyperion_search/general/promoted_boost';
    public const XML_PATH_STOP_WORDS = 'hyperion_search/general/stop_words';
    public const XML_PATH_ZERO_RESULTS_FALLBACK = 'hyperion_search/general/zero_results_fallback';
    public const XML_PATH_SUGGEST_PRODUCTS = 'hyperion_search/suggest/products';
    public const XML_PATH_SUGGEST_TERMS = 'hyperion_search/suggest/terms';
    public const XML_PATH_SUGGEST_CATEGORIES = 'hyperion_search/suggest/categories';

    public const FUZZINESS_OFF = 'off';
    public const FUZZINESS_AUTO = 'auto';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * @return string|null the fuzziness value for the engine (`AUTO`, `1`, `2`), null when typo tolerance is off
     */
    public function getFuzziness(?int $storeId = null): ?string
    {
        $value = strtolower(trim((string) $this->value(self::XML_PATH_FUZZINESS, $storeId)));

        return match ($value) {
            self::FUZZINESS_AUTO => 'AUTO',
            '1', '2' => $value,
            default => null,
        };
    }

    public function getFuzzyMinQueryLength(?int $storeId = null): int
    {
        return max(0, (int) $this->value(self::XML_PATH_FUZZY_MIN_LENGTH, $storeId));
    }

    public function getSkuBoost(?int $storeId = null): float
    {
        $value = (float) $this->value(self::XML_PATH_SKU_BOOST, $storeId);

        return $value > 0 ? $value : 1.0;
    }

    /**
     * @return string[]
     */
    public function getPromotedSkus(?int $storeId = null): array
    {
        return $this->list((string) $this->value(self::XML_PATH_PROMOTED_SKUS, $storeId), false);
    }

    public function getPromotedBoost(?int $storeId = null): float
    {
        $value = (float) $this->value(self::XML_PATH_PROMOTED_BOOST, $storeId);

        return $value > 0 ? $value : 1.0;
    }

    /**
     * @return string[] lower case
     */
    public function getStopWords(?int $storeId = null): array
    {
        return $this->list((string) $this->value(self::XML_PATH_STOP_WORDS, $storeId), true);
    }

    public function isZeroResultsFallbackEnabled(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ZERO_RESULTS_FALLBACK, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function getSuggestProducts(?int $storeId = null): int
    {
        return max(0, (int) $this->value(self::XML_PATH_SUGGEST_PRODUCTS, $storeId));
    }

    public function getSuggestTerms(?int $storeId = null): int
    {
        return max(0, (int) $this->value(self::XML_PATH_SUGGEST_TERMS, $storeId));
    }

    public function getSuggestCategories(?int $storeId = null): int
    {
        return max(0, (int) $this->value(self::XML_PATH_SUGGEST_CATEGORIES, $storeId));
    }

    private function value(string $path, ?int $storeId): mixed
    {
        return $this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * @return string[]
     */
    private function list(string $raw, bool $lowercase): array
    {
        $items = [];
        foreach (preg_split('/[\s,;]+/u', $raw) ?: [] as $item) {
            $item = trim($item);
            if ($item === '') {
                continue;
            }
            $items[] = $lowercase ? mb_strtolower($item) : $item;
        }

        return array_values(array_unique($items));
    }
}

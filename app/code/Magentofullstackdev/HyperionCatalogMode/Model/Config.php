<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalogMode\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

class Config
{
    public const XML_PATH_ENABLED = 'hyperion_catalog_mode/general/enabled';
    public const XML_PATH_ALLOWED_GROUPS = 'hyperion_catalog_mode/general/allowed_customer_groups';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * @return bool
     */
    public function isEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    /**
     * Customer group ids that keep the right to buy (store view scope).
     *
     * @return int[]
     */
    public function getAllowedGroupIds(): array
    {
        $raw = (string) $this->scopeConfig->getValue(self::XML_PATH_ALLOWED_GROUPS, ScopeInterface::SCOPE_STORE);
        if (trim($raw) === '') {
            return [];
        }

        return array_values(array_unique(array_map(
            'intval',
            array_filter(explode(',', $raw), static fn (string $id): bool => trim($id) !== '')
        )));
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\App\Cache;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;

/**
 * No block cache entry is written while the request is degraded (a price
 * printed its fallback): `AbstractBlock::_saveCache()` tags every entry with
 * `block_html`, so this is one place for every cached block, widgets with
 * their own `cache_lifetime` included. Other saves (config, layout, the
 * suggest cache) are not touched.
 */
class DegradedBlockCachePlugin
{
    public function __construct(
        private readonly DegradedResponse $degradedResponse
    ) {
    }

    /**
     * @param CacheInterface $subject
     * @param callable $proceed
     * @param string $data
     * @param string $identifier
     * @param array<int, string> $tags
     * @param int|null $lifeTime
     * @return bool
     */
    public function aroundSave(CacheInterface $subject, callable $proceed, $data, $identifier, $tags = [], $lifeTime = null)
    {
        if ($this->degradedResponse->isDegraded() && in_array(AbstractBlock::CACHE_GROUP, (array) $tags, true)) {
            return false;
        }

        return $proceed($data, $identifier, $tags, $lifeTime);
    }
}

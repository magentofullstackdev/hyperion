<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magentofullstackdev\HyperionSearch\Model\Suggest\Cache as SuggestCache;

/**
 * Drops the cached autocomplete answers on the events the index does not
 * cover: a category save or delete (the category section is read from the
 * database, and a new category is in no tag of a cached answer) and a save
 * of the Hyperion Search configuration (the section sizes and the stop words
 * are not part of the cache key). `Cache::flush()` never throws.
 */
class FlushSuggestCache implements ObserverInterface
{
    public function __construct(private readonly SuggestCache $cache)
    {
    }

    /**
     * @param Observer $observer
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function execute(Observer $observer): void
    {
        $this->cache->flush();
    }
}

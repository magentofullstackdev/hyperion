<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Cache;

use Magento\Framework\App\Cache\StateInterface;
use Magento\Framework\App\Cache\Type\FrontendPool;
use Magento\Framework\DataObject;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Event\ManagerInterface as EventManager;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Psr\Log\LoggerInterface;

/**
 * Cleans what the menu of a group was cached in: the block and page cache
 * types by tag, and Varnish through core's `clean_cache_by_tags` event
 * (the CacheInvalidate observer BANs the tags). Model saves do this on
 * their own (the models carry identities); the batch writes of the builder
 * (moves, reorders, imports) call it explicitly.
 */
class Flusher
{
    private const CACHE_TYPES = ['block_html', 'full_page'];

    public function __construct(
        private readonly FrontendPool $frontendPool,
        private readonly StateInterface $cacheState,
        private readonly EventManager $eventManager,
        private readonly LoggerInterface $logger
    ) {
    }

    public function flushGroup(int $groupId): void
    {
        $this->flushTags([Group::CACHE_TAG, Group::GROUP_CACHE_TAG . '_' . $groupId]);
    }

    /**
     * @param string[] $tags
     */
    public function flushTags(array $tags): void
    {
        $tags = array_values(array_unique(array_filter($tags)));
        if ($tags === []) {
            return;
        }
        try {
            foreach (self::CACHE_TYPES as $type) {
                if ($this->cacheState->isEnabled($type)) {
                    $this->frontendPool->get($type)->clean(\Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, $tags);
                }
            }
            $this->eventManager->dispatch('clean_cache_by_tags', ['object' => new Identities($tags)]);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: cache flush failed: ' . $e->getMessage());
        }
    }
}

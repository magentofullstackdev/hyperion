<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model\Suggest;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\Event\ManagerInterface as EventManager;
use Magento\Framework\Serialize\SerializerInterface;
use Magentofullstackdev\HyperionSearch\Model\Cache\Identities;
use Psr\Log\LoggerInterface;

/**
 * Rendered autocomplete fragments in the application cache, keyed by the
 * page cache context (store, currency, customer group: the X-Magento-Vary
 * inputs) and the normalized query, tagged with the suggested products and
 * categories so a product save drops the entries that showed it. A Varnish
 * MISS, or a store without Varnish, costs one cache read for a query that
 * was already answered.
 *
 * Every entry also carries the module tag (`TAG`), which `flush()` cleans
 * in the application cache and sends down core's `clean_cache_by_tags` path
 * (built-in page cache and Varnish BAN) when the fulltext index runs, a
 * category changes or the module configuration is saved: an answer computed
 * before a product existed (no product tag to invalidate it by) never
 * outlives the index it came from.
 */
class Cache
{
    public const TAG = 'HYPERION_SEARCH_SUGGEST';
    public const LIFETIME = 3600;
    private const PREFIX = 'hyperion_search_suggest_';

    public function __construct(
        private readonly CacheInterface $cache,
        private readonly SerializerInterface $serializer,
        private readonly EventManager $eventManager,
        private readonly LoggerInterface $logger
    ) {
    }

    public function key(int $storeId, string $varyString, string $query): string
    {
        return self::PREFIX . hash('xxh3', $storeId . '|' . $varyString . '|' . $query);
    }

    /**
     * @return array{html: string, tags: string[]}|null
     */
    public function load(string $key): ?array
    {
        $raw = $this->cache->load($key);
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        try {
            $data = $this->serializer->unserialize($raw);
        } catch (\Throwable $e) {
            return null;
        }
        if (!is_array($data) || !isset($data['html']) || !is_string($data['html'])) {
            return null;
        }

        return ['html' => $data['html'], 'tags' => array_values(array_map('strval', (array) ($data['tags'] ?? [])))];
    }

    /**
     * @param string[] $tags
     */
    public function save(string $key, string $html, array $tags): void
    {
        $this->cache->save(
            $this->serializer->serialize(['html' => $html, 'tags' => array_values($tags)]),
            $key,
            array_values(array_unique(array_merge([self::TAG], $tags))),
            self::LIFETIME
        );
    }

    /**
     * Drops every cached suggestion: the module tag is cleaned in every
     * application cache frontend (the entries live in the default one, the
     * same `CacheInterface` they were saved through) and dispatched as
     * `clean_cache_by_tags`, where core's observers clean the built-in page
     * cache and BAN Varnish. Never throws: a flush that fails is logged, the
     * entries then expire with their lifetime.
     */
    public function flush(): void
    {
        try {
            $this->cache->clean([self::TAG]);
            $this->eventManager->dispatch('clean_cache_by_tags', ['object' => new Identities([self::TAG])]);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: suggest cache flush failed: ' . $e->getMessage());
        }
    }
}

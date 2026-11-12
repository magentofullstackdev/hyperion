<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Security;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Per-client request budget for the routes bots like to flood (search
 * suggestions, search results, layered navigation).
 *
 * Fixed window: every client address and route group owns one counter per
 * 10 second slice, kept in the application cache (Valkey / Redis on a
 * production store, so every PHP node shares it). Only requests that reach
 * PHP are counted: a Varnish HIT costs nothing and is not limited. The
 * counter is read and written back without a lock, so under heavy
 * concurrency a client may get a few requests past the limit; the purpose
 * is to bound the load of a flood, not to account requests exactly.
 */
class RateLimiter
{
    public const WINDOW_SECONDS = 10;
    public const XML_PATH_ENABLED = 'hyperion/security/rate_limit_enabled';
    private const CACHE_PREFIX = 'hyperion_rate_';

    /**
     * @param CacheInterface $cache
     * @param ScopeConfigInterface $scopeConfig
     * @param ClientAddress $clientAddress
     * @param array<string, string> $groups route group => config path of its limit (requests per window)
     */
    public function __construct(
        private readonly CacheInterface $cache,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly ClientAddress $clientAddress,
        private readonly array $groups = []
    ) {
    }

    /**
     * Counts one request of the current client against the group's budget.
     *
     * @return bool true when the request may proceed, false once the budget of the window is spent
     */
    public function hit(string $group): bool
    {
        $limit = $this->limit($group);
        if ($limit <= 0) {
            return true;
        }
        $client = $this->clientAddress->get();
        if ($client === '') {
            return true;
        }

        $window = intdiv(time(), self::WINDOW_SECONDS);
        $key = self::CACHE_PREFIX . hash('xxh3', $group . '|' . $client . '|' . $window);
        $count = (int) $this->cache->load($key) + 1;
        // Two windows of lifetime: the key is never reused and expires on its own, so it
        // carries no tag (a tagged entry costs the backend a tag index nothing ever cleans by).
        $this->cache->save((string) $count, $key, [], self::WINDOW_SECONDS * 2);

        return $count <= $limit;
    }

    public function isEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return int requests per window for the group, 0 when the limiter is off or the group is unknown
     */
    public function limit(string $group): int
    {
        if (!$this->isEnabled() || !isset($this->groups[$group])) {
            return 0;
        }

        return max(0, (int) $this->scopeConfig->getValue((string) $this->groups[$group], ScopeInterface::SCOPE_STORE));
    }

    /**
     * @return string[] the route groups that have a limit configured
     */
    public function getGroups(): array
    {
        return array_keys($this->groups);
    }
}

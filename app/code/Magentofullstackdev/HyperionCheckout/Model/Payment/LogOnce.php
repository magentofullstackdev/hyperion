<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment;

use Magento\Framework\App\Cache\Type\Config as ConfigCache;
use Magento\Framework\App\CacheInterface;
use Psr\Log\LoggerInterface;

/**
 * Writes a log line once per cache lifetime.
 *
 * A misconfigured pool entry is found again on every checkout render; its
 * line is written the first time and then remembered in the cache (tagged
 * with the configuration cache, so a configuration flush lets it be logged
 * again). Within one request a line is written at most once even when the
 * cache is unavailable.
 */
class LogOnce
{
    private const CACHE_PREFIX = 'hyperion_checkout_log_';
    private const LIFETIME = 86400;

    /** @var array<string, true> */
    private array $written = [];

    /**
     * @param LoggerInterface $logger
     * @param CacheInterface $cache
     */
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly CacheInterface $cache
    ) {
    }

    /**
     * Log an `error` line once.
     *
     * @param string $message
     * @param array<string, mixed> $context
     * @return void
     */
    public function error(string $message, array $context = []): void
    {
        $this->write('error', $message, $context);
    }

    /**
     * Log a `notice` line once.
     *
     * @param string $message
     * @param array<string, mixed> $context
     * @return void
     */
    public function notice(string $message, array $context = []): void
    {
        $this->write('notice', $message, $context);
    }

    /**
     * Log a `warning` line once.
     *
     * @param string $message
     * @param array<string, mixed> $context
     * @return void
     */
    public function warning(string $message, array $context = []): void
    {
        $this->write('warning', $message, $context);
    }

    /**
     * @param string $level
     * @param string $message
     * @param array<string, mixed> $context
     * @return void
     */
    private function write(string $level, string $message, array $context): void
    {
        $key = self::CACHE_PREFIX . sha1($level . "\n" . $message);
        if (isset($this->written[$key])) {
            return;
        }
        $this->written[$key] = true;
        try {
            if ($this->cache->load($key)) {
                return;
            }
            $this->cache->save('1', $key, [ConfigCache::CACHE_TAG], self::LIFETIME);
        } catch (\Throwable $e) {
            $context['log_once_cache_error'] = $e->getMessage();
        }
        $this->logger->log($level, $message, $context);
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment;

use Magento\Framework\App\Cache\Type\Config as ConfigCache;
use Magento\Framework\App\CacheInterface;
use Psr\Log\LoggerInterface;

/**
 * Keeps the stored report of hidden payment methods current from the
 * checkout page, at most once per store view and hour.
 *
 * The throttle is a cache entry tagged with the configuration cache, so a
 * configuration flush lets the next checkout render check again. A check
 * that finds hidden methods writes one `warning` line; the report is saved
 * only when its list changed.
 */
class UnsupportedMethodsMonitor
{
    public const CACHE_PREFIX = 'hyperion_checkout_unsupported_';
    public const LIFETIME = 3600;

    /**
     * @param UnsupportedMethods $unsupportedMethods
     * @param UnsupportedMethodsReport $report
     * @param CacheInterface $cache
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly UnsupportedMethods $unsupportedMethods,
        private readonly UnsupportedMethodsReport $report,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Check the store view unless it was checked within the hour.
     *
     * @param int $storeId
     * @param string $storeCode For the log line
     * @return bool Whether the check ran
     */
    public function check(int $storeId, string $storeCode): bool
    {
        $key = self::CACHE_PREFIX . $storeId;
        if ($this->cache->load($key)) {
            return false;
        }
        $this->cache->save('1', $key, [ConfigCache::CACHE_TAG], self::LIFETIME);

        $methods = $this->unsupportedMethods->collect($storeId);
        if ($methods !== []) {
            $this->logger->warning(sprintf(
                'Hyperion checkout: active payment methods without a checkout renderer are hidden from shoppers'
                . ' on store "%s": %s. Run bin/magento hyperion:checkout:payments for details.',
                $storeCode,
                implode(', ', array_keys($methods))
            ));
        }
        $this->report->save($storeId, $methods);
        return true;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment\Observer;

use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsMonitor;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Forgets the report of hidden payment methods after the payment methods
 * configuration was saved (`admin_system_config_changed_section_payment`).
 *
 * The old list is unknown after such a change; the next checkout render or
 * a run of `bin/magento hyperion:checkout:payments` rebuilds it. The
 * per store throttle of `UnsupportedMethodsMonitor` is removed with it, so
 * that render checks at once. Runs in the admin area, where the renderer pool
 * does not exist: nothing here reads it.
 */
class ResetUnsupportedMethodsReport implements ObserverInterface
{
    /**
     * @param UnsupportedMethodsReport $report
     * @param CacheInterface $cache
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly UnsupportedMethodsReport $report,
        private readonly CacheInterface $cache,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     */
    public function execute(Observer $observer)
    {
        try {
            $this->report->clear();
            foreach (array_keys($this->storeManager->getStores(true)) as $storeId) {
                $this->cache->remove(UnsupportedMethodsMonitor::CACHE_PREFIX . (int)$storeId);
            }
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: the report of hidden payment methods could not be reset: ' . $e->getMessage()
            );
        }
    }
}

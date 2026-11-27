<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment;

use Magento\Framework\App\Cache\Type\Config as ConfigCache;
use Magento\Framework\App\CacheInterface;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethods;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsMonitor;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The checkout side check of hidden payment methods: once per store view
 * and hour, one warning when something is hidden, the report handed the list.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsMonitor
 */
class UnsupportedMethodsMonitorTest extends TestCase
{
    public function testSkipsAStoreViewCheckedWithinTheHour(): void
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn('1');
        $collector = $this->createMock(UnsupportedMethods::class);
        $collector->expects(self::never())->method('collect');

        $monitor = new UnsupportedMethodsMonitor(
            $collector,
            $this->createStub(UnsupportedMethodsReport::class),
            $cache,
            $this->createStub(LoggerInterface::class)
        );

        self::assertFalse($monitor->check(1, 'default'));
    }

    public function testChecksLogsOnceAndSavesTheList(): void
    {
        $cache = $this->createMock(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $cache->expects(self::once())->method('save')->with(
            '1',
            'hyperion_checkout_unsupported_1',
            [ConfigCache::CACHE_TAG],
            3600
        );
        $collector = $this->createStub(UnsupportedMethods::class);
        $collector->method('collect')->willReturn(['amazon' => 'Amazon Pay', 'adyen' => 'Adyen']);
        $report = $this->createMock(UnsupportedMethodsReport::class);
        $report->expects(self::once())->method('save')->with(1, ['amazon' => 'Amazon Pay', 'adyen' => 'Adyen']);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(
            self::logicalAnd(self::stringContains('"default"'), self::stringContains('amazon, adyen'))
        );

        self::assertTrue((new UnsupportedMethodsMonitor($collector, $report, $cache, $logger))->check(1, 'default'));
    }

    public function testNothingHiddenLogsNothing(): void
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $collector = $this->createStub(UnsupportedMethods::class);
        $collector->method('collect')->willReturn([]);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('warning');

        $monitor = new UnsupportedMethodsMonitor(
            $collector,
            $this->createStub(UnsupportedMethodsReport::class),
            $cache,
            $logger
        );

        self::assertTrue($monitor->check(1, 'default'));
    }
}

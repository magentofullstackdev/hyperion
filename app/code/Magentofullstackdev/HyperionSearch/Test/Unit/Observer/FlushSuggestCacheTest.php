<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Observer;

use Magento\Framework\Event\Observer;
use Magentofullstackdev\HyperionSearch\Model\Suggest\Cache;
use Magentofullstackdev\HyperionSearch\Observer\FlushSuggestCache;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Observer\FlushSuggestCache
 */
class FlushSuggestCacheTest extends TestCase
{
    public function testEveryEventFlushesTheSuggestCacheOnce(): void
    {
        $cache = $this->createMock(Cache::class);
        $cache->expects(self::once())->method('flush');

        (new FlushSuggestCache($cache))->execute(new Observer());
    }
}

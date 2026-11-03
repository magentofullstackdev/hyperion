<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Framework\App\Cache;

use Magento\Framework\App\CacheInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Plugin\Framework\App\Cache\DegradedBlockCachePlugin;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Framework\App\Cache\DegradedBlockCachePlugin
 */
class DegradedBlockCachePluginTest extends TestCase
{
    public function testADegradedRequestWritesNoBlockCacheEntry(): void
    {
        $degraded = new DegradedResponse();
        $degraded->mark();
        $calls = 0;
        $proceed = static function () use (&$calls): bool {
            $calls++;
            return true;
        };

        $result = (new DegradedBlockCachePlugin($degraded))
            ->aroundSave($this->createStub(CacheInterface::class), $proceed, '<ul></ul>', 'key', ['block_html', 'cat_p_1'], 3600);

        self::assertFalse($result);
        self::assertSame(0, $calls);
    }

    public function testOtherCacheEntriesAreStillWrittenWhileDegraded(): void
    {
        $degraded = new DegradedResponse();
        $degraded->mark();
        $proceed = static fn (): bool => true;

        self::assertTrue((new DegradedBlockCachePlugin($degraded))
            ->aroundSave($this->createStub(CacheInterface::class), $proceed, 'x', 'key', ['HYPERION_SEARCH_SUGGEST'], 3600));
    }

    public function testAHealthyRequestWritesTheBlockCache(): void
    {
        $proceed = static fn (): bool => true;

        self::assertTrue((new DegradedBlockCachePlugin(new DegradedResponse()))
            ->aroundSave($this->createStub(CacheInterface::class), $proceed, '<ul></ul>', 'key', ['block_html'], 3600));
    }
}

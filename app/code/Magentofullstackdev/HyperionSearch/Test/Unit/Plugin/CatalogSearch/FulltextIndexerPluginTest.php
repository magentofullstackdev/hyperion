<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Plugin\CatalogSearch;

use Magento\CatalogSearch\Model\Indexer\Fulltext;
use Magentofullstackdev\HyperionSearch\Model\Suggest\Cache;
use Magentofullstackdev\HyperionSearch\Plugin\CatalogSearch\FulltextIndexerPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Plugin\CatalogSearch\FulltextIndexerPlugin
 */
class FulltextIndexerPluginTest extends TestCase
{
    /**
     * @return array<string, array{string, array<int, mixed>}>
     */
    public static function hookProvider(): array
    {
        return [
            'full reindex' => ['afterExecuteFull', [null]],
            'id list' => ['afterExecuteList', [null, [1, 2, 3]]],
            'single row' => ['afterExecuteRow', [null, 7]],
            'mview execute' => ['afterExecute', [null, [4, 5]]],
        ];
    }

    /**
     * @param array<int, mixed> $arguments
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('hookProvider')]
    public function testEveryIndexRunFlushesTheSuggestCacheOnce(string $hook, array $arguments): void
    {
        $cache = $this->createMock(Cache::class);
        $cache->expects(self::once())->method('flush');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('error');
        $plugin = new FulltextIndexerPlugin($cache, $logger);

        self::assertNull($plugin->$hook($this->createStub(Fulltext::class), ...$arguments));
    }

    /**
     * @param array<int, mixed> $arguments
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('hookProvider')]
    public function testAThrowingCacheIsLoggedAndNeverFailsTheIndexer(string $hook, array $arguments): void
    {
        $cache = $this->createStub(Cache::class);
        $cache->method('flush')->willThrowException(new \RuntimeException('boom'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('boom'));
        $plugin = new FulltextIndexerPlugin($cache, $logger);

        self::assertNull($plugin->$hook($this->createStub(Fulltext::class), ...$arguments));
    }

    public function testTheResultOfTheInterceptedMethodIsHandedBack(): void
    {
        $plugin = new FulltextIndexerPlugin($this->createStub(Cache::class), $this->createStub(LoggerInterface::class));

        self::assertSame('kept', $plugin->afterExecuteFull($this->createStub(Fulltext::class), 'kept'));
    }
}

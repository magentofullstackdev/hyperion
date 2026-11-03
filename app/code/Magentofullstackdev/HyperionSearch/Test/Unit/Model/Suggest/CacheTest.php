<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Model\Suggest;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Event\ManagerInterface as EventManager;
use Magento\Framework\Serialize\Serializer\Json;
use Magentofullstackdev\HyperionSearch\Model\Cache\Identities;
use Magentofullstackdev\HyperionSearch\Model\Suggest\Cache;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Model\Suggest\Cache
 * @covers \Magentofullstackdev\HyperionSearch\Model\Cache\Identities
 */
class CacheTest extends TestCase
{
    /** @var array<string, string> */
    private array $store = [];

    public function testKeysDependOnStoreVaryContextAndQuery(): void
    {
        $cache = $this->cache($this->createStub(CacheInterface::class));

        self::assertSame($cache->key(1, 'v1', 'bag'), $cache->key(1, 'v1', 'bag'));
        self::assertNotSame($cache->key(1, 'v1', 'bag'), $cache->key(2, 'v1', 'bag'));
        self::assertNotSame($cache->key(1, 'v1', 'bag'), $cache->key(1, 'v2', 'bag'));
        self::assertNotSame($cache->key(1, 'v1', 'bag'), $cache->key(1, 'v1', 'bags'));
    }

    public function testSavesTheFragmentWithItsTagsAndLoadsItBack(): void
    {
        $backend = $this->createStub(CacheInterface::class);
        $backend->method('save')->willReturnCallback(function (string $data, string $id, array $tags, $lifetime): bool {
            self::assertSame([Cache::TAG, 'cat_p_7', 'cat_c_3'], $tags);
            self::assertSame(Cache::LIFETIME, $lifetime);
            $this->store[$id] = $data;
            return true;
        });
        $backend->method('load')->willReturnCallback(fn (string $id) => $this->store[$id] ?? false);
        $cache = $this->cache($backend);

        $cache->save('k', '<ul></ul>', ['cat_p_7', 'cat_c_3']);

        self::assertSame(['html' => '<ul></ul>', 'tags' => ['cat_p_7', 'cat_c_3']], $cache->load('k'));
        self::assertNull($cache->load('missing'));
    }

    public function testCorruptEntriesAreIgnored(): void
    {
        $backend = $this->createStub(CacheInterface::class);
        $backend->method('load')->willReturn('not json {');

        self::assertNull($this->cache($backend)->load('k'));
    }

    public function testFlushCleansTheModuleTagInTheAppCacheAndDispatchesItForTheEdge(): void
    {
        $backend = $this->createMock(CacheInterface::class);
        $backend->expects(self::once())->method('clean')->with([Cache::TAG])->willReturn(true);
        $events = $this->createMock(EventManager::class);
        $events->expects(self::once())->method('dispatch')->with(
            'clean_cache_by_tags',
            self::callback(static function (array $data): bool {
                $object = $data['object'] ?? null;
                return $object instanceof Identities
                    && $object instanceof IdentityInterface
                    && $object->getIdentities() === [Cache::TAG];
            })
        );
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('error');

        $this->cache($backend, $events, $logger)->flush();
    }

    public function testAFailingFlushIsLoggedAndNeverThrows(): void
    {
        $backend = $this->createStub(CacheInterface::class);
        $backend->method('clean')->willThrowException(new \RuntimeException('redis down'));
        $events = $this->createMock(EventManager::class);
        $events->expects(self::never())->method('dispatch');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('redis down'));

        $this->cache($backend, $events, $logger)->flush();
    }

    private function cache(
        CacheInterface $backend,
        ?EventManager $events = null,
        ?LoggerInterface $logger = null
    ): Cache {
        return new Cache(
            $backend,
            new Json(),
            $events ?? $this->createStub(EventManager::class),
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }
}

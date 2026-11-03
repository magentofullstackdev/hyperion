<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Cache;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Event\ManagerInterface as EventManager;
use Magento\Framework\Indexer\CacheContext;
use Magento\Framework\Indexer\CacheContextFactory;
use Magentofullstackdev\HyperionImage\Cache\BatchInvalidator;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\ProductIdResolver;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionImage\Cache\BatchInvalidator
 */
class BatchInvalidatorTest extends TestCase
{
    private const FILE_A = '/var/www/html/pub/media/catalog/product/cache/0a1b2c/j/o/joust.jpg';
    private const FILE_B = '/var/www/html/pub/media/catalog/product/cache/0a1b2c/b/a/bag.jpg';

    /** @var CacheContextFactory&Stub */
    private CacheContextFactory $cacheContextFactory;
    /** @var Config&Stub */
    private Config $config;

    protected function setUp(): void
    {
        $this->cacheContextFactory = $this->createStub(CacheContextFactory::class);
        $this->cacheContextFactory->method('create')->willReturnCallback(
            static fn (): CacheContext => new CacheContext()
        );
        $this->config = $this->createStub(Config::class);
    }

    /**
     * The cache, the event manager, the resolver and the logger are stubs
     * unless the test hands in a mock whose calls it verifies.
     */
    private function makeInvalidator(
        ?CacheInterface $cache = null,
        ?EventManager $eventManager = null,
        ?ProductIdResolver $productIdResolver = null,
        ?LoggerInterface $logger = null
    ): BatchInvalidator {
        return new BatchInvalidator(
            $cache ?? $this->createStub(CacheInterface::class),
            $eventManager ?? $this->createStub(EventManager::class),
            $this->cacheContextFactory,
            $productIdResolver ?? $this->createStub(ProductIdResolver::class),
            $this->config,
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    /**
     * @return CacheInterface&MockObject
     */
    private function cacheNeverCleaned(): CacheInterface
    {
        $cache = $this->createMock(CacheInterface::class);
        $cache->expects(self::never())->method('clean');

        return $cache;
    }

    /**
     * @return EventManager&MockObject
     */
    private function nothingDispatched(): EventManager
    {
        $eventManager = $this->createMock(EventManager::class);
        $eventManager->expects(self::never())->method('dispatch');

        return $eventManager;
    }

    /**
     * @return ProductIdResolver&MockObject
     */
    private function resolverNeverAsked(): ProductIdResolver
    {
        $resolver = $this->createMock(ProductIdResolver::class);
        $resolver->expects(self::never())->method('resolve');

        return $resolver;
    }

    private function enable(bool $module = true, bool $invalidate = true): void
    {
        $this->config->method('isEnabled')->willReturn($module);
        $this->config->method('isInvalidateOnBatchEndEnabled')->willReturn($invalidate);
    }

    public function testNothingRecordedDoesNothing(): void
    {
        $this->enable();

        $invalidator = $this->makeInvalidator($this->cacheNeverCleaned(), $this->nothingDispatched(), $this->resolverNeverAsked());
        self::assertFalse($invalidator->isDirty());
        self::assertSame(0, $invalidator->flushIfDirty());
    }

    public function testFlushCleansOnlyTheTagsOfTheAffectedProducts(): void
    {
        $this->enable();
        $productIdResolver = $this->createMock(ProductIdResolver::class);
        $productIdResolver
            ->expects(self::once())
            ->method('resolve')
            ->with([self::FILE_A, self::FILE_B])
            ->willReturn([1, 42]);

        $announcedTags = null;
        $eventManager = $this->createMock(EventManager::class);
        $eventManager
            ->expects(self::once())
            ->method('dispatch')
            ->willReturnCallback(static function (string $event, array $data) use (&$announcedTags): void {
                self::assertSame('clean_cache_by_tags', $event);
                self::assertInstanceOf(IdentityInterface::class, $data['object']);
                $announcedTags = $data['object']->getIdentities();
            });
        $cache = $this->createMock(CacheInterface::class);
        $cache
            ->expects(self::once())
            ->method('clean')
            ->with(['cat_p_1', 'cat_p_42']);

        $invalidator = $this->makeInvalidator($cache, $eventManager, $productIdResolver);
        $invalidator->recordConversion(self::FILE_A);
        $invalidator->recordConversion(self::FILE_B);
        $invalidator->recordConversion(self::FILE_A);
        self::assertTrue($invalidator->isDirty());
        self::assertSame(2, $invalidator->flushIfDirty());
        self::assertFalse($invalidator->isDirty());
        self::assertSame(['cat_p_1', 'cat_p_42'], $announcedTags);
    }

    public function testFilesWithoutProductInvalidateNothing(): void
    {
        $this->enable();
        $productIdResolver = $this->createStub(ProductIdResolver::class);
        $productIdResolver->method('resolve')->willReturn([]);

        $invalidator = $this->makeInvalidator($this->cacheNeverCleaned(), $this->nothingDispatched(), $productIdResolver);
        $invalidator->recordConversion('/var/www/html/pub/media/wysiwyg/banner.jpg');
        self::assertSame(0, $invalidator->flushIfDirty());
        self::assertFalse($invalidator->isDirty());
    }

    public function testFlushSkippedWhenFeatureDisabled(): void
    {
        $this->enable(true, false);

        $invalidator = $this->makeInvalidator($this->cacheNeverCleaned(), $this->nothingDispatched(), $this->resolverNeverAsked());
        $invalidator->recordConversion(self::FILE_A);
        self::assertSame(0, $invalidator->flushIfDirty());
        self::assertFalse($invalidator->isDirty());
    }

    public function testFlushSkippedWhenModuleDisabled(): void
    {
        $this->enable(false);

        $invalidator = $this->makeInvalidator($this->cacheNeverCleaned(), $this->nothingDispatched());
        $invalidator->recordConversion(self::FILE_A);
        self::assertSame(0, $invalidator->flushIfDirty());
    }

    public function testFailureKeepsTheRecordedFilesForRetry(): void
    {
        $this->enable();
        $productIdResolver = $this->createStub(ProductIdResolver::class);
        $productIdResolver->method('resolve')->willReturn([1]);
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('clean')->willThrowException(new \RuntimeException('cache backend exploded'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning');

        $invalidator = $this->makeInvalidator($cache, null, $productIdResolver, $logger);
        $invalidator->recordConversion(self::FILE_A);
        self::assertSame(0, $invalidator->flushIfDirty());
        self::assertTrue($invalidator->isDirty(), 'recorded files should persist after a failed flush');
    }
}

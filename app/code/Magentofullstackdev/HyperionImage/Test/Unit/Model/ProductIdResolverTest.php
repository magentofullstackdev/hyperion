<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Model;

use Magento\Framework\App\ResourceConnection;
use Magento\Framework\EntityManager\MetadataPool;
use Magentofullstackdev\HyperionImage\Model\ProductIdResolver;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionImage\Model\ProductIdResolver
 */
class ProductIdResolverTest extends TestCase
{
    private function makeResolver(): ProductIdResolver
    {
        $resourceConnection = $this->createMock(ResourceConnection::class);
        $resourceConnection->expects(self::never())->method('getConnection');

        return new ProductIdResolver($resourceConnection, $this->createStub(MetadataPool::class));
    }

    public function testGalleryValueOfAProductCacheFile(): void
    {
        self::assertSame(
            '/j/o/joust.jpg',
            $this->makeResolver()->getGalleryValue(
                '/var/www/html/pub/media/catalog/product/cache/0a1b2c3d/j/o/joust.jpg'
            )
        );
    }

    public function testOtherMediaFilesHaveNoGalleryValue(): void
    {
        $resolver = $this->makeResolver();
        self::assertNull($resolver->getGalleryValue('/var/www/html/pub/media/wysiwyg/banner.jpg'));
        self::assertNull($resolver->getGalleryValue('/var/www/html/pub/media/catalog/category/women.jpg'));
    }

    public function testFilesWithoutProductNeverQueryTheDatabase(): void
    {
        self::assertSame(
            [],
            $this->makeResolver()->resolve(['/var/www/html/pub/media/wysiwyg/banner.jpg'])
        );
    }
}

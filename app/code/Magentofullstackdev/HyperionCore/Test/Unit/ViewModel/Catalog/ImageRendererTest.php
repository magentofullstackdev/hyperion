<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\ViewModel\Catalog;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Model\Product;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ImageRenderer;
use PHPUnit\Framework\TestCase;

/**
 * The renderer is the one path every product image URL of the theme takes:
 * the helper is initialised for the product and the image id, pointed at a
 * specific gallery file only when one is given, and its URL returned as is
 * (the helper itself resizes a missing cache file and falls back to the
 * placeholder on failure).
 *
 * @covers \Magentofullstackdev\HyperionCore\ViewModel\Catalog\ImageRenderer
 */
class ImageRendererTest extends TestCase
{
    public function testTheProductImageOfTheRoleIsReturned(): void
    {
        $product = $this->createStub(Product::class);
        $helper = $this->createMock(ImageHelper::class);
        $helper->expects(self::once())->method('init')->with($product, 'category_page_grid')->willReturnSelf();
        $helper->expects(self::never())->method('setImageFile');
        $helper->expects(self::once())->method('getUrl')->willReturn('https://shop.test/media/cache/x/a/front.jpg');

        $url = (new ImageRenderer($helper))->getUrl($product, 'category_page_grid');

        self::assertSame('https://shop.test/media/cache/x/a/front.jpg', $url);
    }

    public function testAGalleryFileIsSetOnTheHelperBeforeTheUrlIsBuilt(): void
    {
        $product = $this->createStub(Product::class);
        $helper = $this->createMock(ImageHelper::class);
        $helper->expects(self::once())->method('init')->with($product, 'product_page_image_large')->willReturnSelf();
        $helper->expects(self::once())->method('setImageFile')->with('/b/back.jpg')->willReturnSelf();
        $helper->expects(self::once())->method('getUrl')->willReturn('https://shop.test/media/cache/y/b/back.jpg');

        $url = (new ImageRenderer($helper))->getUrl($product, 'product_page_image_large', '/b/back.jpg');

        self::assertSame('https://shop.test/media/cache/y/b/back.jpg', $url);
    }
}

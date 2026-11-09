<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Helper\Output as OutputHelper;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\View\Asset\Placeholder;
use Magento\Catalog\Model\View\Asset\PlaceholderFactory;
use Magento\Framework\Data\Helper\PostHelper;
use Magento\Framework\DataObject;
use Magento\Framework\Escaper;
use Magento\Framework\Pricing\Render as PriceRender;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\ProductView;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ImageRenderer;
use Magentofullstackdev\HyperionImage\ViewModel\ImageConfig;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The gallery payload of a product without a usable image is the catalog
 * placeholder, never an empty array (the page printed `<img src="">`).
 *
 * @covers \Magentofullstackdev\HyperionCatalog\ViewModel\ProductView
 */
class ProductViewTest extends TestCase
{
    private const PLACEHOLDER = 'https://shop.test/static/frontend/Vendor/theme/en_US/Magento_Catalog/images/product/placeholder/image.jpg';

    public function testAProductWithoutImagesGetsOnePlaceholderEntry(): void
    {
        $factory = $this->createMock(PlaceholderFactory::class);
        $factory->expects(self::once())->method('create')->with(['type' => 'image'])->willReturn($this->placeholder());

        $images = $this->viewModel($factory)->getGalleryImages($this->product([]));

        self::assertCount(1, $images);
        self::assertSame(self::PLACEHOLDER, $images[0]['img']);
        self::assertSame(self::PLACEHOLDER, $images[0]['thumb']);
        self::assertSame(self::PLACEHOLDER, $images[0]['full']);
        self::assertSame('', $images[0]['imgWebp']);
        self::assertSame('', $images[0]['fullAvif']);
        self::assertTrue($images[0]['isMain']);
        self::assertSame('image', $images[0]['type']);
    }

    public function testDisabledEntriesOnlyFallBackToThePlaceholderToo(): void
    {
        $factory = $this->createMock(PlaceholderFactory::class);
        $factory->expects(self::once())->method('create')->willReturn($this->placeholder());

        $images = $this->viewModel($factory)->getGalleryImages(
            $this->product([new DataObject(['file' => '/d/disabled.jpg', 'disabled' => 1])])
        );

        self::assertCount(1, $images);
        self::assertSame(self::PLACEHOLDER, $images[0]['img']);
    }

    public function testAProductWithImagesNeverAsksForThePlaceholder(): void
    {
        $factory = $this->createMock(PlaceholderFactory::class);
        $factory->expects(self::never())->method('create');

        $images = $this->viewModel($factory)->getGalleryImages(
            $this->product([new DataObject(['file' => '/a/front.jpg', 'label' => 'Front', 'position' => 1])])
        );

        self::assertCount(1, $images);
        self::assertSame('https://shop.test/media/cache/a/front.jpg', $images[0]['img']);
        self::assertSame('Front', $images[0]['label']);
        self::assertTrue($images[0]['isMain']);
    }

    public function testEveryRoleIsResolvedThroughTheImageHelperWithTheGalleryFile(): void
    {
        $calls = [];
        $renderer = $this->createStub(ImageRenderer::class);
        $renderer->method('getUrl')->willReturnCallback(
            static function (Product $product, string $imageId, string $file) use (&$calls): string {
                $calls[] = [$imageId, $file];

                return 'https://shop.test/media/cache/' . $imageId . $file;
            }
        );
        $product = $this->product([new DataObject(['file' => '/a/front.jpg', 'position' => 1])]);

        $images = $this->viewModel($this->createStub(PlaceholderFactory::class), $renderer)->getGalleryImages($product);

        self::assertSame(
            [
                ['product_page_image_small', '/a/front.jpg'],
                ['product_page_image_medium', '/a/front.jpg'],
                ['product_page_image_large', '/a/front.jpg'],
            ],
            $calls
        );
        self::assertSame('https://shop.test/media/cache/product_page_image_small/a/front.jpg', $images[0]['thumb']);
        self::assertSame('https://shop.test/media/cache/product_page_image_medium/a/front.jpg', $images[0]['img']);
        self::assertSame('https://shop.test/media/cache/product_page_image_large/a/front.jpg', $images[0]['full']);
    }

    public function testAFailingImageHelperLeavesAnEmptyLoggedGallery(): void
    {
        $renderer = $this->createStub(ImageRenderer::class);
        $renderer->method('getUrl')->willThrowException(new \RuntimeException('media storage down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('media storage down'));

        $images = $this->viewModel($this->createStub(PlaceholderFactory::class), $renderer, $logger)->getGalleryImages(
            $this->product([new DataObject(['file' => '/a/front.jpg', 'position' => 1])])
        );

        self::assertSame([], $images);
    }

    private function placeholder(): Placeholder
    {
        $placeholder = $this->createStub(Placeholder::class);
        $placeholder->method('getUrl')->willReturn(self::PLACEHOLDER);

        return $placeholder;
    }

    /**
     * @param DataObject[] $entries
     */
    private function product(array $entries): Product
    {
        $product = $this->createStub(Product::class);
        $product->method('getImage')->willReturn('/a/front.jpg');
        $product->method('getMediaGalleryImages')->willReturn(new \ArrayIterator($entries));

        return $product;
    }

    private function viewModel(
        PlaceholderFactory $factory,
        ?ImageRenderer $renderer = null,
        ?LoggerInterface $logger = null
    ): ProductView {
        if ($renderer === null) {
            $renderer = $this->createStub(ImageRenderer::class);
            $renderer->method('getUrl')->willReturnCallback(
                static fn (Product $product, string $imageId, string $file): string => 'https://shop.test/media/cache' . $file
            );
        }
        $imageConfig = $this->createStub(ImageConfig::class);
        $imageConfig->method('hasWebpCompanion')->willReturn(false);
        $imageConfig->method('hasAvifCompanion')->willReturn(false);

        return new ProductView(
            $this->createStub(PriceRender::class),
            $this->createStub(Escaper::class),
            $this->createStub(UrlInterface::class),
            $this->createStub(PostHelper::class),
            $logger ?? $this->createStub(LoggerInterface::class),
            $renderer,
            $imageConfig,
            $this->createStub(OutputHelper::class),
            new DegradedResponse(),
            $factory
        );
    }
}

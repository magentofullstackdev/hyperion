<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Compare as CompareHelper;
use Magento\Catalog\Model\Product;
use Magento\Checkout\Helper\Cart as CartHelper;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Data\Helper\PostHelper;
use Magento\Framework\Escaper;
use Magento\Framework\Pricing\Render as PriceRender;
use Magento\Framework\UrlInterface;
use Magento\Swatches\Model\SwatchAttributesProvider;
use Magento\Wishlist\Helper\Data as WishlistHelper;
use Magentofullstackdev\HyperionCatalog\ViewModel\ProductList;
use Magentofullstackdev\HyperionCatalog\ViewModel\SwatchConfig;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The price fallback path: a throwing price renderer yields the `--`
 * markup, is logged, and raises the flag the list block reads to keep
 * the degraded grid out of the block cache.
 *
 * @covers \Magentofullstackdev\HyperionCatalog\ViewModel\ProductList
 */
class ProductListTest extends TestCase
{
    /** @var PriceRender&Stub */
    private PriceRender $priceRender;
    private DegradedResponse $degradedResponse;
    private ProductList $viewModel;

    protected function setUp(): void
    {
        $this->priceRender = $this->createStub(PriceRender::class);
        $this->degradedResponse = new DegradedResponse();
        $this->viewModel = $this->viewModel($this->createStub(LoggerInterface::class));
    }

    /**
     * The logger is the one dependency a test verifies: a stub by default, a
     * mock when the test hands one in.
     */
    private function viewModel(LoggerInterface $logger): ProductList
    {
        return new ProductList(
            $this->createStub(ImageHelper::class),
            $this->priceRender,
            $this->createStub(CartHelper::class),
            $this->createStub(PostHelper::class),
            $this->createStub(UrlInterface::class),
            $this->createStub(Escaper::class),
            $logger,
            $this->createStub(SwatchConfig::class),
            $this->createStub(CompareHelper::class),
            $this->createStub(WishlistHelper::class),
            $this->createStub(SwatchAttributesProvider::class),
            $this->createStub(ScopeConfigInterface::class),
            $this->createStub(Availability::class),
            $this->degradedResponse
        );
    }

    public function testNoFailureBeforeAnyPriceRenders(): void
    {
        self::assertFalse($this->viewModel->hasPriceRenderFailed());
    }

    public function testRenderedPriceLeavesTheFlagDown(): void
    {
        $this->priceRender->method('render')->willReturn('<span class="price">$10.00</span>');
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('error');
        $viewModel = $this->viewModel($logger);

        self::assertSame(
            '<span class="price">$10.00</span>',
            $viewModel->getPriceHtml($this->createStub(Product::class))
        );
        self::assertFalse($viewModel->hasPriceRenderFailed());
    }

    public function testThrowingPriceRendererSetsTheFlagAndReturnsTheFallback(): void
    {
        $this->priceRender->method('render')->willThrowException(new \RuntimeException('no price box'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())
            ->method('error')
            ->with(self::stringContains('price render failed -- no price box'));
        $viewModel = $this->viewModel($logger);

        self::assertSame(
            '<span class="price">--</span>',
            $viewModel->getPriceHtml($this->createStub(Product::class))
        );
        self::assertTrue($viewModel->hasPriceRenderFailed());
    }

    public function testTheFlagStaysUpForTheRestOfTheRequest(): void
    {
        $product = $this->createStub(Product::class);
        $this->priceRender->method('render')->willReturnCallback(
            static function (string $code, Product $p, array $arguments) use (&$calls): string {
                $calls = ($calls ?? 0) + 1;
                if ($calls === 1) {
                    throw new \RuntimeException('first tile');
                }
                return '<span class="price">$5.00</span>';
            }
        );

        self::assertSame('<span class="price">--</span>', $this->viewModel->getPriceHtml($product));
        self::assertSame('<span class="price">$5.00</span>', $this->viewModel->getPriceHtml($product));
        self::assertTrue($this->viewModel->hasPriceRenderFailed(), 'one failed tile taints the whole grid');
    }

    public function testAFailedPriceMarksTheRequestDegraded(): void
    {
        $this->priceRender->method('render')->willThrowException(new \RuntimeException('pricing down'));

        $this->viewModel->getPriceHtml($this->createStub(Product::class));

        self::assertTrue($this->degradedResponse->isDegraded());
    }

    public function testARenderedPriceLeavesTheRequestHealthy(): void
    {
        $this->priceRender->method('render')->willReturn('<span class="price">$10.00</span>');

        $this->viewModel->getPriceHtml($this->createStub(Product::class));

        self::assertFalse($this->degradedResponse->isDegraded());
    }
}

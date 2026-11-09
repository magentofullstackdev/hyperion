<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Helper\Output as OutputHelper;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\View\Asset\PlaceholderFactory;
use Magento\Framework\Data\Helper\PostHelper;
use Magento\Framework\Escaper;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\Pricing\Render as PriceRender;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\Pricing;
use Magentofullstackdev\HyperionCatalog\ViewModel\ProductView;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ImageRenderer;
use Magentofullstackdev\HyperionImage\ViewModel\ImageConfig;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Every view model that prints the `--` fallback raises the request flag.
 * `Pricing` is the path the list and product templates really use.
 *
 * @covers \Magentofullstackdev\HyperionCatalog\ViewModel\Pricing
 * @covers \Magentofullstackdev\HyperionCatalog\ViewModel\ProductView
 */
class PriceFallbackTest extends TestCase
{
    public function testPricingRaisesTheFlag(): void
    {
        $degraded = new DegradedResponse();
        $viewModel = new Pricing(
            $this->failingRender(),
            $this->createStub(LoggerInterface::class),
            $this->createStub(PriceCurrencyInterface::class),
            $degraded
        );

        self::assertStringContainsString('--', $viewModel->getCustomHtml($this->createStub(Product::class)));
        self::assertTrue($degraded->isDegraded());
    }

    public function testProductViewRaisesTheFlag(): void
    {
        $degraded = new DegradedResponse();
        $viewModel = new ProductView(
            $this->failingRender(),
            $this->createStub(Escaper::class),
            $this->createStub(UrlInterface::class),
            $this->createStub(PostHelper::class),
            $this->createStub(LoggerInterface::class),
            $this->createStub(ImageRenderer::class),
            $this->createStub(ImageConfig::class),
            $this->createStub(OutputHelper::class),
            $degraded,
            $this->createStub(PlaceholderFactory::class)
        );

        self::assertSame('<span class="price">--</span>', $viewModel->getPriceHtml($this->createStub(Product::class)));
        self::assertTrue($viewModel->hasPriceRenderFailed());
        self::assertTrue($degraded->isDegraded());
    }

    private function failingRender(): PriceRender
    {
        $render = $this->createStub(PriceRender::class);
        $render->method('render')->willThrowException(new \RuntimeException('pricing down'));

        return $render;
    }
}

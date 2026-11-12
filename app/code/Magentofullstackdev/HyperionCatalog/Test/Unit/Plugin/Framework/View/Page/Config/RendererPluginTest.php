<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Plugin\Framework\View\Page\Config;

use Magento\Catalog\Model\Product;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Registry;
use Magento\Framework\View\Page\Config\Renderer;
use Magentofullstackdev\HyperionCatalog\Model\OpenGraph;
use Magentofullstackdev\HyperionCatalog\Plugin\Framework\View\Page\Config\RendererPlugin;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCatalog\Plugin\Framework\View\Page\Config\RendererPlugin
 */
class RendererPluginTest extends TestCase
{
    private const HEAD = '<title>Joust Duffle Bag</title>' . "\n";
    private const TAGS = '<meta property="og:type" content="product"/>' . "\n";

    /**
     * A plugin on a page of the given action, with the given registry entry.
     *
     * @param string $action Full action name of the request
     * @param mixed $registered What the registry holds as `current_product`
     * @param bool $ownedExternally Whether another module emits the tags
     * @param LoggerInterface|null $logger A mock when the test verifies the log
     * @param OpenGraph|null $openGraph A double of its own when the test needs one
     * @return RendererPlugin
     */
    private function plugin(
        string $action,
        mixed $registered,
        bool $ownedExternally = false,
        ?LoggerInterface $logger = null,
        ?OpenGraph $openGraph = null
    ): RendererPlugin {
        if ($openGraph === null) {
            $openGraph = $this->createStub(OpenGraph::class);
            $openGraph->method('isOwnedExternally')->willReturn($ownedExternally);
            $openGraph->method('render')->willReturn(self::TAGS);
        }
        $registry = $this->createStub(Registry::class);
        $registry->method('registry')->willReturnCallback(
            static fn ($key) => $key === 'current_product' ? $registered : null
        );
        $request = $this->createStub(HttpRequest::class);
        $request->method('getFullActionName')->willReturn($action);

        return new RendererPlugin($openGraph, $registry, $request, $logger ?? $this->createStub(LoggerInterface::class));
    }

    /**
     * @param int|null $id
     * @return Product
     */
    private function product(?int $id = 14): Product
    {
        $product = $this->createStub(Product::class);
        $product->method('getId')->willReturn($id);

        return $product;
    }

    public function testTheTagsAreAppendedToTheHeadOfAProductPage(): void
    {
        $plugin = $this->plugin('catalog_product_view', $this->product());

        $this->assertSame(
            self::HEAD . self::TAGS,
            $plugin->afterRenderHeadContent($this->createStub(Renderer::class), self::HEAD)
        );
    }

    public function testNothingIsAppendedWhenAnotherModuleEmitsTheTags(): void
    {
        $openGraph = $this->createMock(OpenGraph::class);
        $openGraph->method('isOwnedExternally')->willReturn(true);
        $openGraph->expects($this->never())->method('render');
        $plugin = $this->plugin('catalog_product_view', $this->product(), true, null, $openGraph);

        $this->assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->createStub(Renderer::class), self::HEAD));
    }

    public function testTheTagsAreAppendedWhenTheOtherModuleHasItsOpenGraphOutputSwitchedOff(): void
    {
        $openGraph = $this->createMock(OpenGraph::class);
        $openGraph->method('isOwnedExternally')->willReturn(false);
        $openGraph->expects($this->once())->method('render')->willReturn(self::TAGS);
        $plugin = $this->plugin('catalog_product_view', $this->product(), false, null, $openGraph);

        $this->assertSame(
            self::HEAD . self::TAGS,
            $plugin->afterRenderHeadContent($this->createStub(Renderer::class), self::HEAD)
        );
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function otherPageProvider(): array
    {
        return [
            'a category page' => ['catalog_category_view', true],
            'a CMS page' => ['cms_page_view', true],
            'the cart line configure page, which also registers a product' => ['checkout_cart_configure', true],
            'a product page whose registry holds no product' => ['catalog_product_view', false],
        ];
    }

    #[DataProvider('otherPageProvider')]
    public function testTheHeadIsLeftAloneOutsideAProductPage(string $action, bool $withProduct): void
    {
        $plugin = $this->plugin($action, $withProduct ? $this->product() : null);

        $this->assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->createStub(Renderer::class), self::HEAD));
    }

    public function testAProductWithoutAnIdGetsNoTags(): void
    {
        $plugin = $this->plugin('catalog_product_view', $this->product(null));

        $this->assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->createStub(Renderer::class), self::HEAD));
    }

    public function testAFailureIsLoggedAndTheHeadStaysAsRendered(): void
    {
        $openGraph = $this->createStub(OpenGraph::class);
        $openGraph->method('isOwnedExternally')->willReturn(false);
        $openGraph->method('render')->willThrowException(new \RuntimeException('no image'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects($this->once())->method('error')->with($this->stringContains('no image'));
        $plugin = $this->plugin('catalog_product_view', $this->product(), false, $logger, $openGraph);

        $this->assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->createStub(Renderer::class), self::HEAD));
    }
}

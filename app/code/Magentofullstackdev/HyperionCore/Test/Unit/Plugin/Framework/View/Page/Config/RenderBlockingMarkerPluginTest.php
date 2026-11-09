<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Framework\View\Page\Config;

use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Page\Config\Renderer;
use Magentofullstackdev\HyperionCore\Block\AssetManifest;
use Magentofullstackdev\HyperionCore\Plugin\Framework\View\Page\Config\RenderBlockingMarkerPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The render blocking marker goes into the head of a page whose critical
 * sheet exists for its type, and nowhere else.
 *
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Framework\View\Page\Config\RenderBlockingMarkerPlugin
 */
class RenderBlockingMarkerPluginTest extends TestCase
{
    private const HEAD = '<meta charset="utf-8">' . "\n";
    private const MARKER = '<link rel="expect" href="#hyperion-footer" blocking="render">' . "\n";

    public function testATypedPageWithItsSheetGetsTheMarker(): void
    {
        $plugin = $this->plugin('category', ['category' => '.page-header{position:sticky}']);

        self::assertSame(self::HEAD . self::MARKER, $plugin->afterRenderHeadContent($this->renderer(), self::HEAD));
    }

    public function testAListingNamesItsGridAsTheMarker(): void
    {
        $plugin = $this->plugin('category', ['category' => '.page-header{position:sticky}'], 'hyperion-product-grid');

        self::assertSame(
            self::HEAD . '<link rel="expect" href="#hyperion-product-grid" blocking="render">' . "\n",
            $plugin->afterRenderHeadContent($this->renderer(), self::HEAD)
        );
    }

    public function testAMarkerThatIsNotAnIdFallsBackToTheFooter(): void
    {
        $plugin = $this->plugin('category', ['category' => '.page-header{position:sticky}'], '#grid"><script>');

        self::assertSame(self::HEAD . self::MARKER, $plugin->afterRenderHeadContent($this->renderer(), self::HEAD));
    }

    public function testAPageWithoutATypeIsLeftAlone(): void
    {
        $plugin = $this->plugin('', ['category' => '.page-header{position:sticky}']);

        self::assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->renderer(), self::HEAD));
    }

    public function testATypeWithoutASheetIsLeftAlone(): void
    {
        $plugin = $this->plugin('cart', ['category' => '.page-header{position:sticky}']);

        self::assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->renderer(), self::HEAD));
    }

    public function testAPageWithoutTheHeadScriptsBlockIsLeftAlone(): void
    {
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturn(false);
        $plugin = new RenderBlockingMarkerPlugin(
            $layout,
            $this->createStub(AssetManifest::class),
            $this->createStub(LoggerInterface::class)
        );

        self::assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->renderer(), self::HEAD));
    }

    public function testAFailureIsLoggedAndTheHeadIsLeftAlone(): void
    {
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willThrowException(new \RuntimeException('layout gone'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('layout gone'));
        $plugin = new RenderBlockingMarkerPlugin($layout, $this->createStub(AssetManifest::class), $logger);

        self::assertSame(self::HEAD, $plugin->afterRenderHeadContent($this->renderer(), self::HEAD));
    }

    /**
     * @param array<string, string> $sheets critical CSS content per type
     */
    private function plugin(string $type, array $sheets, ?string $marker = null): RenderBlockingMarkerPlugin
    {
        $block = $this->createStub(AbstractBlock::class);
        $block->method('getData')->willReturnCallback(
            static fn (string $key = ''): ?string => match ($key) {
                'critical_css_type' => $type,
                'critical_css_marker' => $marker,
                default => null,
            }
        );
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturn($block);
        $manifest = $this->createStub(AssetManifest::class);
        $manifest->method('getCriticalCss')->willReturnCallback(
            static fn (string $requested = ''): string => $sheets[$requested] ?? ''
        );

        return new RenderBlockingMarkerPlugin($layout, $manifest, $this->createStub(LoggerInterface::class));
    }

    private function renderer(): Renderer
    {
        return $this->createStub(Renderer::class);
    }
}

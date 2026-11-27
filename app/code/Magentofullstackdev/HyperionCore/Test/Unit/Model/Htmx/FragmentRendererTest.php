<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Htmx;

use Magento\Framework\App\ViewInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The fragment renderer: one block of a fragment handle loaded without
 * `default`, the block data added before the render, and an empty string
 * (logged) when the block is missing or the render fails.
 */
class FragmentRendererTest extends TestCase
{
    /**
     * The dependency on App\View is what keeps the fragment's layout builder
     * the last one bound: the object manager creates App\View (and the page
     * it binds) before the renderer, hence before any fragment page.
     */
    public function testTheConstructorTakesTheApplicationView(): void
    {
        $types = array_map(
            static fn (\ReflectionParameter $parameter): string => (string) $parameter->getType(),
            (new \ReflectionMethod(FragmentRenderer::class, '__construct'))->getParameters()
        );

        self::assertContains(ViewInterface::class, $types);
    }

    public function testTheBlockOfTheFragmentHandleIsRenderedWithTheGivenData(): void
    {
        $block = $this->createMock(AbstractBlock::class);
        $block->expects(self::once())->method('addData')->with(['oob' => true])->willReturnSelf();
        $block->expects(self::once())->method('toHtml')->willReturn('<a id="hyperion-mini-cart-count"></a>');

        $renderer = new FragmentRenderer(
            $this->pageFactory('hyperion_minicart_count', 'hyperion.minicart.count', $block),
            $this->createStub(LoggerInterface::class),
            $this->createStub(ViewInterface::class)
        );

        self::assertSame(
            '<a id="hyperion-mini-cart-count"></a>',
            $renderer->render('hyperion_minicart_count', 'hyperion.minicart.count', ['oob' => true])
        );
    }

    public function testAMissingBlockIsLoggedAndRendersNothing(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(self::stringContains('"hyperion.missing"'));

        $renderer = new FragmentRenderer(
            $this->pageFactory('hyperion_minicart_count', 'hyperion.missing', false),
            $logger,
            $this->createStub(ViewInterface::class)
        );

        self::assertSame('', $renderer->render('hyperion_minicart_count', 'hyperion.missing'));
    }

    public function testARenderFailureIsLoggedAndRendersNothing(): void
    {
        $block = $this->createStub(AbstractBlock::class);
        $block->method('toHtml')->willThrowException(new \RuntimeException('template missing'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('template missing'));

        $renderer = new FragmentRenderer(
            $this->pageFactory('hyperion_minicart_count', 'hyperion.minicart.count', $block),
            $logger,
            $this->createStub(ViewInterface::class)
        );

        self::assertSame('', $renderer->render('hyperion_minicart_count', 'hyperion.minicart.count'));
    }

    /**
     * A page factory that answers one page holding only the given handle.
     *
     * @param string $handle
     * @param string $blockName
     * @param AbstractBlock|false $block what the layout answers for the block name
     */
    private function pageFactory(string $handle, string $blockName, AbstractBlock|false $block): PageFactory
    {
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturnMap([[$blockName, $block]]);

        $page = $this->createMock(Page::class);
        $page->expects(self::once())->method('addHandle')->with($handle)->willReturnSelf();
        $page->expects(self::once())->method('initLayout')->willReturnSelf();
        $page->method('getLayout')->willReturn($layout);

        $factory = $this->createMock(PageFactory::class);
        $factory->expects(self::once())
            ->method('create')
            ->with(false, ['load_default' => false])
            ->willReturn($page);

        return $factory;
    }
}

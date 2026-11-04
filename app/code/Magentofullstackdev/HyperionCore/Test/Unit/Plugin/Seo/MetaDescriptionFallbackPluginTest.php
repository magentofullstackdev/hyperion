<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Seo;

use Magento\Catalog\Helper\Data as CatalogHelper;
use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\Product;
use Magento\Cms\Block\Page as CmsPageBlock;
use Magento\Cms\Model\Page as CmsPage;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Page\Config as PageConfig;
use Magento\Framework\View\Page\Config\Renderer;
use Magentofullstackdev\HyperionCore\Model\Seo\MetaDescription;
use Magentofullstackdev\HyperionCore\Plugin\Seo\MetaDescriptionFallbackPlugin;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class MetaDescriptionFallbackPluginTest extends TestCase
{
    /** @var PageConfig&MockObject */
    private PageConfig $pageConfig;
    /** @var CatalogHelper&MockObject */
    private CatalogHelper $catalogHelper;
    private bool $enabled = true;
    private string $current = '';
    private string $action = '';
    private ?LayoutInterface $layout = null;

    /** Sets the page type (and the layout) the next `subject()` sees; returns the renderer argument. */
    private function observer(string $action, ?LayoutInterface $layout = null): Renderer
    {
        $this->action = $action;
        $this->layout = $layout;

        return $this->createStub(Renderer::class);
    }

    private function subject(): MetaDescriptionFallbackPlugin
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(fn (): bool => $this->enabled);
        $this->pageConfig = $this->createMock(PageConfig::class);
        $this->pageConfig->method('getDescription')->willReturnCallback(fn (): string => $this->current);
        $this->catalogHelper = $this->createMock(CatalogHelper::class);
        $request = $this->createStub(HttpRequest::class);
        $request->method('getFullActionName')->willReturnCallback(fn (): string => $this->action);

        return new MetaDescriptionFallbackPlugin(
            $scopeConfig,
            $request,
            $this->pageConfig,
            $this->layout ?? $this->createStub(LayoutInterface::class),
            $this->catalogHelper,
            new MetaDescription(),
            $this->createStub(LoggerInterface::class)
        );
    }

    public function testACategoryWithoutMetaDescriptionGetsOneFromItsDescription(): void
    {
        $subject = $this->subject();
        $category = $this->createStub(Category::class);
        $category->method('getData')->willReturnMap([['description', null, '<p>Tops &amp; tanks for <b>women</b></p>']]);
        $this->catalogHelper->expects(self::once())->method('getCategory')->willReturn($category);
        $this->catalogHelper->expects(self::never())->method('getProduct');
        $this->pageConfig->expects(self::once())->method('setDescription')->with('Tops & tanks for women');

        $subject->beforeRenderHeadContent($this->observer('catalog_category_view'));
    }

    public function testAProductPrefersItsShortDescription(): void
    {
        $subject = $this->subject();
        $product = $this->createStub(Product::class);
        $product->method('getData')->willReturnMap([
            ['short_description', null, '<p>Light hoodie.</p>'],
            ['description', null, '<p>The long story.</p>'],
        ]);
        $this->catalogHelper->expects(self::once())->method('getProduct')->willReturn($product);
        $this->catalogHelper->expects(self::never())->method('getCategory');
        $this->pageConfig->expects(self::once())->method('setDescription')->with('Light hoodie.');

        $subject->beforeRenderHeadContent($this->observer('catalog_product_view'));
    }

    public function testAProductWithAnEmptyShortDescriptionFallsBackToTheDescription(): void
    {
        $subject = $this->subject();
        $product = $this->createStub(Product::class);
        $product->method('getData')->willReturnMap([
            ['short_description', null, '<p> </p>'],
            ['description', null, 'The long story.'],
        ]);
        $this->catalogHelper->expects(self::once())->method('getProduct')->willReturn($product);
        $this->pageConfig->expects(self::once())->method('setDescription')->with('The long story.');

        $subject->beforeRenderHeadContent($this->observer('catalog_product_view'));
    }

    public function testACmsPageUsesItsContentThroughTheLayoutBlock(): void
    {
        $page = $this->createStub(CmsPage::class);
        $page->method('getContent')->willReturn('<h1>Home</h1>{{widget type="X"}}<p>Welcome to the store.</p>');
        $block = $this->createStub(CmsPageBlock::class);
        $block->method('getPage')->willReturn($page);
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturnMap([['cms_page', $block]]);
        $this->layout = $layout;
        $subject = $this->subject();
        $this->catalogHelper->expects(self::never())->method('getCategory');
        $this->catalogHelper->expects(self::never())->method('getProduct');
        $this->pageConfig->expects(self::once())->method('setDescription')->with('Home Welcome to the store.');

        $subject->beforeRenderHeadContent($this->observer('cms_index_index', $layout));
    }

    public function testAnExistingDescriptionOrADisabledOptionLeavesThePageAlone(): void
    {
        $subject = $this->subject();
        $this->current = 'Typed in the admin';
        $this->catalogHelper->expects(self::never())->method('getCategory');
        $this->pageConfig->expects(self::never())->method('setDescription');
        $subject->beforeRenderHeadContent($this->observer('catalog_category_view'));

        $subject = $this->subject();
        $this->current = '';
        $this->enabled = false;
        $this->catalogHelper->expects(self::never())->method('getCategory');
        $this->pageConfig->expects(self::never())->method('setDescription');
        $subject->beforeRenderHeadContent($this->observer('catalog_category_view'));
    }

    public function testOtherPagesAndEmptyTextsSetNothing(): void
    {
        $subject = $this->subject();
        $this->catalogHelper->expects(self::never())->method('getCategory');
        $this->pageConfig->expects(self::never())->method('setDescription');
        $subject->beforeRenderHeadContent($this->observer('checkout_cart_index'));

        $subject = $this->subject();
        $this->catalogHelper->expects(self::once())->method('getCategory')->willReturn(null);
        $this->pageConfig->expects(self::never())->method('setDescription');
        $subject->beforeRenderHeadContent($this->observer('catalog_category_view'));
    }
}

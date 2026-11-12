<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Controller\Review\Product;

use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Attribute\Source\Status;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\Registry;
use Magento\Framework\View\Element\BlockInterface;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCore\Controller\Review\Product\ListAjax;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ListAjaxTest extends TestCase
{
    /** @var RequestInterface&Stub */
    private RequestInterface $request;

    /** @var ProductRepositoryInterface&Stub */
    private ProductRepositoryInterface $repository;

    /** @var Raw&MockObject */
    private Raw $raw;

    protected function setUp(): void
    {
        $this->request = $this->createStub(RequestInterface::class);
        $this->repository = $this->createStub(ProductRepositoryInterface::class);
        $this->raw = $this->createMock(Raw::class);
        $this->raw->method('setHeader')->willReturnSelf();
        $this->raw->method('setContents')->willReturnSelf();
        $this->raw->method('setHttpResponseCode')->willReturnSelf();
    }

    /**
     * The repository and the page factory are stubs unless the test hands in
     * a mock whose calls it verifies.
     */
    private function controller(?ProductRepositoryInterface $repository = null, ?PageFactory $pageFactory = null): ListAjax
    {
        $store = $this->createStub(StoreInterface::class);
        $store->method('getId')->willReturn(1);
        $store->method('getWebsiteId')->willReturn(1);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($this->raw);

        return new ListAjax(
            $this->request,
            $repository ?? $this->repository,
            $storeManager,
            new Registry(),
            $pageFactory ?? $this->createStub(PageFactory::class),
            $rawFactory,
            $this->createStub(LoggerInterface::class)
        );
    }

    /**
     * @param int[] $websiteIds
     * @return Product&Stub
     */
    private function product(array $websiteIds, int $status, bool $inCatalog, bool $siteVisible): Product
    {
        $product = $this->createStub(Product::class);
        $product->method('getWebsiteIds')->willReturn($websiteIds);
        $product->method('getStatus')->willReturn($status);
        $product->method('isVisibleInCatalog')->willReturn($inCatalog);
        $product->method('isVisibleInSiteVisibility')->willReturn($siteVisible);
        return $product;
    }

    public function testRendersTheListForAVisibleProductOfTheCurrentStore(): void
    {
        $this->request->method('getParam')->willReturn('42');
        $product = $this->product([1, 2], Status::STATUS_ENABLED, true, true);
        $repository = $this->createMock(ProductRepositoryInterface::class);
        $repository->expects(self::once())->method('getById')->with(42, false, 1)->willReturn($product);
        $block = $this->createStub(BlockInterface::class);
        $block->method('toHtml')->willReturn('<section id="customer-review-list"></section>');
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturn($block);
        $page = $this->createMock(Page::class);
        $page->method('getLayout')->willReturn($layout);
        $page->expects(self::once())->method('addHandle')->with('hyperion_review_product_listajax');
        $pageFactory = $this->createStub(PageFactory::class);
        $pageFactory->method('create')->willReturn($page);
        $this->raw->expects(self::never())->method('setHttpResponseCode');
        $this->raw->expects(self::once())->method('setContents')->with('<section id="customer-review-list"></section>');

        self::assertSame($this->raw, $this->controller($repository, $pageFactory)->execute());
    }

    /**
     * @return array<string, array{int[], int, bool, bool}>
     */
    public static function hiddenProductProvider(): array
    {
        return [
            'other website' => [[2], Status::STATUS_ENABLED, true, true],
            'disabled' => [[1], Status::STATUS_DISABLED, true, true],
            'not visible individually' => [[1], Status::STATUS_ENABLED, false, true],
            'hidden by site visibility' => [[1], Status::STATUS_ENABLED, true, false],
        ];
    }

    /**
     * @param int[] $websiteIds
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('hiddenProductProvider')]
    public function testAnswers404ForAProductTheStorefrontMayNotShow(
        array $websiteIds,
        int $status,
        bool $inCatalog,
        bool $siteVisible
    ): void {
        $this->request->method('getParam')->willReturn('42');
        $this->repository->method('getById')->willReturn($this->product($websiteIds, $status, $inCatalog, $siteVisible));
        $pageFactory = $this->createMock(PageFactory::class);
        $pageFactory->expects(self::never())->method('create');
        $this->raw->expects(self::once())->method('setHttpResponseCode')->with(404);
        $this->raw->expects(self::once())->method('setContents')->with('');

        self::assertSame($this->raw, $this->controller(null, $pageFactory)->execute());
    }

    public function testAnswers404ForAnUnknownProduct(): void
    {
        $this->request->method('getParam')->willReturn('99');
        $this->repository->method('getById')->willThrowException(new NoSuchEntityException(__('missing')));
        $this->raw->expects(self::once())->method('setHttpResponseCode')->with(404);

        $this->controller()->execute();
    }

    public function testAnswers404WithoutAProductId(): void
    {
        $this->request->method('getParam')->willReturn(null);
        $repository = $this->createMock(ProductRepositoryInterface::class);
        $repository->expects(self::never())->method('getById');
        $this->raw->expects(self::once())->method('setHttpResponseCode')->with(404);

        $this->controller($repository)->execute();
    }
}

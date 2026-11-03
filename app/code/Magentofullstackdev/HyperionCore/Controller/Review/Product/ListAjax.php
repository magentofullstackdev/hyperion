<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Controller\Review\Product;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Attribute\Source\Status;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\Registry;
use Magento\Framework\View\Result\PageFactory;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * HTMX fragment endpoint: render the review list for a product at a given page.
 *
 *   GET /hyperion/review/product/listajax?product_id=123&p=2
 *
 * Returns only the <section id="customer-review-list"> fragment so HTMX can swap
 * it in-place without a full page reload. The product is admitted with the
 * same predicate as core's Magento\Review\Controller\Product::loadProduct():
 * loaded in the current store, assigned to the current website, enabled and
 * visible; anything else answers 404 with an empty body.
 */
class ListAjax implements HttpGetActionInterface
{
    public function __construct(
        private readonly RequestInterface $request,
        private readonly ProductRepositoryInterface $productRepository,
        private readonly StoreManagerInterface $storeManager,
        private readonly Registry $registry,
        private readonly PageFactory $pageFactory,
        private readonly RawFactory $rawFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(): Raw
    {
        $raw = $this->rawFactory->create();
        $raw->setHeader('Content-Type', 'text/html; charset=UTF-8');
        $raw->setHeader('Cache-Control', 'private, no-store', true);

        $productId = (int) $this->request->getParam('product_id');
        $product = $productId > 0 ? $this->loadVisibleProduct($productId) : null;
        if ($product === null) {
            $raw->setHttpResponseCode(404);
            $raw->setContents('');
            return $raw;
        }

        if (!$this->registry->registry('current_product')) {
            $this->registry->register('current_product', $product);
        }
        if (!$this->registry->registry('product')) {
            $this->registry->register('product', $product);
        }

        $page = $this->pageFactory->create();
        $page->addHandle('hyperion_review_product_listajax');

        $block = $page->getLayout()->getBlock('review_list');
        $raw->setContents($block ? $block->toHtml() : '');

        return $raw;
    }

    /**
     * The product when the current storefront may show it, null otherwise.
     *
     * @param int $productId
     * @return ProductInterface|null
     */
    private function loadVisibleProduct(int $productId): ?ProductInterface
    {
        try {
            $store = $this->storeManager->getStore();
            $product = $this->productRepository->getById($productId, false, (int) $store->getId());
        } catch (NoSuchEntityException $e) {
            $this->logger->warning(
                'ListAjax::execute product not found for id ' . $productId,
                ['exception' => $e]
            );
            return null;
        }
        if (!$product instanceof Product) {
            return null;
        }

        $websiteIds = array_map('intval', (array) $product->getWebsiteIds());
        if (!in_array((int) $store->getWebsiteId(), $websiteIds, true)
            || (int) $product->getStatus() !== Status::STATUS_ENABLED
            || !$product->isVisibleInCatalog()
            || !$product->isVisibleInSiteVisibility()
        ) {
            return null;
        }

        return $product;
    }
}

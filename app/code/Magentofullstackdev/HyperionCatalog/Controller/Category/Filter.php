<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Controller\Category;

use Magentofullstackdev\HyperionCatalog\Model\Listing\FragmentResponse;
use Magento\Catalog\Api\CategoryRepositoryInterface;
use Magento\Catalog\Helper\Category as CategoryHelper;
use Magento\Catalog\Model\Category;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Registry;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Result\PageFactory;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

class Filter implements HttpGetActionInterface
{

    /**
     * @param PageFactory $pageFactory
     * @param RawFactory $rawFactory
     * @param CategoryRepositoryInterface $categoryRepository
     * @param Registry $registry
     * @param RequestInterface $request
     * @param LoggerInterface $logger
     * @param FragmentResponse $fragmentResponse
     * @param StoreManagerInterface $storeManager
     * @param CategoryHelper $categoryHelper
     */
    public function __construct(
        private readonly PageFactory $pageFactory,
        private readonly RawFactory $rawFactory,
        private readonly CategoryRepositoryInterface $categoryRepository,
        private readonly Registry $registry,
        private readonly RequestInterface $request,
        private readonly LoggerInterface $logger,
        private readonly FragmentResponse $fragmentResponse,
        private readonly StoreManagerInterface $storeManager,
        private readonly CategoryHelper $categoryHelper
    ) {
    }

    /**
     * @return Raw
     */
    public function execute(): Raw
    {
        try {
            $id = (int) $this->request->getParam('id');
            if ($id < 1) {
                $this->logger->warning('Hyperion Filter: missing or invalid category id');
                return $this->rawFactory->create()->setHttpResponseCode(404)->setContents('');
            }

            try {
                $category = $this->categoryRepository->get($id, (int) $this->storeManager->getStore()->getId());
            } catch (\Throwable $e) {
                $this->logger->warning('Hyperion Filter: category not found id=' . $id);
                return $this->rawFactory->create()->setHttpResponseCode(404)->setContents('');
            }

            // Same rule as core's category page: active and inside the root
            // category of the current store, otherwise it does not exist.
            if (!$category instanceof Category || !$this->categoryHelper->canShow($category)) {
                return $this->rawFactory->create()->setHttpResponseCode(404)->setContents('');
            }

            $this->registry->unregister('current_category');
            $this->registry->register('current_category', $category);

            $page = $this->pageFactory->create(false, ['load_default' => false]);
            $page->addHandle('hyperion_catalog_category_filter');
            $page->initLayout();

            $layout = $page->getLayout();
            $block = $layout->getBlock('category.products.list')
                ?: $layout->getBlock('product_list');

            if (!$block instanceof AbstractBlock) {
                $this->logger->warning('Hyperion Filter: product list block not found in layout');
                return $this->rawFactory->create()->setHttpResponseCode(200)->setContents('');
            }

            return $this->fragmentResponse->build($layout, $block, 'catalog.leftnav', 'category-filter', ['cat_c_' . $category->getId()]);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Filter: unexpected failure -- ' . $e->getMessage());
            return $this->rawFactory->create()->setHttpResponseCode(500)->setContents('');
        }
    }
}

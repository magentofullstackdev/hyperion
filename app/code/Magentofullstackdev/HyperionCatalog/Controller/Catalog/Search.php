<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Controller\Catalog;

use Magento\Catalog\Model\Layer\Resolver as LayerResolver;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Result\PageFactory;
use Magento\Search\Model\Query;
use Magento\Search\Model\QueryFactory;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCatalog\Model\Listing\FragmentResponse;
use Psr\Log\LoggerInterface;

/**
 * `/hyperion/catalog/search?q=...`: the search results grid as an HTMX
 * fragment, the search counterpart of the category filter
 * endpoint: sort, page size, mode, page and filter changes on the search
 * results page swap the grid, and the infinite loading appends the next page.
 * The query's popularity and result count are the full page's business,
 * never written here.
 */
class Search implements HttpGetActionInterface
{
    public function __construct(
        private readonly PageFactory $pageFactory,
        private readonly RawFactory $rawFactory,
        private readonly LayerResolver $layerResolver,
        private readonly QueryFactory $queryFactory,
        private readonly StoreManagerInterface $storeManager,
        private readonly FragmentResponse $fragmentResponse,
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(): Raw
    {
        try {
            $this->layerResolver->create(LayerResolver::CATALOG_LAYER_SEARCH);
            $query = $this->queryFactory->get();
            if ($query instanceof Query) {
                $query->setStoreId((int) $this->storeManager->getStore()->getId());
            }
            if (trim((string) $query->getQueryText()) === '') {
                return $this->rawFactory->create()->setHttpResponseCode(404)->setContents('');
            }
            $page = $this->pageFactory->create(false, ['load_default' => false]);
            $page->addHandle('hyperion_catalog_search');
            $page->initLayout();
            $layout = $page->getLayout();
            $block = $layout->getBlock('search_result_list');
            if (!$block instanceof AbstractBlock) {
                $this->logger->warning('Hyperion Search fragment: search_result_list block not found in layout');

                return $this->rawFactory->create()->setHttpResponseCode(200)->setContents('');
            }

            return $this->fragmentResponse->build($layout, $block, 'hyperion.search.layered.nav', 'search-result');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Search fragment: unexpected failure -- ' . $e->getMessage());

            return $this->degraded('search-result');
        }
    }

    /**
     * The listing could not be rendered (in practice: the search engine did
     * not answer): the shopper gets the "try again" message in place of the
     * grid, and no cache keeps it. An empty 500 only as the last resort.
     */
    private function degraded(string $fragmentName): Raw
    {
        try {
            return $this->fragmentResponse->buildDegraded($fragmentName);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion listing fragment: degraded answer failed -- ' . $e->getMessage());

            return $this->rawFactory->create()->setHttpResponseCode(500)->setContents('');
        }
    }
}

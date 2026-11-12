<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Block\Product;

use Magento\Catalog\Api\CategoryRepositoryInterface;
use Magento\Catalog\Block\Product\Context;
use Magento\Catalog\Helper\Output as OutputHelper;
use Magento\Catalog\Model\Layer\Resolver;
use Magento\Catalog\Model\ResourceModel\Product\Collection;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Data\Helper\PostHelper;
use Magento\Framework\Url\Helper\Data as UrlHelper;
use Magentofullstackdev\HyperionCatalog\Model\InfiniteScroll;
use Psr\Log\LoggerInterface;

class ListProduct extends \Magento\Catalog\Block\Product\ListProduct
{
    /**
     * @param Context $context
     * @param PostHelper $postDataHelper
     * @param Resolver $layerResolver
     * @param CategoryRepositoryInterface $categoryRepository
     * @param UrlHelper $urlHelper
     * @param LoggerInterface $logger
     * @param HttpContext $httpContext
     * @param InfiniteScroll $infiniteScroll
     * @param array $data
     * @param OutputHelper|null $outputHelper
     */
    public function __construct(
        Context $context,
        PostHelper $postDataHelper,
        Resolver $layerResolver,
        CategoryRepositoryInterface $categoryRepository,
        UrlHelper $urlHelper,
        private readonly LoggerInterface $logger,
        private readonly HttpContext $httpContext,
        private readonly InfiniteScroll $infiniteScroll,
        array $data = [],
        ?OutputHelper $outputHelper = null
    ) {
        parent::__construct(
            $context,
            $postDataHelper,
            $layerResolver,
            $categoryRepository,
            $urlHelper,
            $data,
            $outputHelper
        );
    }

    /**
     * The list layout shows a description excerpt; `description` is not a
     * listing attribute, so it is added to the select before the
     * collection loads (core loads it in `_beforeToHtml`).
     *
     * A load that throws (the search engine does not answer) is turned into
     * the `has_error` flag here as well, for the core versions whose block
     * does not catch it: the grid template then prints "try again" and the
     * request is not stored, instead of the whole page failing.
     *
     * @return $this
     */
    protected function _beforeToHtml()
    {
        try {
            if ($this->getMode() === 'list') {
                $collection = $this->_getProductCollection();
                if ($collection instanceof Collection && !$collection->isLoaded()) {
                    $collection->addAttributeToSelect(['description', 'short_description']);
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ListProduct: list mode attributes -- ' . $e->getMessage());
        }

        try {
            return parent::_beforeToHtml();
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ListProduct: listing load failed -- ' . $e->getMessage());
            $this->setData('has_error', true);

            return $this;
        }
    }

    /**
     * The loaded collection of the listing. A load that fails here sets the
     * same `has_error` flag core's block sets when the search engine does not
     * answer, which the grid template prints as "try again" instead of as an
     * empty listing.
     *
     * @return Collection
     */
    public function getProductCollection(): Collection
    {
        try {
            $collection = $this->getLoadedProductCollection();
            if ($collection instanceof Collection) {
                return $collection;
            }
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: unexpected collection type ' . $collection::class
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: collection load failed -- ' . $e->getMessage()
            );
            $this->setData('has_error', true);
        }

        return $this->getLayer()->getProductCollection()->setPageSize(0);
    }

    /**
     * @return string
     */
    public function getPaginationHtml(): string
    {
        try {
            return $this->getChildHtml('product_list_toolbar_pager');
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: pagination render failed -- ' . $e->getMessage()
            );
            return '';
        }
    }

    /**
     * @return string
     */
    public function getFilterHtml(): string
    {
        try {
            return $this->getChildHtml('catalog.leftnav');
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: filter render failed -- ' . $e->getMessage()
            );
            return '';
        }
    }

    /**
     * @return string
     */
    public function getFragmentUrl(): string
    {
        try {
            // Emit the category id as a QUERY-STRING param (via _query) rather
            // than a path segment so filter/sort/pagination templates can
            // safely append `&foo=bar` without producing malformed URLs like
            // `/hyperion/category/filter/id/58/&cat=64`. The Filter controller
            // reads `id` via $request->getParam('id'), which handles both
            // path and query-string equivalently.
            return $this->_urlBuilder->getUrl(
                'hyperion/category/filter',
                ['_query' => ['id' => (int) $this->getLayer()->getCurrentCategory()->getId()]]
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: fragment URL build failed -- ' . $e->getMessage()
            );
            return '';
        }
    }

    /**
     * @return string
     */
    public function getGridTargetId(): string
    {
        return 'hyperion-product-grid';
    }


    /**
     * Block cache varies by: parent info + category id + page/limit/sort/dir
     * (validated by the filter guard before the action runs, so no junk
     * value reaches the key) + every active filter of the layer state (the
     * toolbar, pager and Load more URLs inside the grid carry them) + the
     * HTTP context vary string (currency,
     * customer group, logged-in state: the same set the full page cache
     * varies on, so prices rendered for one currency or customer group never
     * reach another). Without these fields the Magento block cache pins the
     * first-rendered grid's HTML and serves it to everyone thereafter.
     *
     * @return array
     */
    public function getCacheKeyInfo(): array
    {
        $context = [];

        try {
            $categoryId = (int) $this->getLayer()->getCurrentCategory()->getId();
            $context[] = 'category=' . $categoryId;
            // The infinite loading mode changes the grid's foot.
            $context[] = 'infinite=' . $this->infiniteScroll->resolve($this->getLayer()->getCurrentCategory());
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: cache-key category resolution failed -- ' . $e->getMessage()
            );
        }

        try {
            $request = $this->getRequest();
            $context[] = 'p='     . (int) $request->getParam('p', 1);
            $context[] = 'limit=' . (string) $request->getParam('product_list_limit', '');
            $context[] = 'order=' . (string) $request->getParam('product_list_order', '');
            $context[] = 'dir='   . (string) $request->getParam('product_list_dir', '');
            $context[] = 'mode='  . (string) $request->getParam('product_list_mode', '');
            $context[] = 'append=' . (string) $request->getParam('append', '');
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: cache-key toolbar params failed -- ' . $e->getMessage()
            );
        }

        try {
            $state = $this->getLayer()->getState();
            foreach ($state->getFilters() as $filter) {
                $requestVar = (string) $filter->getFilter()->getRequestVar();
                $entry = $requestVar . '=' . $filter->getValueString();
                // A range filter keeps the parsed pair; the URLs inside the
                // grid carry the request's own form of it (ViewModel\Listing).
                if (is_array($filter->getData('value'))) {
                    $requested = $this->getRequest()->getParam($requestVar);
                    $entry .= '|' . (is_scalar($requested) ? (string) $requested : hash('xxh3', (string) json_encode($requested)));
                }
                $context[] = $entry;
            }
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ListProduct: cache-key filter enumeration failed -- ' . $e->getMessage()
            );
        }

        return array_merge(
            parent::getCacheKeyInfo(),
            $context,
            ['vary=' . (string) $this->httpContext->getVaryString(), 'hyperion_plp_v1']
        );
    }
}

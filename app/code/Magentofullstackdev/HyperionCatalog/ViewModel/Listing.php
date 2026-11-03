<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Model\Layer;
use Magento\Catalog\Model\Layer\Search as SearchLayer;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Framework\View\LayoutInterface;
use Magentofullstackdev\HyperionCatalog\Model\InfiniteScroll;
use Magentofullstackdev\HyperionCatalog\Model\Listing\ListingUrl;
use Psr\Log\LoggerInterface;

/**
 * What the listing templates (grid, toolbar, pager, load more, layered
 * navigation) share about the listing they render: which list block it is
 * (category or search results), the grid fragment endpoint that swaps it, the
 * public page URL the browser must show, the grid target, the infinite
 * loading mode and whether the current request appends a page to
 * an existing grid.
 */
class Listing implements ArgumentInterface
{
    public const GRID_ID = 'hyperion-product-grid';
    public const APPEND_PARAM = 'append';
    public const LIST_BLOCKS = ['category.products.list', 'search_result_list'];

    public function __construct(
        private readonly RequestInterface $request,
        private readonly ListingUrl $listingUrl,
        private readonly InfiniteScroll $infiniteScroll,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The list block of the page (category listing or search results), null elsewhere.
     */
    public function getListBlock(LayoutInterface $layout): ?AbstractBlock
    {
        foreach (self::LIST_BLOCKS as $name) {
            $block = $layout->getBlock($name);
            if ($block instanceof AbstractBlock) {
                return $block;
            }
        }

        return null;
    }

    public function getGridTargetId(): string
    {
        return self::GRID_ID;
    }

    /**
     * The grid fragment endpoint of the list block, '' when it has none.
     */
    public function getFragmentUrl(?AbstractBlock $listBlock): string
    {
        $layer = $this->getLayer($listBlock);

        return $layer === null ? '' : $this->listingUrl->getFragmentUrl($layer);
    }

    /**
     * The public page URL of the listing carrying $query (toolbar state,
     * filters), '' when the list block has no layer.
     *
     * @param array<string, mixed> $query
     */
    public function getPublicUrl(?AbstractBlock $listBlock, array $query = []): string
    {
        $layer = $this->getLayer($listBlock);
        if ($layer === null) {
            return '';
        }
        $pageUrl = $this->listingUrl->getPageUrl($layer);

        return $pageUrl === '' ? '' : $this->listingUrl->withQuery($pageUrl, $query);
    }

    /**
     * A URL core built for the current request (filter item, remove, clear),
     * rewritten to the public page URL with the same query: inside a fragment
     * the current request is the fragment route. $url itself without a layer.
     */
    public function toPublicUrl(?AbstractBlock $listBlock, string $url): string
    {
        $layer = $this->getLayer($listBlock);

        return $layer === null ? $url : $this->listingUrl->toPublic($layer, $url);
    }

    /**
     * The fragment URL carrying the filters of a core built URL (page dropped), '' without a fragment endpoint.
     */
    public function toFragmentUrl(?AbstractBlock $listBlock, string $url): string
    {
        $layer = $this->getLayer($listBlock);

        return $layer === null ? '' : $this->listingUrl->toFragment($layer, $url);
    }

    /**
     * The infinite loading mode of the list block's listing.
     */
    public function getMode(?AbstractBlock $listBlock): string
    {
        $layer = $this->getLayer($listBlock);
        if ($layer === null) {
            return InfiniteScroll::MODE_DISABLED;
        }
        try {
            return $this->infiniteScroll->resolve($layer instanceof SearchLayer ? null : $layer->getCurrentCategory());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Listing: infinite scroll mode failed -- ' . $e->getMessage());

            return InfiniteScroll::MODE_DISABLED;
        }
    }

    public function isInfinite(?AbstractBlock $listBlock): bool
    {
        return $this->getMode($listBlock) !== InfiniteScroll::MODE_DISABLED;
    }

    /**
     * Whether the page may load the next one automatically (scroll mode within the cap).
     */
    public function isAutomaticLoad(?AbstractBlock $listBlock, int $currentPage): bool
    {
        return $this->infiniteScroll->isAutomaticLoadAllowed($this->getMode($listBlock), $currentPage);
    }

    /**
     * The request appends a page to a grid already on the page (tiles only, status out of band).
     */
    public function isAppend(): bool
    {
        return (string) $this->request->getParam(self::APPEND_PARAM, '') === '1';
    }

    public function getAppendParam(): string
    {
        return self::APPEND_PARAM;
    }

    /**
     * The sort direction the request carries, '' when it carries none (the
     * toolbar then shows its default and the hidden input is not rendered).
     */
    public function getRequestedDirection(): string
    {
        $dir = strtolower((string) $this->request->getParam('product_list_dir', ''));

        return in_array($dir, ['asc', 'desc'], true) ? $dir : '';
    }

    private function getLayer(?AbstractBlock $listBlock): ?Layer
    {
        if ($listBlock === null || !method_exists($listBlock, 'getLayer')) {
            return null;
        }
        try {
            $layer = $listBlock->getLayer();

            return $layer instanceof Layer ? $layer : null;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Listing: layer resolution failed -- ' . $e->getMessage());

            return null;
        }
    }
}

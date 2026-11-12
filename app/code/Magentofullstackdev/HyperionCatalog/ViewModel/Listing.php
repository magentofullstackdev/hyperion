<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Model\Layer;
use Magento\Catalog\Model\Layer\Filter\Item as FilterItem;
use Magento\Catalog\Model\Layer\Search as SearchLayer;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Framework\View\LayoutInterface;
use Magentofullstackdev\HyperionCatalog\Model\FilterGuard;
use Magentofullstackdev\HyperionCatalog\Model\InfiniteScroll;
use Magentofullstackdev\HyperionCatalog\Model\Listing\ListingUrl;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Psr\Log\LoggerInterface;

/**
 * What the listing templates (grid, toolbar, pager, load more, layered
 * navigation) share about the listing they render: which list block it is
 * (category or search results), the grid fragment endpoint that swaps it, the
 * public page URL the browser must show, the grid target, the infinite
 * loading mode and whether the current request appends a page to
 * an existing grid.
 *
 * The toolbar, the pager and Load more request the fragment URL of the
 * listing AS IT IS FILTERED NOW (`getStateFragmentUrl()`): the active filters
 * come from the layer state, the thing the grid was really filtered by, so
 * every control keeps them without reading the page URL.
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
        private readonly LoggerInterface $logger,
        private readonly FilterGuard $filterGuard,
        private readonly DegradedResponse $degradedResponse
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
     * The grid fragment URL of the listing as it is filtered now: the fragment
     * endpoint plus one query pair per active layered filter, plus $override.
     * '' when the list block has no fragment endpoint.
     *
     * The toolbar values (order, limit, mode, direction) are not part of it:
     * they travel through `hx-include`, and htmx appends included values to
     * the query, where a copy in the URL would fight the control's new value.
     *
     * @param array<string, scalar|null> $override toolbar or page parameters this control sets itself
     */
    public function getStateFragmentUrl(?AbstractBlock $listBlock, array $override = []): string
    {
        $layer = $this->getLayer($listBlock);
        if ($layer === null) {
            return '';
        }
        $fragmentUrl = $this->listingUrl->getFragmentUrl($layer);

        return $fragmentUrl === ''
            ? ''
            : $this->listingUrl->withQuery($fragmentUrl, $this->getActiveFilterQuery($layer) + $override);
    }

    /**
     * The fragment URL that appends page $page to the grid, filters included. '' without a fragment endpoint.
     */
    public function getAppendFragmentUrl(?AbstractBlock $listBlock, int $page): string
    {
        $url = $this->getStateFragmentUrl($listBlock, ['p' => $page]);

        // The append marker is an internal key the URL builder drops by design;
        // the fragment URL always carries a query (`id` or `q`).
        return $url === '' ? '' : $url . '&' . self::APPEND_PARAM . '=1';
    }

    /**
     * Whether the list block could not load its products (the search engine
     * did not answer). Telling it apart from an empty listing matters: the
     * template prints a "try again" message, and the request is marked as
     * degraded so neither the page, the fragment nor the block cache keeps an
     * empty grid for a listing that has products.
     */
    public function isLoadFailed(?AbstractBlock $listBlock): bool
    {
        if ($listBlock === null || !$listBlock->getData('has_error')) {
            return false;
        }
        $this->degradedResponse->mark();

        return true;
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

    /**
     * One query pair per active layered filter, read from the layer state.
     * The state can hold the same filter more than once (a fragment request
     * generates the layered navigation twice): a later item of a request
     * variable replaces the earlier one. A variable the filter guard would
     * not accept is left out, so a foreign state item never becomes a
     * parameter the guard strips on the next request.
     *
     * @return array<string, mixed>
     */
    private function getActiveFilterQuery(Layer $layer): array
    {
        $query = [];
        try {
            $filterable = $this->filterGuard->getFilterableCodes();
            foreach ($layer->getState()->getFilters() as $item) {
                try {
                    $requestVar = (string) $item->getFilter()->getRequestVar();
                    if ($requestVar === '' || !in_array($requestVar, $filterable, true)) {
                        continue;
                    }
                    $query[$requestVar] = $this->getFilterValue($requestVar, $item);
                } catch (\Throwable $e) {
                    $this->logger->error('Hyperion Listing: active filter skipped -- ' . $e->getMessage());
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Listing: active filters failed -- ' . $e->getMessage());
        }

        return $query;
    }

    /**
     * The value an active filter travels with. A state item normally holds
     * the request value as it came. A range filter (core's price filter)
     * holds the parsed pair instead, whose comma joined string is not what
     * the filter reads back (`10-20`, with prior intervals after a comma):
     * for an item whose value is an array, the value the request itself
     * carries for that variable is the accepted form.
     */
    private function getFilterValue(string $requestVar, FilterItem $item): mixed
    {
        if (is_array($item->getData('value'))) {
            $requested = $this->request->getParam($requestVar);
            if ((is_scalar($requested) && (string) $requested !== '') || (is_array($requested) && $requested !== [])) {
                return is_array($requested) ? $requested : (string) $requested;
            }
        }

        return (string) $item->getValueString();
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

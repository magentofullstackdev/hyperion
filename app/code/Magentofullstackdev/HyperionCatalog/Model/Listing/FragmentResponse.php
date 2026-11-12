<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model\Listing;

use Magento\Catalog\Block\Product\ListProduct;
use Magento\Catalog\Model\Layer;
use Magento\Catalog\Model\Layer\Resolver as LayerResolver;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Escaper;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\Listing;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Psr\Log\LoggerInterface;

/**
 * The grid fragment answer shared by the category filter and the search
 * results endpoints: the product grid HTML, the layered navigation block
 * (filter lists and active filter chips, rebuilt for the new state) out of
 * band, the public page URL as `HX-Push-Url`, the cache tags of the list
 * block and the public cache headers.
 *
 * A listing that could not load (the search engine did not answer) is a
 * degraded answer: it is shown once, never stored (`DegradedResponse`,
 * `CacheHeaders::applyPublic()`) and pushes no URL, so the browser stays on
 * the last state that rendered. `buildDegraded()` is the same answer for a
 * failure that left no grid to send at all.
 */
class FragmentResponse
{
    public const CACHE_TTL_SECONDS = 3600;
    public const MAX_PRODUCT_TAGS = 1000;
    private const PRODUCT_TAG_PREFIX = 'cat_p_';

    public function __construct(
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly LayerResolver $layerResolver,
        private readonly RequestInterface $request,
        private readonly ListingUrl $listingUrl,
        private readonly LoggerInterface $logger,
        private readonly DegradedResponse $degradedResponse,
        private readonly Escaper $escaper
    ) {
    }

    /**
     * @param string $navigationBlockName the layered navigation block of the page, re-rendered out of band
     * @param string[] $tags cache tags of the listing itself (the category), the products are added here
     */
    public function build(
        LayoutInterface $layout,
        AbstractBlock $listBlock,
        string $navigationBlockName,
        string $fragmentName,
        array $tags = []
    ): Raw {
        // Primary swap target: the product grid.
        $html = $listBlock->toHtml();

        // The lazy Layout::build() generates the layered navigation twice on a
        // fragment page (a fresh Page\Builder is not guarded against the
        // re-entrant createBlock() of Category\View::_prepareLayout()), so
        // every active filter sits twice in the layer state: keep one of each.
        try {
            $stateModel = $this->layerResolver->get()->getState();
            $unique = [];
            foreach ($stateModel->getFilters() as $item) {
                try {
                    $key = $item->getFilter()->getRequestVar() . '=' . $item->getValueString();
                } catch (\Throwable $e) {
                    $this->logger->warning('Hyperion fragment: layer state filter key failed, using object id', ['exception' => $e]);
                    $key = spl_object_id($item);
                }
                $unique[$key] = $item;
            }
            $stateModel->setFilters(array_values($unique));
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion fragment: layer state dedup failed -- ' . $e->getMessage());
        }

        // The layered navigation (filter lists with links for the NEW state,
        // active filter chips, Clear all) rides along out of band: a second
        // filter must add to the first, so the links on the page cannot stay
        // those of the first render. Its template always emits the wrapper
        // `#hyperion-layered-nav`, the swap target.
        // The filter counts come from the search engine: when it does not
        // answer, the grid goes out alone (the navigation on the page stays
        // as it is) and the answer is not stored.
        try {
            $navigationBlock = $layout->getBlock($navigationBlockName);
            if ($navigationBlock instanceof AbstractBlock) {
                $navigationHtml = (string) $navigationBlock->toHtml();
                if ($navigationHtml !== '') {
                    $navigationHtml = (string) preg_replace('/^(\s*<[a-zA-Z][^>]*)(>)/', '$1 hx-swap-oob="outerHTML"$2', $navigationHtml, 1);
                    $html .= "\n" . $navigationHtml;
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion fragment: layered navigation render failed -- ' . $e->getMessage());
            $this->degradedResponse->mark();
        }

        $response = $this->rawFactory->create();
        $response->setHttpResponseCode(200);
        $response->setContents($html);
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setHeader('Vary', 'Accept-Encoding', true);
        $response->setHeader('X-Magento-Tags', implode(',', $this->withProductTags($tags, $listBlock)), true);
        $response->setHeader('X-Hyperion-Fragment', $fragmentName, true);
        $response->setHeader('X-Magento-Cache-Debug', 'HYPERION-FRAGMENT', true);

        // The browser must show the PAGE URL (the category or the search
        // results page with the current toolbar and filter query), never the
        // fragment route the request went to: the header is what every control
        // pushes into the history (htmx gives it priority over hx-push-url).
        // An appended page (Load more) leaves the history alone, and so does
        // a degraded answer: the address bar must not name a state the
        // shopper never saw.
        $pushUrl = $this->degradedResponse->isDegraded() ? '' : $this->getPushUrl($listBlock);
        if ($pushUrl !== '') {
            $response->setHeader('HX-Push-Url', $pushUrl, true);
        }

        // applyPublic sets `Cache-Control: public, max-age=N, s-maxage=N` and the
        // marker that strips the session headers just before sending
        // (HyperionCore PublicRouteCacheHeadersPlugin).
        return $this->cacheHeaders->applyPublic($response, self::CACHE_TTL_SECONDS);
    }

    /**
     * The answer of a listing request that failed before a grid could be
     * rendered: the "try again" message in place of the grid (or as one more
     * tile row when the request appends a page), private, never stored, no
     * pushed URL. HTTP 200 so htmx swaps it where the shopper is looking.
     */
    public function buildDegraded(string $fragmentName): Raw
    {
        $this->degradedResponse->mark();
        $message = $this->escaper->escapeHtml((string) __("We can't load the products right now. Please try again in a moment."));
        if ((string) $this->request->getParam(Listing::APPEND_PARAM, '') === '1') {
            $html = '<li class="col-span-full py-6 text-center text-muted" role="alert" data-hyperion-listing-error>'
                . $message . '</li>';
        } else {
            $html = '<div id="' . Listing::GRID_ID . '" data-hyperion-product-grid aria-live="polite">'
                . '<div class="py-16 text-center" role="alert" data-hyperion-listing-error>'
                . '<p class="text-muted text-lg">' . $message . '</p></div></div>';
        }

        $response = $this->rawFactory->create();
        $response->setHttpResponseCode(200);
        $response->setContents($html);
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setHeader('X-Hyperion-Fragment', $fragmentName, true);

        return $this->cacheHeaders->applyPublic($response, self::CACHE_TTL_SECONDS);
    }

    private function getPushUrl(AbstractBlock $listBlock): string
    {
        try {
            if ((string) $this->request->getParam(Listing::APPEND_PARAM, '') === '1') {
                return '';
            }
            $layer = $listBlock instanceof ListProduct ? $listBlock->getLayer() : $this->layerResolver->get();
            if (!$layer instanceof Layer) {
                return '';
            }
            $pageUrl = $this->listingUrl->getPageUrl($layer);

            return $pageUrl === '' ? '' : $this->listingUrl->withQuery($pageUrl, (array) $this->request->getParams());
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion fragment: push URL failed -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * The cache tags of the answer: the list block's own identities (core's
     * list block declares `cat_c_p_<category>`, the tag cleaned when a product
     * enters, leaves or is re-enabled in the category, then every product on
     * the page) plus the caller's tags. At most MAX_PRODUCT_TAGS product tags
     * are kept, the other tags always. When the block cannot name its
     * identities the product tags are rebuilt from the loaded collection.
     *
     * @param string[] $tags
     * @return string[]
     */
    private function withProductTags(array $tags, AbstractBlock $listBlock): array
    {
        try {
            if ($listBlock instanceof IdentityInterface) {
                return $this->capProductTags(array_merge(array_map('strval', $listBlock->getIdentities()), $tags));
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion fragment: list block identities failed -- ' . $e->getMessage());
        }
        if (!$listBlock instanceof ListProduct) {
            $this->logger->warning('Hyperion fragment: product list block is ' . $listBlock::class . ', skipping product tags');

            return $tags;
        }
        try {
            foreach ($listBlock->getLoadedProductCollection() as $product) {
                $tags[] = self::PRODUCT_TAG_PREFIX . (int) $product->getId();
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion fragment: product tag enumeration failed -- ' . $e->getMessage());
        }

        return $this->capProductTags($tags);
    }

    /**
     * @param string[] $tags
     * @return string[] unique tags in their order, the product tags cut at MAX_PRODUCT_TAGS
     */
    private function capProductTags(array $tags): array
    {
        $kept = [];
        $products = 0;
        foreach (array_unique($tags) as $tag) {
            if (str_starts_with($tag, self::PRODUCT_TAG_PREFIX) && ++$products > self::MAX_PRODUCT_TAGS) {
                continue;
            }
            $kept[] = $tag;
        }

        return $kept;
    }
}

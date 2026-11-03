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
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\Listing;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Psr\Log\LoggerInterface;

/**
 * The grid fragment answer shared by the category filter and the search
 * results endpoints: the product grid HTML, the layered navigation block
 * (filter lists and active filter chips, rebuilt for the new state) out of
 * band, the public page URL as `HX-Push-Url`, the product cache tags and the
 * public cache headers.
 */
class FragmentResponse
{
    public const CACHE_TTL_SECONDS = 3600;

    public function __construct(
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly LayerResolver $layerResolver,
        private readonly RequestInterface $request,
        private readonly ListingUrl $listingUrl,
        private readonly LoggerInterface $logger
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
        $navigationBlock = $layout->getBlock($navigationBlockName);
        if ($navigationBlock instanceof AbstractBlock) {
            $navigationHtml = (string) $navigationBlock->toHtml();
            if ($navigationHtml !== '') {
                $navigationHtml = (string) preg_replace('/^(\s*<[a-zA-Z][^>]*)(>)/', '$1 hx-swap-oob="outerHTML"$2', $navigationHtml, 1);
                $html .= "\n" . $navigationHtml;
            }
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
        // An appended page (Load more) leaves the history alone.
        $pushUrl = $this->getPushUrl($listBlock);
        if ($pushUrl !== '') {
            $response->setHeader('HX-Push-Url', $pushUrl, true);
        }

        // applyPublic sets `Cache-Control: public, max-age=N, s-maxage=N` and the
        // marker that strips the session headers just before sending
        // (HyperionCore PublicRouteCacheHeadersPlugin).
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
     * @param string[] $tags
     * @return string[]
     */
    private function withProductTags(array $tags, AbstractBlock $listBlock): array
    {
        if (!$listBlock instanceof ListProduct) {
            $this->logger->warning('Hyperion fragment: product list block is ' . $listBlock::class . ', skipping product tags');

            return $tags;
        }
        try {
            $productIds = [];
            foreach ($listBlock->getLoadedProductCollection() as $product) {
                $productIds[] = (int) $product->getId();
            }
            foreach (array_slice(array_unique($productIds), 0, 1000) as $pid) {
                $tags[] = 'cat_p_' . $pid;
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion fragment: product tag enumeration failed -- ' . $e->getMessage());
        }

        return $tags;
    }
}

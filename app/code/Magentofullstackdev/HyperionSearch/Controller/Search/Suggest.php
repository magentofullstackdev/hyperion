<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Controller\Search;

use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Result\PageFactory;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionSearch\Model\Suggest\Cache as SuggestCache;
use Magentofullstackdev\HyperionSearch\ViewModel\Suggest as SuggestViewModel;
use Psr\Log\LoggerInterface;

/**
 * GET /hyperion/search/suggest?q=<query>
 *
 * The autocomplete fragment of the header search (popular terms, matching
 * categories, products), swapped into `#header-search-suggestions` by HTMX.
 * The response depends on the query and on the page cache context only
 * (store, currency, customer group through X-Magento-Vary), so it is public:
 * Varnish keeps it for an hour (the VCL hashes the vary cookie and sorts the
 * query string), the application cache keeps the rendered HTML for the same
 * hour, and X-Magento-Tags lets a product or category save purge both.
 *
 * An answer computed while the search engine did not respond (the request is
 * marked as degraded) is delivered once: it is not written to the
 * application cache and `CacheHeaders::applyPublic()` sends it private.
 */
class Suggest implements HttpGetActionInterface
{
    public const CACHE_TTL_SECONDS = SuggestCache::LIFETIME;
    private const BLOCK_NAME = 'hyperion.search.suggest';
    private const LAYOUT_HANDLE = 'hyperion_search_suggest';

    public function __construct(
        private readonly PageFactory $pageFactory,
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly SuggestCache $cache,
        private readonly SuggestViewModel $viewModel,
        private readonly HttpContext $httpContext,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger,
        private readonly DegradedResponse $degradedResponse
    ) {
    }

    public function execute(): Raw
    {
        $response = $this->rawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setHeader('X-Hyperion-Fragment', 'search-suggest', true);
        try {
            if (!$this->viewModel->isQueryLongEnough()) {
                // Nothing to suggest, nothing to compute: an empty fragment,
                // cacheable like the others.
                return $this->cacheHeaders->applyPublic($response->setContents(''), self::CACHE_TTL_SECONDS);
            }
            $key = $this->cache->key(
                (int) $this->storeManager->getStore()->getId(),
                (string) $this->httpContext->getVaryString(),
                $this->viewModel->getQuery()
            );
            $cached = $this->cache->load($key);
            if ($cached !== null) {
                $response->setHeader('X-Hyperion-Suggest-Cache', 'hit', true);
                return $this->deliver($response, $cached['html'], $cached['tags']);
            }

            $page = $this->pageFactory->create(false, ['load_default' => false]);
            $page->addHandle(self::LAYOUT_HANDLE);
            $page->initLayout();
            $block = $page->getLayout()->getBlock(self::BLOCK_NAME);
            $html = $block ? (string) $block->toHtml() : '';
            $tags = $this->viewModel->getCacheTags();
            if (!$this->degradedResponse->isDegraded()) {
                $this->cache->save($key, $html, $tags);
            }

            return $this->deliver($response, $html, $tags);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search suggest: ' . $e->getMessage());
            $response->setHeader('Cache-Control', 'private, no-store', true);
            return $response->setHttpResponseCode(200)->setContents('');
        }
    }

    /**
     * @param string[] $tags
     */
    private function deliver(Raw $response, string $html, array $tags): Raw
    {
        $response->setHttpResponseCode(200)->setContents($html);
        $response->setHeader('X-Magento-Tags', implode(',', array_merge([SuggestCache::TAG], $tags)), true);

        return $this->cacheHeaders->applyPublic($response, self::CACHE_TTL_SECONDS);
    }
}

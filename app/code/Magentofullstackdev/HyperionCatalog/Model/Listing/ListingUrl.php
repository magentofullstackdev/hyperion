<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model\Listing;

use Magento\Catalog\Model\Layer;
use Magento\Catalog\Model\Layer\Search as SearchLayer;
use Magento\Framework\UrlInterface;
use Magento\Search\Model\QueryFactory;
use Psr\Log\LoggerInterface;

/**
 * The two URLs of a listing (a category page or the search results page):
 * the PUBLIC page URL the browser shows and the grid FRAGMENT endpoint the
 * toolbar, pager and filters request through htmx.
 *
 * Core builds filter, remove and clear URLs with `_current`, so on a fragment
 * request they point at the fragment route (`/hyperion/category/filter/?id=...`).
 * `toPublic()` rewrites such a URL to the page URL with the same query, and
 * `toFragment()` to the fragment URL; the fragment response pushes
 * `withQuery(getPageUrl(), request params)` as `HX-Push-Url` so every control
 * lands the browser on a URL that renders the whole page again.
 */
class ListingUrl
{
    /**
     * Query keys that never belong in a shopper facing URL: core's URL builder
     * flags, the category id and the search query (fixed by the base URL), the
     * append marker of the infinite loading and the form key.
     */
    public const INTERNAL_PARAMS = ['_current', '_use_rewrite', '_escape', '_nocache', 'id', 'q', 'append', 'form_key'];

    public function __construct(
        private readonly UrlInterface $urlBuilder,
        private readonly QueryFactory $queryFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The public page URL of the layer's listing, '' when it cannot be built.
     */
    public function getPageUrl(Layer $layer): string
    {
        try {
            if ($layer instanceof SearchLayer) {
                $query = $this->getQueryText();

                return $query === '' ? '' : $this->urlBuilder->getUrl('catalogsearch/result', ['_query' => ['q' => $query]]);
            }

            return (string) $layer->getCurrentCategory()->getUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Listing: page URL failed -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * The grid fragment endpoint of the layer's listing, '' when it has none.
     */
    public function getFragmentUrl(Layer $layer): string
    {
        try {
            if ($layer instanceof SearchLayer) {
                $query = $this->getQueryText();

                return $query === '' ? '' : $this->urlBuilder->getUrl('hyperion/catalog/search', ['_query' => ['q' => $query]]);
            }

            return $this->urlBuilder->getUrl(
                'hyperion/category/filter',
                ['_query' => ['id' => (int) $layer->getCurrentCategory()->getId()]]
            );
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Listing: fragment URL failed -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * The public page URL carrying the query of $url (a core `_current` URL,
     * which on a fragment request is the fragment route). $url itself when
     * the page URL cannot be built.
     */
    public function toPublic(Layer $layer, string $url): string
    {
        $pageUrl = $this->getPageUrl($layer);

        return $pageUrl === '' ? $url : $this->withQuery($pageUrl, $this->queryOf($url));
    }

    /**
     * The fragment URL carrying the filters of $url; the page number is left
     * out (a filter change starts at page 1). '' when the listing has no
     * fragment endpoint.
     */
    public function toFragment(Layer $layer, string $url): string
    {
        $fragmentUrl = $this->getFragmentUrl($layer);
        if ($fragmentUrl === '') {
            return '';
        }
        $query = $this->queryOf($url);
        unset($query['p']);

        return $this->withQuery($fragmentUrl, $query);
    }

    /**
     * $baseUrl with $query appended: internal keys and empty values are
     * dropped, a key the base URL already carries keeps the base value.
     *
     * @param array<string, mixed> $query
     */
    public function withQuery(string $baseUrl, array $query): string
    {
        $parts = parse_url($baseUrl);
        if ($parts === false || $baseUrl === '') {
            return $baseUrl;
        }
        $base = [];
        parse_str((string) ($parts['query'] ?? ''), $base);
        $extra = array_diff_key($query, array_flip(self::INTERNAL_PARAMS));
        $extra = array_filter($extra, static fn ($value) => $value !== '' && $value !== null && $value !== []);
        $merged = $base + $extra;

        $url = '';
        if (isset($parts['scheme'])) {
            $url .= $parts['scheme'] . '://';
        }
        if (isset($parts['host'])) {
            $url .= $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
        }
        $url .= $parts['path'] ?? '';
        if ($merged !== []) {
            $url .= '?' . http_build_query($merged);
        }
        if (isset($parts['fragment'])) {
            $url .= '#' . $parts['fragment'];
        }

        return $url;
    }

    /**
     * The query of a URL as an array; entity encoded separators (`&amp;`,
     * what core's `_escape` produces) are decoded first.
     *
     * @return array<string, mixed>
     */
    public function queryOf(string $url): array
    {
        $query = [];
        $decoded = html_entity_decode($url, ENT_QUOTES | ENT_HTML5);
        parse_str((string) parse_url($decoded, PHP_URL_QUERY), $query);

        return $query;
    }

    private function getQueryText(): string
    {
        return trim((string) $this->queryFactory->get()->getQueryText());
    }
}

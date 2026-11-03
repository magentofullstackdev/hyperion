<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Plugin\Framework\App\Action;

use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Result\Page;
use Magentofullstackdev\HyperionCatalog\Model\FilterGuard;
use Magentofullstackdev\HyperionCore\Model\Security\RateLimiter;
use Magentofullstackdev\HyperionCore\Model\Security\TooManyRequests;
use Psr\Log\LoggerInterface;

/**
 * Guards the listing routes (category page, layered navigation fragment,
 * search results) against parameter noise and filter permutation floods:
 *
 *   1. unknown query parameters are dropped from the request before the
 *      action runs (`?filtro1=x&filtro2=y` never reaches the layer);
 *   2. more active filters than `hyperion/catalog/max_active_filters` is a
 *      combinatorial crawl, answered with HTTP 400 and `noindex` before any
 *      layout or search engine work;
 *   3. a category page that carries filters or dropped parameters counts
 *      against the `category_filter` rate limit (the fragment and the
 *      search page are counted by route by the core plugin);
 *   4. a category page with two or more filters is served with
 *      `X-Robots-Tag: noindex, nofollow` and the matching robots meta tag,
 *      so spiders stop at the first level of filter URLs; the grid fragment
 *      (a Raw result) carries the directive of its pushed URL in an
 *      `HX-Trigger` header (`hyperion:listing-robots`), which
 *      lib/listing-filters.js writes into the page's robots meta, so the
 *      meta follows the filters applied through HTMX;
 *   5. the page number is clamped to the search engine's result window
 *      (`FilterGuard::clampPage()`), so no listing request reaches the
 *      adapter's point in time pagination.
 *
 * Same shape as the catalog mode guard: the policy is fail-open and the
 * action runs exactly once, outside the try block.
 */
class FilterGuardPlugin
{
    private const CATEGORY_VIEW = 'catalog_category_view';
    private const NOINDEX = 'noindex, nofollow';
    private const ROBOTS_META = FilterGuard::ROBOTS_NOINDEX;
    private const ROBOTS_EVENT = 'hyperion:listing-robots';

    /**
     * @param string[] $routes full action names the guard applies to
     */
    public function __construct(
        private readonly FilterGuard $filterGuard,
        private readonly RateLimiter $rateLimiter,
        private readonly TooManyRequests $tooManyRequests,
        private readonly RawFactory $rawFactory,
        private readonly HttpRequest $request,
        private readonly LoggerInterface $logger,
        private readonly array $routes = []
    ) {
    }

    /**
     * @param ActionInterface $subject
     * @param callable $proceed
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function aroundExecute(ActionInterface $subject, callable $proceed): mixed
    {
        $activeFilters = 0;
        $guarded = false;
        $refusal = $this->guard($activeFilters, $guarded);
        if ($refusal !== null) {
            return $refusal;
        }

        $result = $proceed();

        if ($activeFilters >= 2 && $result instanceof Page) {
            $this->markNoindex($result);
        } elseif ($guarded && $result instanceof Raw) {
            $this->triggerRobots($result, $activeFilters);
        }

        return $result;
    }

    /**
     * @param int $activeFilters receives the number of filters the request activates
     * @param bool $guarded receives whether the route is one of the guarded listing routes
     * @return Raw|null the refusal, null when the request may proceed
     */
    private function guard(int &$activeFilters, bool &$guarded): ?Raw
    {
        try {
            $route = (string) $this->request->getFullActionName();
            if (!in_array($route, $this->routes, true)) {
                return null;
            }
            $guarded = true;

            $stripped = $this->filterGuard->stripUnknown($this->request);
            $clamped = $this->filterGuard->clampPage($this->request);
            if ($clamped !== null) {
                $this->logger->info(sprintf('Hyperion filter guard: page clamped to %d on %s', $clamped, $route));
            }
            $filters = $this->filterGuard->activeFilters($this->request->getParams());
            $activeFilters = count($filters);

            $max = $this->filterGuard->getMaxActiveFilters();
            if ($max > 0 && $activeFilters > $max) {
                $this->logger->info(sprintf(
                    'Hyperion filter guard: %d filters on %s (limit %d), refused',
                    $activeFilters,
                    $route,
                    $max
                ));
                return $this->badRequest();
            }

            if ($route === self::CATEGORY_VIEW
                && ($activeFilters > 0 || $stripped !== [])
                && !$this->rateLimiter->hit('category_filter')
            ) {
                return $this->tooManyRequests->create();
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion filter guard skipped: ' . $e->getMessage());
        }

        return null;
    }

    private function badRequest(): Raw
    {
        /** @var Raw $result */
        $result = $this->rawFactory->create();
        $result->setHttpResponseCode(400);
        $result->setHeader('Cache-Control', 'private, no-store', true);
        $result->setHeader('X-Robots-Tag', self::NOINDEX, true);
        $result->setHeader('Content-Type', 'text/plain; charset=UTF-8', true);
        $result->setContents('Too many filters');

        return $result;
    }

    /**
     * The grid fragment: the robots directive of the page the browser now
     * shows (the pushed URL) travels as an HTMX trigger; htmx fires it on the
     * requesting element before the swap, the listener on the document
     * updates `<meta name="robots">`.
     */
    private function triggerRobots(Raw $fragment, int $activeFilters): void
    {
        try {
            $payload = json_encode(
                [self::ROBOTS_EVENT => ['robots' => $this->filterGuard->getRobots($activeFilters)]],
                JSON_THROW_ON_ERROR
            );
            $fragment->setHeader('HX-Trigger', $payload, true);
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion filter guard: robots trigger not applied: ' . $e->getMessage());
        }
    }

    private function markNoindex(Page $page): void
    {
        try {
            $page->setHeader('X-Robots-Tag', self::NOINDEX, true);
            $page->getConfig()->setRobots(self::ROBOTS_META);
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion filter guard: robots directive not applied: ' . $e->getMessage());
        }
    }
}

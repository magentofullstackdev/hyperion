<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Controller\Navigation;

use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\View\Result\PageFactory;
use Psr\Log\LoggerInterface;

/**
 * GET /hyperion/navigation/menu: the top navigation as a public fragment.
 *
 * Session-agnostic, so it is served with `Cache-Control: public,
 * s-maxage=<ttl>` (see CacheHeaders::applyPublic) and cached by Varnish
 * independently of the pages that include it. Pages embed it through
 * Magentofullstackdev\HyperionCore\Block\EsiFragment: an `<esi:include>` when
 * the edge advertises ESI, an inline render otherwise.
 *
 * The response carries the menu block's cache identities as
 * `X-Magento-Tags` (cat_c, cat_c_<id>, ...), so a category save purges the
 * cached fragment through the same BAN path as full pages.
 *
 * The route is whitelisted in HyperionCore's PublicRouteRegistry, which
 * stops PHP's session cache limiter from adding no-cache headers.
 */
class Menu implements HttpGetActionInterface
{
    public const TTL_SECONDS = 3600;

    private const HANDLE = 'hyperion_navigation_menu';
    private const BLOCK = 'hyperion.navigation.menu';

    public function __construct(
        private readonly PageFactory $pageFactory,
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(): Raw
    {
        $response = $this->rawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setHeader('X-Hyperion-Fragment', 'navigation-menu', true);

        try {
            $page = $this->pageFactory->create(false, ['load_default' => false]);
            $page->addHandle(self::HANDLE);
            $page->initLayout();

            $block = $page->getLayout()->getBlock(self::BLOCK);
            if (!$block) {
                $this->logger->warning('Hyperion Navigation\Menu: block ' . self::BLOCK . ' not found in layout.');
                return $this->cacheHeaders->applyPrivate($response->setContents(''));
            }

            $html = (string) $block->toHtml();

            if ($block instanceof IdentityInterface) {
                $tags = array_values(array_unique(array_filter($block->getIdentities(), 'is_string')));
                if ($tags !== []) {
                    $response->setHeader('X-Magento-Tags', implode(',', $tags), true);
                }
            }

            $response->setContents($html);
            return $this->cacheHeaders->applyPublic($response, self::TTL_SECONDS);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Navigation\Menu: rendering failed', ['exception' => $e]);
            return $this->cacheHeaders->applyPrivate($response->setHttpResponseCode(500)->setContents(''));
        }
    }
}

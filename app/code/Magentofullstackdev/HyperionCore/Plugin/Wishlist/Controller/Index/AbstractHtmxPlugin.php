<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Wishlist\Controller\Index;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Customer\Model\Url as CustomerUrl;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\App\Response\Http as HttpResponse;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Url\EncoderInterface;
use Magento\Framework\UrlInterface;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\RequestContext;

/**
 * Shared body of the wishlist Add / Remove HTMX plugins.
 *
 * For an `HX-Request` the native redirect result is replaced by a raw
 * fragment made of:
 *   1. the `#hyperion-notification` toast (in-target swap), and
 *   2. the header wishlist counter from the `hyperion_customer_wishlist`
 *      fragment handle, marked `hx-swap-oob` so HTMX splices it over the
 *      existing `#hyperion-wishlist-count` anchor.
 *
 * Guests: the wishlist module's beforeDispatch already stored the add
 * request and the referer in the session (`BeforeWishlistRequest`,
 * `BeforeWishlistUrl`), queued "You must login or register..." and set a
 * 302 to the login page, skipping execute(). The browser follows the 302 of
 * an XHR transparently, so htmx would swap the login page's markup into the
 * toast; the response is turned into a 200 with `HX-Redirect` to the login
 * page instead. From there core does the rest: the login lands on the add
 * action (`BeforeAuthUrl`), the plugin replays the stored request and the
 * visitor returns to the product with the item in the wish list. The queued
 * message stays in the session for the login page.
 */
abstract class AbstractHtmxPlugin
{
    private const HTMX_HEADER = 'HX-Request';
    private const FRAGMENT_HANDLE = 'hyperion_customer_wishlist';
    private const FRAGMENT_BLOCK = 'hyperion.customer.wishlist.fragment';

    public function __construct(
        private readonly RawFactory $resultRawFactory,
        private readonly CustomerSession $customerSession,
        private readonly CacheHeaders $cacheHeaders,
        private readonly HttpResponse $response,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer,
        private readonly UrlInterface $urlBuilder,
        private readonly EncoderInterface $urlEncoder,
        private readonly RequestContext $requestContext,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * @param mixed $result
     * @return mixed
     */
    protected function transform($result, RequestInterface $request)
    {
        if (!$request instanceof HttpRequest || !$request->getHeader(self::HTMX_HEADER)) {
            return $result;
        }

        $response = $this->resultRawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);

        if (!$this->customerSession->isLoggedIn()) {
            // Neutralise the 302 + Location set by Customer\Model\Session::authenticate()
            // and let htmx navigate to the login page instead.
            $this->response->setHttpResponseCode(200);
            $this->response->clearHeader('Location');
            $response->setHeader('HX-Redirect', $this->getLoginUrl(), true);
            $response->setContents('');

            return $this->cacheHeaders->applyPrivate($response);
        }

        $messages = $this->messageCollector->collect();
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;
        $response->setContents(
            $this->notificationRenderer->render($messages['html'], $tone)
            . "\n"
            . $this->fragmentRenderer->render(self::FRAGMENT_HANDLE, self::FRAGMENT_BLOCK, ['oob' => true])
        );

        return $this->cacheHeaders->applyPrivate($response);
    }

    /**
     * The login URL with the page the request was issued from as referer
     * (core would put the add action's own URL there). After the login core
     * sends the visitor to `BeforeAuthUrl` first, the referer only matters
     * when nothing is stored.
     */
    private function getLoginUrl(): string
    {
        $params = [];
        $current = $this->requestContext->getCurrentUrl();
        $toDashboard = $this->scopeConfig->isSetFlag(
            CustomerUrl::XML_PATH_CUSTOMER_STARTUP_REDIRECT_TO_DASHBOARD,
            ScopeInterface::SCOPE_STORE
        );
        if ($current !== null && !$toDashboard) {
            $params[CustomerUrl::REFERER_QUERY_PARAM_NAME] = $this->urlEncoder->encode($current);
        }

        return $this->urlBuilder->getUrl(CustomerUrl::ROUTE_ACCOUNT_LOGIN, $params);
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Wishlist\Controller\Index;

use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Wishlist\Controller\Index\Fromcart;

/**
 * HTMX transformer for core's "Move to Wishlist" (wishlist/index/fromcart).
 *
 * The cart page's button posts the quote item id; core moves the item and
 * would redirect back to the cart. For an `HX-Request` the answer is the
 * cart body (`#hyperion-cart-items`, the main swap), the header mini-cart
 * badge and the header wishlist counter out of band, and the toast.
 * Guests never see the button (the cart offers it to customers only), and
 * core's authentication redirect stays untouched for them.
 */
class FromcartPlugin
{
    private const HTMX_HEADER = 'HX-Request';
    private const CART_HANDLE = 'hyperion_checkout_cart_fragment';
    private const CART_BLOCK = 'hyperion.cart.items';
    private const COUNT_HANDLE = 'hyperion_checkout_minicart_count';
    private const COUNT_BLOCK = 'hyperion.minicart.count';
    private const WISHLIST_HANDLE = 'hyperion_customer_wishlist';
    private const WISHLIST_BLOCK = 'hyperion.customer.wishlist.fragment';

    public function __construct(
        private readonly RawFactory $resultRawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer
    ) {
    }

    /**
     * @param Fromcart $subject
     * @param mixed $result
     * @param RequestInterface $request
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterDispatch(Fromcart $subject, $result, RequestInterface $request)
    {
        if (!$request instanceof HttpRequest || !$request->getHeader(self::HTMX_HEADER)) {
            return $result;
        }

        $messages = $this->messageCollector->collect();
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;

        $response = $this->resultRawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setContents(
            $this->fragmentRenderer->render(self::CART_HANDLE, self::CART_BLOCK)
            . "\n"
            . $this->fragmentRenderer->render(self::COUNT_HANDLE, self::COUNT_BLOCK, ['oob' => true])
            . "\n"
            . $this->fragmentRenderer->render(self::WISHLIST_HANDLE, self::WISHLIST_BLOCK, ['oob' => true])
            . "\n"
            . $this->notificationRenderer->render($messages['html'], $tone, true)
        );

        return $this->cacheHeaders->applyPrivate($response);
    }
}

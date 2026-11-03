<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart;

use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\RawFactory;

/**
 * Shared body of the cart mutation HTMX plugins (item delete, qty update).
 *
 * Response for an `HX-Request`:
 *   1. the full cart body (`#hyperion-cart-items`, items + coupon + totals)
 *      rendered from the `hyperion_checkout_cart_fragment` handle. This is
 *      the main swap for the cart page's own buttons
 *      (`hx-target="#hyperion-cart-items" hx-swap="outerHTML"`); callers
 *      that are not on the cart page (the mini-cart drawer) issue the
 *      request with `swap: none` and simply drop it.
 *   2. OOB header badge `#hyperion-mini-cart-count` from the
 *      `hyperion_checkout_minicart_count` handle: keeps the header count
 *      right after a removal and, through the badge observer in
 *      hyperion-mini-cart.js, refreshes an open drawer.
 *   3. OOB `#hyperion-notification` toast.
 */
abstract class AbstractCartMutationPlugin
{
    private const HTMX_HEADER = 'HX-Request';
    private const CART_HANDLE = 'hyperion_checkout_cart_fragment';
    private const CART_BLOCK = 'hyperion.cart.items';
    private const COUNT_HANDLE = 'hyperion_checkout_minicart_count';
    private const COUNT_BLOCK = 'hyperion.minicart.count';

    public function __construct(
        private readonly HttpRequest $request,
        private readonly RawFactory $resultRawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer
    ) {
    }

    /**
     * @param mixed $result
     * @return mixed
     */
    protected function transform($result)
    {
        if (!$this->request->getHeader(self::HTMX_HEADER)) {
            return $result;
        }

        $messages = $this->messageCollector->collect();
        $errors = $this->additionalErrors();
        if ($errors !== []) {
            $messages['html'] = trim($messages['html'] . ' ' . implode(' ', $errors));
            $messages['has_error'] = true;
        }
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;

        $response = $this->resultRawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setContents(
            $this->fragmentRenderer->render(self::CART_HANDLE, self::CART_BLOCK)
            . "\n"
            . $this->fragmentRenderer->render(self::COUNT_HANDLE, self::COUNT_BLOCK, ['oob' => true])
            . "\n"
            . $this->notificationRenderer->render($messages['html'], $tone, true)
        );

        return $this->cacheHeaders->applyPrivate($response);
    }

    /**
     * Failures the message manager does not carry, as escaped HTML, printed
     * in the toast after the collected messages (the toast turns red). The
     * quantity update overrides it with the quote items' errors: core's
     * UpdatePost swallows the validation exception and adds no message.
     *
     * @return string[]
     */
    protected function additionalErrors(): array
    {
        return [];
    }
}

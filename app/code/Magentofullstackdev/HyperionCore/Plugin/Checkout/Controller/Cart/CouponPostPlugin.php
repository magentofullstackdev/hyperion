<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart;

use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Magento\Checkout\Controller\Cart\CouponPost;
use Magento\Framework\App\ActionFlag;
use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\App\Response\Http as HttpResponse;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;

/**
 * HTMX response for POST /checkout/cart/couponPost (apply / cancel coupon).
 *
 * Main swap: the coupon form (`#hyperion-coupon-form`). Out-of-band: the
 * totals card (`#hyperion-cart-totals`, discounts changed) and the toast.
 * Both blocks are rendered from the `hyperion_checkout_cart_fragment`
 * handle so they match the cart page markup exactly (the coupon block
 * carries its children there too, the `coupon_code` reCAPTCHA among them).
 *
 * Two entry points. `afterExecute` answers the normal request. When a
 * predispatch observer stops the action (core's reCAPTCHA observer on a
 * missing or rejected `g-recaptcha-response`: it adds its error message,
 * sets FLAG_NO_DISPATCH and writes a 302 to the referer onto the response)
 * `execute()` never runs, and HTMX would follow the redirect and swap the
 * whole cart page into the coupon slot. `afterDispatch` catches that case
 * on an HTMX request: it drops the redirect and answers with the same
 * fragment body, so the shopper sees the message as a toast and the form
 * stays in place.
 */
class CouponPostPlugin
{
    private const HTMX_HEADER = 'HX-Request';
    private const CART_HANDLE = 'hyperion_checkout_cart_fragment';
    private const COUPON_BLOCK = 'hyperion.cart.coupon';
    private const TOTALS_BLOCK = 'hyperion.cart.totals';

    public function __construct(
        private readonly HttpRequest $request,
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer,
        private readonly ActionFlag $actionFlag
    ) {
    }

    /**
     * @param CouponPost $subject
     * @param mixed $result
     * @return mixed
     */
    public function afterExecute(CouponPost $subject, $result)
    {
        if (!$this->isHtmxRequest()) {
            return $result;
        }

        return $this->buildResponse();
    }

    /**
     * The action was stopped before `execute()` (FLAG_NO_DISPATCH): answer
     * the HTMX request with the fragment body instead of the redirect the
     * observer wrote onto the response.
     *
     * @param CouponPost $subject
     * @param mixed $result
     * @return mixed
     */
    public function afterDispatch(CouponPost $subject, $result)
    {
        if (!$this->isHtmxRequest() || !$this->actionFlag->get('', ActionInterface::FLAG_NO_DISPATCH)) {
            return $result;
        }

        $response = $subject->getResponse();
        if ($response instanceof HttpResponse) {
            // The Raw result renders onto this very object: the status and the
            // Location header of the redirect would otherwise survive.
            $response->clearHeader('Location');
            $response->setHttpResponseCode(200);
        }

        return $this->buildResponse();
    }

    private function isHtmxRequest(): bool
    {
        return (bool) $this->request->getHeader(self::HTMX_HEADER);
    }

    private function buildResponse(): Raw
    {
        $messages = $this->messageCollector->collect();
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;

        $response = $this->rawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setContents(
            $this->fragmentRenderer->render(self::CART_HANDLE, self::COUPON_BLOCK)
            . "\n"
            . $this->fragmentRenderer->render(self::CART_HANDLE, self::TOTALS_BLOCK, ['oob' => true])
            . "\n"
            . $this->notificationRenderer->render($messages['html'], $tone, true)
        );

        return $this->cacheHeaders->applyPrivate($response);
    }
}

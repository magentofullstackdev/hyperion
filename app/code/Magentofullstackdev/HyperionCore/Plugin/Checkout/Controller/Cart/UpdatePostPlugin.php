<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart;

use Magento\Checkout\Controller\Cart\UpdatePost;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Escaper;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Psr\Log\LoggerInterface;

/**
 * HTMX response for POST /checkout/cart/updatePost ("Update Cart" and the
 * mini-cart quantity stepper). See AbstractCartMutationPlugin.
 *
 * A quantity the stock refuses is a special case: core's
 * `UpdatePost::_updateShoppingCart()` catches the validation exception of
 * `Cart::updateItems()`, SAVES the cart with the refused quantity and adds
 * no message (Luma validates client side and prints the item error under
 * the line). The quote items of the request still carry the error flag and
 * its text, so they are the toast here; the cart fragment prints the same
 * message under the line through `CartData::getItems()`.
 */
class UpdatePostPlugin extends AbstractCartMutationPlugin
{
    private const CART_PARAM = 'cart';

    /** @var array<int|string, mixed> The `cart` parameter of the current request. */
    private array $cartData = [];

    /**
     * @param HttpRequest $request
     * @param RawFactory $resultRawFactory
     * @param CacheHeaders $cacheHeaders
     * @param MessageCollector $messageCollector
     * @param NotificationRenderer $notificationRenderer
     * @param FragmentRenderer $fragmentRenderer
     * @param CheckoutSession $checkoutSession
     * @param Escaper $escaper
     * @param LoggerInterface $logger
     */
    public function __construct(
        HttpRequest $request,
        RawFactory $resultRawFactory,
        CacheHeaders $cacheHeaders,
        MessageCollector $messageCollector,
        NotificationRenderer $notificationRenderer,
        FragmentRenderer $fragmentRenderer,
        private readonly CheckoutSession $checkoutSession,
        private readonly Escaper $escaper,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct(
            $request,
            $resultRawFactory,
            $cacheHeaders,
            $messageCollector,
            $notificationRenderer,
            $fragmentRenderer
        );
    }

    /**
     * @param UpdatePost $subject
     * @param mixed $result
     * @return mixed
     */
    public function afterExecute(UpdatePost $subject, $result)
    {
        $cartData = $subject->getRequest()->getParam(self::CART_PARAM);
        $this->cartData = is_array($cartData) ? $cartData : [];

        return $this->transform($result);
    }

    /**
     * The errors of the quote items the request asked to change, escaped.
     * Lines the request did not touch keep their message under the line
     * only: an out of stock item elsewhere in the cart is not the answer to
     * this action.
     *
     * @return string[]
     */
    protected function additionalErrors(): array
    {
        if ($this->cartData === []) {
            return [];
        }
        try {
            $errors = [];
            foreach ($this->checkoutSession->getQuote()->getAllVisibleItems() as $item) {
                if (!isset($this->cartData[(int) $item->getId()]) || !$item->getData('has_error')) {
                    continue;
                }
                foreach ((array) $item->getMessage(false) as $message) {
                    $text = trim((string) $message);
                    if ($text !== '') {
                        $errors[] = $this->escaper->escapeHtml($text);
                    }
                }
            }

            return array_values(array_unique($errors));
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion UpdatePostPlugin: could not read the quote item errors -- ' . $e->getMessage());
            return [];
        }
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Controller\Cart;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Message\ManagerInterface as MessageManagerInterface;
use Magento\Framework\Controller\Result\ForwardFactory;
use Magentofullstackdev\HyperionCheckout\Model\GiftMessageBridge;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Model\Htmx\FragmentRenderer;
use Magentofullstackdev\HyperionCore\Model\Htmx\MessageCollector;
use Magentofullstackdev\HyperionCore\Model\Htmx\NotificationRenderer;
use Psr\Log\LoggerInterface;

/**
 * Saves (or removes) the order-level or an item-level gift message of the
 * current cart: POST hyperion/cart/giftMessage.
 *
 * Fields: gift[item_id] (0 = order level), gift[sender], gift[recipient],
 * gift[message]; `remove=1` or an empty message deletes the stored one.
 * Guests and customers both go through the checkout session quote and the
 * core GiftMessage service contracts, which validate the store settings,
 * `gift_message_available` and virtual items the same way the REST API
 * does.
 *
 * HTMX requests get the cart fragment (`hyperion_checkout_cart_fragment`)
 * plus the toast out of band, like every other cart mutation; a plain
 * POST redirects back to the cart.
 */
class GiftMessage implements HttpPostActionInterface
{
    private const HTMX_HEADER = 'HX-Request';
    private const CART_HANDLE = 'hyperion_checkout_cart_fragment';
    private const CART_BLOCK = 'hyperion.cart.items';
    private const MAX_LENGTH = 2000;

    public function __construct(
        private readonly HttpRequest $request,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly CheckoutSession $checkoutSession,
        private readonly MessageManagerInterface $messageManager,
        private readonly GiftMessageBridge $bridge,
        private readonly ForwardFactory $forwardFactory,
        private readonly RedirectFactory $redirectFactory,
        private readonly RawFactory $rawFactory,
        private readonly CacheHeaders $cacheHeaders,
        private readonly MessageCollector $messageCollector,
        private readonly NotificationRenderer $notificationRenderer,
        private readonly FragmentRenderer $fragmentRenderer,
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(): ResultInterface
    {
        if (!$this->bridge->isAvailable()) {
            return $this->forwardFactory->create()->forward('noroute');
        }
        if (!$this->formKeyValidator->validate($this->request)) {
            $this->messageManager->addErrorMessage((string) __('Invalid Form Key. Please refresh the page.'));
            return $this->respond();
        }

        $gift = $this->request->getParam('gift');
        $gift = is_array($gift) ? $gift : [];
        $itemId = (int) ($gift['item_id'] ?? 0);
        $remove = (bool) $this->request->getParam('remove');
        $text = $remove ? '' : $this->clean($gift['message'] ?? '');

        try {
            $cartId = (int) $this->checkoutSession->getQuote()->getId();
            $this->bridge->save(
                $cartId,
                $itemId,
                $remove ? '' : $this->clean($gift['sender'] ?? ''),
                $remove ? '' : $this->clean($gift['recipient'] ?? ''),
                $text
            );

            $this->messageManager->addSuccessMessage(
                $text === ''
                    ? (string) __('The gift message has been removed.')
                    : (string) __('The gift message has been saved.')
            );
        } catch (LocalizedException $e) {
            $this->logger->warning('Hyperion GiftMessage: rejected -- ' . $e->getMessage());
            $this->messageManager->addErrorMessage($e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion GiftMessage: save failed', ['exception' => $e]);
            $this->messageManager->addErrorMessage((string) __("The gift message couldn't be saved. Please try again."));
        }

        return $this->respond();
    }

    private function clean(mixed $value): string
    {
        $value = is_string($value) ? trim($value) : '';
        return mb_substr($value, 0, self::MAX_LENGTH);
    }

    private function respond(): ResultInterface
    {
        if (!$this->request->getHeader(self::HTMX_HEADER)) {
            return $this->redirectFactory->create()->setPath('checkout/cart');
        }

        $messages = $this->messageCollector->collect();
        $tone = $messages['has_error'] ? NotificationRenderer::TONE_ERROR : NotificationRenderer::TONE_SUCCESS;

        $response = $this->rawFactory->create();
        $response->setHeader('Content-Type', 'text/html; charset=UTF-8', true);
        $response->setContents(
            $this->fragmentRenderer->render(self::CART_HANDLE, self::CART_BLOCK)
            . "\n"
            . $this->notificationRenderer->render($messages['html'], $tone, true)
        );

        return $this->cacheHeaders->applyPrivate($response);
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\DataObject;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magento\Sales\Api\Data\OrderInterface;
use Magento\Sales\Api\Data\OrderItemInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Model\GiftMessageBridge;
use Psr\Log\LoggerInterface;

/**
 * Gift messages for the cart page forms and the customer order view.
 *
 * Cart side: which forms to render (order level when `sales/gift_options/
 * allow_order` is on and the quote is not virtual; one per item when the
 * item's product allows it, `gift_message_available` falling back to
 * `sales/gift_options/allow_items`) and their current values. Order side:
 * the saved messages, if any, of an order and its items.
 *
 * Every accessor returns the same shape, so one template renders all of
 * them: ['sender' => string, 'recipient' => string, 'message' => string].
 */
class GiftMessage implements ArgumentInterface
{
    public function __construct(
        private readonly CheckoutSession $checkoutSession,
        private readonly GiftMessageBridge $bridge,
        private readonly StoreManagerInterface $storeManager,
        private readonly UrlInterface $urlBuilder,
        private readonly FormKey $formKey,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Endpoint of the cart forms (HyperionCheckout\Controller\Cart\GiftMessage).
     */
    public function getSaveUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('hyperion/cart/giftMessage');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion GiftMessage: save url failed', ['exception' => $e]);
            return '';
        }
    }

    public function getFormKey(): string
    {
        try {
            return (string) $this->formKey->getFormKey();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion GiftMessage: form key failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * Order-level form values of the current quote, null when the store
     * does not allow order-level messages or the cart is virtual only.
     *
     * @return array{sender: string, recipient: string, message: string}|null
     */
    public function getOrderForm(): ?array
    {
        try {
            $quote = $this->checkoutSession->getQuote();
            if ($quote->isVirtual() || !$this->isAllowed('quote', $quote)) {
                return null;
            }
            return $this->toArray($this->bridge->getMessageForEntity($quote));
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion GiftMessage: order form failed', ['exception' => $e]);
            return null;
        }
    }

    /**
     * Item-level form values keyed by quote item id, only for the items
     * whose product accepts a gift message (virtual items never do).
     *
     * @return array<int, array{sender: string, recipient: string, message: string}>
     */
    public function getItemForms(): array
    {
        $forms = [];
        try {
            $quote = $this->checkoutSession->getQuote();
            foreach ($quote->getAllVisibleItems() as $item) {
                if (!$item instanceof QuoteItem || $item->getIsVirtual() || !$this->isAllowed('item', $item)) {
                    continue;
                }
                $forms[(int) $item->getId()] = $this->toArray($this->bridge->getMessageForEntity($item));
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion GiftMessage: item forms failed', ['exception' => $e]);
        }
        return $forms;
    }

    /**
     * @return array{sender: string, recipient: string, message: string}|null
     */
    public function getOrderMessage(OrderInterface $order): ?array
    {
        return $this->getSavedMessage($order);
    }

    /**
     * @return array{sender: string, recipient: string, message: string}|null
     */
    public function getOrderItemMessage(OrderItemInterface $item): ?array
    {
        return $this->getSavedMessage($item);
    }

    /**
     * Saved message of an order or order item, null when there is none.
     *
     * @return array{sender: string, recipient: string, message: string}|null
     */
    private function getSavedMessage(mixed $entity): ?array
    {
        try {
            if (!$entity instanceof DataObject || !$entity->getData('gift_message_id')) {
                return null;
            }
            $message = $this->toArray($this->bridge->getMessageForEntity($entity));
            return $message['message'] === '' ? null : $message;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion GiftMessage: reading a saved message failed', ['exception' => $e]);
            return null;
        }
    }

    private function isAllowed(string $type, DataObject $entity): bool
    {
        return $this->bridge->isMessagesAllowed($type, $entity, (int) $this->storeManager->getStore()->getId());
    }

    /**
     * @return array{sender: string, recipient: string, message: string}
     */
    private function toArray(mixed $message): array
    {
        if (!$message instanceof DataObject) {
            return ['sender' => '', 'recipient' => '', 'message' => ''];
        }
        return [
            'sender' => (string) $message->getData('sender'),
            'recipient' => (string) $message->getData('recipient'),
            'message' => (string) $message->getData('message'),
        ];
    }
}

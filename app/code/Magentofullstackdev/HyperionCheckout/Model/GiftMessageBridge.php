<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model;

use Magento\Framework\DataObject;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;

/**
 * Access to Magento_GiftMessage without a hard dependency.
 *
 * The module can be removed from a store; every class of it is resolved by
 * name here so DI compiles and the cart simply shows no gift options.
 */
class GiftMessageBridge
{
    private const MODULE_NAME = 'Magento_GiftMessage';
    private const HELPER_CLASS = 'Magento\GiftMessage\Helper\Message';
    private const CART_REPOSITORY_CLASS = 'Magento\GiftMessage\Api\CartRepositoryInterface';
    private const ITEM_REPOSITORY_CLASS = 'Magento\GiftMessage\Api\ItemRepositoryInterface';
    private const MESSAGE_FACTORY_CLASS = 'Magento\GiftMessage\Api\Data\MessageInterfaceFactory';
    private const CONFIG_PROVIDER_CLASS = 'Magento\GiftMessage\Model\GiftMessageConfigProvider';
    private const CONFIG_KEYS = ['giftMessage', 'isOrderLevelGiftOptionsEnabled', 'isItemLevelGiftOptionsEnabled'];
    /** The keys of a stored message the checkout reads: the message's id and its three texts. */
    private const MESSAGE_KEYS = ['gift_message_id', 'sender', 'recipient', 'message'];

    /**
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager
    ) {
    }

    /**
     * @return bool
     */
    public function isAvailable(): bool
    {
        return $this->moduleManager->isEnabled(self::MODULE_NAME) && class_exists(self::HELPER_CLASS);
    }

    /**
     * The checkout config keys of core's GiftMessageConfigProvider for the
     * current quote (`giftMessage`, `isOrderLevelGiftOptionsEnabled`,
     * `isItemLevelGiftOptionsEnabled`). Core registers that provider on its
     * own `Magento\GiftMessage\Model\CompositeConfigProvider` (the Luma gift
     * options block), not on the checkout composite, so the Lit checkout
     * gets them through here. Empty when the module is absent.
     *
     * A stored message (`giftMessage.orderLevel`, `giftMessage.itemLevel.<id>.message`)
     * keeps only its id, sender, recipient and text: core's data also carries
     * the id of the customer who wrote it, which the checkout never reads and
     * which a page printed for a visitor the persistent cookie remembers must
     * not carry.
     *
     * @return array<string, mixed>
     */
    public function getCheckoutConfig(): array
    {
        if (!$this->isAvailable() || !class_exists(self::CONFIG_PROVIDER_CLASS)) {
            return [];
        }
        $config = (array) $this->objectManager->get(self::CONFIG_PROVIDER_CLASS)->getConfig();
        $config = array_intersect_key($config, array_flip(self::CONFIG_KEYS));
        if (isset($config['giftMessage']) && is_array($config['giftMessage'])) {
            $config['giftMessage'] = $this->storedMessagesTextOnly($config['giftMessage']);
        }

        return $config;
    }

    /**
     * The `giftMessage` entry with every stored message reduced to `MESSAGE_KEYS`.
     *
     * @param array<string, mixed> $giftMessage `orderLevel` and `itemLevel` of core's provider
     * @return array<string, mixed>
     */
    private function storedMessagesTextOnly(array $giftMessage): array
    {
        if (isset($giftMessage['orderLevel']) && is_array($giftMessage['orderLevel'])) {
            $giftMessage['orderLevel'] = array_intersect_key(
                $giftMessage['orderLevel'],
                array_flip(self::MESSAGE_KEYS)
            );
        }
        if (isset($giftMessage['itemLevel']) && is_array($giftMessage['itemLevel'])) {
            foreach ($giftMessage['itemLevel'] as $itemId => $entry) {
                if (is_array($entry) && isset($entry['message']) && is_array($entry['message'])) {
                    $giftMessage['itemLevel'][$itemId]['message'] = array_intersect_key(
                        $entry['message'],
                        array_flip(self::MESSAGE_KEYS)
                    );
                }
            }
        }

        return $giftMessage;
    }

    /**
     * @param string $type quote, item, order or order_item
     * @param DataObject $entity
     * @param int $storeId
     * @return bool
     */
    public function isMessagesAllowed(string $type, DataObject $entity, int $storeId): bool
    {
        return $this->isAvailable()
            && (bool) $this->objectManager->get(self::HELPER_CLASS)->isMessagesAllowed($type, $entity, $storeId);
    }

    /**
     * @param DataObject $entity
     * @return DataObject|null
     */
    public function getMessageForEntity(DataObject $entity): ?DataObject
    {
        if (!$this->isAvailable()) {
            return null;
        }
        $message = $this->objectManager->get(self::HELPER_CLASS)->getGiftMessageForEntity($entity);

        return $message instanceof DataObject ? $message : null;
    }

    /**
     * Saves (or removes, with empty text) the message of a quote or of one of its items.
     *
     * @param int $cartId
     * @param int $itemId 0 for the order level message
     * @param string $sender
     * @param string $recipient
     * @param string $text
     * @return void
     */
    public function save(int $cartId, int $itemId, string $sender, string $recipient, string $text): void
    {
        if (!$this->isAvailable()) {
            throw new \RuntimeException('Magento_GiftMessage is not installed.');
        }
        $message = $this->objectManager->get(self::MESSAGE_FACTORY_CLASS)->create();
        $message->setSender($sender);
        $message->setRecipient($recipient);
        $message->setMessage($text);

        if ($itemId > 0) {
            $this->objectManager->get(self::ITEM_REPOSITORY_CLASS)->save($cartId, $message, $itemId);
        } else {
            $this->objectManager->get(self::CART_REPOSITORY_CLASS)->save($cartId, $message);
        }
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

use Magento\Framework\Event\ManagerInterface as EventManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * The last step of every htmx action response of the storefront (cart add,
 * update, delete, coupon, wish list and compare add / remove, move to wish
 * list): dispatches `hyperion_htmx_action_response` so a module can add out
 * of band markup to the answer without a plugin on a Hyperion class.
 *
 * Event data:
 *   - `action`    string, one of the ACTION_* constants;
 *   - `messages`  array{html: string, has_error: bool}, the collected messages (read only);
 *   - `transport` DataObject with `additional_html` (string, empty by default).
 *
 * An observer sets `transport.additional_html`; the markup is appended to
 * the body as given. It must be out of band markup (elements carrying
 * `hx-swap-oob` and the id of their target) and must not contain `<script>`
 * (htmx strips scripts from swapped content). The response is private:
 * observers may read the session. An observer that throws is logged and its
 * markup dropped; the action response itself is never lost.
 *
 * @api
 * @since 0.9.0
 */
class ActionResponse
{
    public const EVENT_NAME = 'hyperion_htmx_action_response';

    public const ACTION_CART_ADD = 'cart_add';
    public const ACTION_CART_UPDATE = 'cart_update';
    public const ACTION_CART_DELETE = 'cart_delete';
    public const ACTION_COUPON = 'coupon';
    public const ACTION_WISHLIST_ADD = 'wishlist_add';
    public const ACTION_WISHLIST_REMOVE = 'wishlist_remove';
    public const ACTION_WISHLIST_FROMCART = 'wishlist_fromcart';
    public const ACTION_COMPARE_ADD = 'compare_add';
    public const ACTION_COMPARE_REMOVE = 'compare_remove';

    /**
     * @param EventManagerInterface $eventManager
     * @param EventTransport $eventTransport
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly EventManagerInterface $eventManager,
        private readonly EventTransport $eventTransport,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The final body of an htmx action response: `$html` plus what the observers added.
     *
     * @param string $action One of the ACTION_* constants.
     * @param array<string, mixed> $messages The collected messages, `html` and `has_error`.
     * @param string $html The body the action built.
     * @return string `$html` unchanged when no observer added anything.
     */
    public function build(string $action, array $messages, string $html): string
    {
        $transport = $this->eventTransport->create();
        try {
            $this->eventManager->dispatch(self::EVENT_NAME, [
                'action' => $action,
                'messages' => $messages,
                'transport' => $transport,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion ActionResponse: an observer of %s failed for "%s", its markup is dropped: %s',
                self::EVENT_NAME,
                $action,
                $e->getMessage()
            ), ['exception' => $e]);

            return $html;
        }

        return $html . $this->eventTransport->additionalHtml($transport, self::EVENT_NAME);
    }
}

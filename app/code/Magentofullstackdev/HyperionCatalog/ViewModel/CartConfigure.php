<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

/**
 * The cart line "Edit": core's `checkout/cart/configure?id=<item>&product_id=<product>`
 * renders the product page with the quote item's buy request as the product's
 * preconfigured values (options and quantity). On that request the product form
 * must post to `checkout/cart/updateItemOptions/id/<item>`, which replaces the
 * line in place and redirects to the cart; everywhere else it adds to the cart.
 *
 * Core wires the submit route through `product.info`, a block the Hyperion
 * product page retires, so the template asks this view model instead.
 */
class CartConfigure implements ArgumentInterface
{
    public const ACTION_NAME = 'checkout_cart_configure';

    /**
     * @param HttpRequest $request
     * @param UrlInterface $urlBuilder
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly HttpRequest $request,
        private readonly UrlInterface $urlBuilder,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The quote item being edited, 0 on any other request.
     *
     * @return int
     */
    public function getItemId(): int
    {
        if ($this->request->getFullActionName() !== self::ACTION_NAME) {
            return 0;
        }

        return max(0, (int) $this->request->getParam('id'));
    }

    /**
     * @return bool
     */
    public function isActive(): bool
    {
        return $this->getItemId() > 0;
    }

    /**
     * Where the product form posts the new options and quantity of the item.
     *
     * @return string
     */
    public function getSubmitUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('checkout/cart/updateItemOptions', ['id' => $this->getItemId()]);
        } catch (\Throwable $e) {
            $this->logger->error('CartConfigure::getSubmitUrl -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * @return string
     */
    public function getCartUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('checkout/cart');
        } catch (\Throwable $e) {
            $this->logger->error('CartConfigure::getCartUrl -- ' . $e->getMessage());

            return '';
        }
    }
}

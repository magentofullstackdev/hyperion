<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart;

use Magento\Checkout\Controller\Cart\Delete;
use Magentofullstackdev\HyperionCore\Model\Htmx\ActionResponse;

/**
 * HTMX response for POST /checkout/cart/delete/id/<item>. Used by the cart
 * page "Remove" buttons and by the mini-cart drawer. See
 * AbstractCartMutationPlugin.
 *
 * @internal
 */
class DeletePlugin extends AbstractCartMutationPlugin
{
    /**
     * @param Delete $subject
     * @param mixed $result
     * @return mixed
     */
    public function afterExecute(Delete $subject, $result)
    {
        return $this->transform($result);
    }

    /**
     * @inheritDoc
     */
    protected function actionName(): string
    {
        return ActionResponse::ACTION_CART_DELETE;
    }
}

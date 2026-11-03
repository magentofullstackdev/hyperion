<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Wishlist\Controller\Index;

use Magento\Framework\App\RequestInterface;
use Magento\Wishlist\Controller\Index\Add;

/**
 * HTMX transformer for the Add-to-Wishlist controller.
 *
 * The Wishlist module's `Magento\Wishlist\Controller\Index\Plugin` runs
 * `beforeDispatch` on every wishlist controller. For guests it
 *   1. calls `Customer\Model\Session::authenticate()` -- sets HTTP 302 +
 *      `Location: /customer/account/login` on the response,
 *   2. raises the no-dispatch action flag, which makes
 *      `Magento\Framework\App\Action\Action::dispatch` *skip* `execute()`,
 *   3. enqueues the native error message "You must login or register to
 *      add items to your wishlist." into the message manager.
 *
 * Because step 2 prevents `execute()` from ever running, an
 * `afterExecute` plugin is silent on the guest path, which is why the
 * plugin hooks `afterDispatch` instead: it runs unconditionally. The
 * shared logic (guest reset, notification, OOB header counter) lives in
 * AbstractHtmxPlugin so the Remove plugin behaves identically.
 */
class AddPlugin extends AbstractHtmxPlugin
{
    /**
     * @param Add $subject
     * @param mixed $result Whatever execute() returned, or null when the
     *                     wishlist module's beforeDispatch raised the
     *                     no-dispatch flag for a guest.
     * @param RequestInterface $request
     * @return mixed
     */
    public function afterDispatch(Add $subject, $result, RequestInterface $request)
    {
        return $this->transform($result, $request);
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Wishlist\Controller\Index;

use Magento\Framework\App\RequestInterface;
use Magento\Wishlist\Controller\Index\Remove;

/**
 * HTMX transformer for the Remove-from-Wishlist controller.
 *
 * Lets the `<hyperion-list-toggle kind="wishlist">` component toggle a
 * product out of the wishlist without following the native redirect:
 * the response is the notification toast plus the out-of-band header
 * counter (which also carries the new product -> item map the toggles
 * read their state from). See AbstractHtmxPlugin.
 */
class RemovePlugin extends AbstractHtmxPlugin
{
    /**
     * @param Remove $subject
     * @param mixed $result
     * @param RequestInterface $request
     * @return mixed
     */
    public function afterDispatch(Remove $subject, $result, RequestInterface $request)
    {
        return $this->transform($result, $request);
    }
}

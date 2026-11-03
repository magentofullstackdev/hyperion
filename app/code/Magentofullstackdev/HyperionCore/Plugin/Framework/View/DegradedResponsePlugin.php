<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\View;

use Magento\Framework\App\Response\Http as HttpResponse;
use Magento\Framework\View\Layout;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;

/**
 * Keeps a page that printed a fallback out of the full page cache and Varnish.
 *
 * Runs when the page body is complete: nothing can set the public headers
 * again after it, and the built-in cache reads them later, after the result
 * has rendered. See DegradedResponse for why this cannot happen at the failure.
 */
class DegradedResponsePlugin
{
    public function __construct(
        private readonly DegradedResponse $degradedResponse,
        private readonly HttpResponse $response
    ) {
    }

    /**
     * @param Layout $subject
     * @param string $result
     * @return string
     */
    public function afterGetOutput(Layout $subject, $result)
    {
        if ($this->degradedResponse->isDegraded()) {
            $this->response->setNoCacheHeaders();
        }

        return $result;
    }
}

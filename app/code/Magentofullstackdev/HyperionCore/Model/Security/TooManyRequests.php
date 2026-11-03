<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Security;

use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;

/**
 * The answer of a rate limited request: HTTP 429, Retry-After of one window,
 * never cached (a shared cache must not serve the refusal to other clients)
 * and never indexed. A Raw result, because the Hyperion fragment controllers
 * declare `execute(): Raw` and an around plugin must honour that type.
 */
class TooManyRequests
{
    public function __construct(
        private readonly RawFactory $rawFactory
    ) {
    }

    public function create(): Raw
    {
        /** @var Raw $result */
        $result = $this->rawFactory->create();
        $result->setHttpResponseCode(429);
        $result->setHeader('Retry-After', (string) RateLimiter::WINDOW_SECONDS, true);
        $result->setHeader('Cache-Control', 'private, no-store', true);
        $result->setHeader('X-Robots-Tag', 'noindex, nofollow', true);
        $result->setHeader('Content-Type', 'text/plain; charset=UTF-8', true);
        $result->setContents('Too Many Requests');

        return $result;
    }
}

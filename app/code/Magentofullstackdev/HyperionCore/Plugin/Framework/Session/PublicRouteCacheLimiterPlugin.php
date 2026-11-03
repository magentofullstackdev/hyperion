<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\Session;

use Magentofullstackdev\HyperionCore\Model\PublicRouteRegistry;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Session\SessionManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Suppresses PHP's default session cache_limiter=nocache headers for
 * Hyperion public HTMX endpoints.
 *
 * PHP's session_start() emits three headers the moment the session opens:
 *   Pragma: no-cache
 *   Cache-Control: no-store, no-cache, must-revalidate, max-age=0
 *   Expires: -1
 *
 * These are written via PHP's internal header() buffer and survive
 * Magento's Response->setHeader(..., true) because Magento iterates the
 * Laminas header collection which is a SEPARATE buffer -- the runtime
 * ends up emitting both, and the last write (PHP's session headers) wins
 * on the wire.
 *
 * The canonical fix is to call session_cache_limiter('') BEFORE
 * session_start() runs. That tells PHP to emit nothing, leaving our
 * Response Cache-Control as the authoritative value.
 *
 * The plugin is scoped to paths registered in PublicRouteRegistry so
 * session-specific routes (cart, customer, checkout) keep the strict
 * nocache semantics they require.
 */
class PublicRouteCacheLimiterPlugin
{
    public function __construct(
        private readonly HttpRequest $request,
        private readonly PublicRouteRegistry $registry,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param SessionManagerInterface $subject
     * @return array
     */
    public function beforeStart(SessionManagerInterface $subject): array
    {
        try {
            if (headers_sent()) {
                return [];
            }

            $path = (string) $this->request->getPathInfo();
            if (!$this->registry->matches($path)) {
                return [];
            }

            // Empty cache_limiter = emit no Pragma/Cache-Control/Expires
            // during session_start(). PHP warns when the limiter is changed
            // on an already active session (re-entrant dispatch, internal
            // sub-requests), and the headers are out anyway by then.
            if (session_status() !== PHP_SESSION_ACTIVE) {
                session_cache_limiter('');
            }
        } catch (\Throwable $e) {
            $this->logger->warning(
                'Hyperion PublicRouteCacheLimiterPlugin failed -- ' . $e->getMessage()
            );
        }

        return [];
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model;

use Magento\Framework\Controller\Result\Raw;

/**
 * Cache-Control of Raw htmx fragment responses.
 *
 * `applyPrivate()` for anything that depends on the session (cart, customer,
 * wish list, compare). `applyPublic()` for session-agnostic fragments that an
 * edge cache may store; the route must also be registered in
 * PublicRouteRegistry. Call `applyPublic()` after the fragment has rendered:
 * a render that marked the request degraded (DegradedResponse) turns it into
 * a private answer.
 *
 * @api
 * @since 0.9.0
 */
interface CacheHeadersInterface
{
    /**
     * Mark the response as private and never stored.
     *
     * @param Raw $result
     * @return Raw
     */
    public function applyPrivate(Raw $result): Raw;

    /**
     * Mark the response as publicly cacheable for the given TTL (seconds),
     * private instead when the request is degraded.
     *
     * @param Raw $result
     * @param int $ttlSeconds
     * @return Raw
     */
    public function applyPublic(Raw $result, int $ttlSeconds): Raw;
}

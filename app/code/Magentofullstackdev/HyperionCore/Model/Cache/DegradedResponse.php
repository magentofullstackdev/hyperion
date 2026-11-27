<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Cache;

/**
 * This request printed a fallback instead of essential data (a price that
 * failed to render), so what it produces must not be stored.
 *
 * A flag and not a header set on the spot: every Pricing\Render block loads
 * its own layout while the page renders, and core's PageCache LayoutPlugin
 * sets the public headers again each time, after a failure as well. The flag
 * is read when the output is complete (`DegradedResponsePlugin`), by the
 * fragments (`CacheHeaders::applyPublic()`) and by the blocks that hold a
 * block cache. Shared instance: it lives for the request.
 *
 * Public contract: `mark()`, called by any code that prints a fallback
 * instead of essential data, and `isDegraded()`.
 *
 * @api
 * @since 0.9.0
 */
class DegradedResponse
{
    private bool $degraded = false;

    /**
     * Flag the request: its output is shown once and never stored.
     *
     * @return void
     */
    public function mark(): void
    {
        $this->degraded = true;
    }

    /**
     * Whether something in this request printed a fallback.
     *
     * @return bool
     */
    public function isDegraded(): bool
    {
        return $this->degraded;
    }
}

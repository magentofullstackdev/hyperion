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
 */
class DegradedResponse
{
    private bool $degraded = false;

    public function mark(): void
    {
        $this->degraded = true;
    }

    public function isDegraded(): bool
    {
        return $this->degraded;
    }
}

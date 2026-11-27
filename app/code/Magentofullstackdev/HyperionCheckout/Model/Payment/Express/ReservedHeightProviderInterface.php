<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment\Express;

/**
 * A provider whose button height follows its options (the PayPal smart
 * buttons stack one row per funding source): the pool asks it for the
 * height to reserve instead of using the entry's fixed `reserved_height`.
 * The answer is clamped to the range the pool accepts.
 *
 * Internal to the first-party entries; not part of the public API.
 */
interface ReservedHeightProviderInterface
{
    /**
     * Height in px the button occupies once rendered with these options.
     *
     * @param string $placement
     * @param array<string, mixed> $options the merged options of the entry
     * @return int
     */
    public function getReservedHeight(string $placement, array $options): int;
}

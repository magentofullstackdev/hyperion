<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Fixture;

/**
 * A getter a carrier module would add to the generated address extension
 * interface, for doubles built without that code.
 */
interface AddressExtrasAttributes
{
    /**
     * @return string|null
     */
    public function getSdiCode();
}

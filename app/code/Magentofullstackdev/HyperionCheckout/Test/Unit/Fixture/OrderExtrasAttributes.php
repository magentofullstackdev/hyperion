<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Fixture;

/**
 * The two getters `etc/extension_attributes.xml` adds to the generated
 * payment extension interface, for doubles built before that code exists.
 */
interface OrderExtrasAttributes
{
    /**
     * @return string|null
     */
    public function getHyperionOrderComment();

    /**
     * @return bool|null
     */
    public function getHyperionNewsletterSubscribe();
}

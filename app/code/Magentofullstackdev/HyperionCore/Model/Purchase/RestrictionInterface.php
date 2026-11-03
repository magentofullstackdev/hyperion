<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Purchase;

use Magento\Framework\Phrase;

/**
 * A rule that can take purchasing away from the current visitor.
 *
 * Implementations are registered on Magentofullstackdev\HyperionCore\Model\Purchase\Availability
 * through di.xml (argument `restrictions`). The theme never asks a rule
 * directly: templates read Magentofullstackdev\HyperionCore\ViewModel\Purchase, so a
 * module that gates sales (catalog mode, B2B approval, maintenance) only
 * ships a rule and no template.
 *
 * A rule must answer from request state that is part of the page cache
 * key (customer group, store, currency): the result is baked into
 * cached pages and block cache entries.
 */
interface RestrictionInterface
{
    /**
     * @return bool true when the current visitor must not buy
     */
    public function isRestricted(): bool;

    /**
     * Short notice shown where an Add to Cart button would have been.
     *
     * @return Phrase
     */
    public function getMessage(): Phrase;
}

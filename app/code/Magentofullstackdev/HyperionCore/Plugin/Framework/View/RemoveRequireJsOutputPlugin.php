<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\View;

use Magento\Framework\View\Layout;

/**
 * Drops the output element Magento_Persistent registers in PHP for guests
 * while `head.additional` exists: an `x-magento-init` script for a RequireJS
 * module. It is added after the layout is generated, so no layout removal
 * reaches it.
 */
class RemoveRequireJsOutputPlugin
{
    private const OUTPUT_ELEMENTS = ['persistent_initial_configs'];

    /**
     * @param Layout $subject
     * @return void
     */
    public function beforeGetOutput(Layout $subject): void
    {
        foreach (self::OUTPUT_ELEMENTS as $name) {
            $subject->removeOutputElement($name);
        }
    }
}

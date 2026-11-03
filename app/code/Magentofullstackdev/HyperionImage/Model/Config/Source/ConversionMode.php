<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionImage\Model\Config;

/**
 * Admin source model for the conversion-mode dropdown.
 *
 * Mirrors the `MODE_*` constants on `Model\Config` so a renamed
 * mode lands in both the dropdown and the consumer code through a
 * single change to the constants.
 */
class ConversionMode implements OptionSourceInterface
{
    /**
     * Build the option list shown in the admin dropdown.
     *
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => Config::MODE_QUEUE, 'label' => __('Queue (recommended) -- async via cron consumer')],
            ['value' => Config::MODE_SYNC,  'label' => __('Sync -- immediate (slow first render; only for envs without cron)')],
        ];
    }
}

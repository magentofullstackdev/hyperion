<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Framework\Data\OptionSourceInterface;

class BadgeColor implements OptionSourceInterface
{
    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => 'primary', 'label' => __('Primary')],
            ['value' => 'danger', 'label' => __('Danger (sale)')],
            ['value' => 'success', 'label' => __('Success (new)')],
            ['value' => 'warning', 'label' => __('Warning (hot)')],
            ['value' => 'neutral', 'label' => __('Neutral')],
        ];
    }
}

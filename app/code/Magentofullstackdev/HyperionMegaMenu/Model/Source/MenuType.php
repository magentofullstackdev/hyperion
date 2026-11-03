<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;

class MenuType implements OptionSourceInterface
{
    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => Group::TYPE_MEGA_HORIZONTAL, 'label' => __('Horizontal mega menu (header)')],
            ['value' => Group::TYPE_H_LIST, 'label' => __('Horizontal list with dropdowns')],
            ['value' => Group::TYPE_V_LIST, 'label' => __('Vertical list (widget, footer)')],
        ];
    }
}

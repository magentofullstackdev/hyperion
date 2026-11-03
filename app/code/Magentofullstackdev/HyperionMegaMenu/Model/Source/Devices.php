<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;

class Devices implements OptionSourceInterface
{
    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => Group::DEVICES_BOTH, 'label' => __('Desktop and mobile')],
            ['value' => Group::DEVICES_DESKTOP, 'label' => __('Desktop only')],
            ['value' => Group::DEVICES_MOBILE, 'label' => __('Mobile only')],
        ];
    }
}

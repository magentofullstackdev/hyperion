<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionCatalog\Model\InfiniteScroll as Mode;

class InfiniteScroll implements OptionSourceInterface
{
    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => Mode::MODE_DISABLED, 'label' => __('Disabled')],
            ['value' => Mode::MODE_BUTTON, 'label' => __('Load more button')],
            ['value' => Mode::MODE_SCROLL, 'label' => __('Automatic on scroll')],
        ];
    }
}

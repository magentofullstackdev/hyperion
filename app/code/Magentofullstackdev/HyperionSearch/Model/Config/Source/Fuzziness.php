<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;

class Fuzziness implements OptionSourceInterface
{
    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => Config::FUZZINESS_OFF, 'label' => __('Off (exact matches only)')],
            ['value' => Config::FUZZINESS_AUTO, 'label' => __('AUTO (recommended)')],
            ['value' => '1', 'label' => __('1 edit')],
            ['value' => '2', 'label' => __('2 edits')],
        ];
    }
}

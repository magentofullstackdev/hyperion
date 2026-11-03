<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionImage\Model\Config;

/**
 * Admin source model for the encoder-preference dropdown.
 *
 * `Auto` is the operational default: the EncoderFactory probes for
 * Imagick first (it has wider format support -- AVIF in particular is
 * Imagick-only on this PHP build) and falls back to GD when Imagick
 * is unavailable. The other two values are diagnostic overrides.
 */
class Encoder implements OptionSourceInterface
{
    /**
     * Build the option list shown in the admin dropdown.
     *
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => Config::ENCODER_AUTO,    'label' => __('Auto (Imagick if available, else GD)')],
            ['value' => Config::ENCODER_IMAGICK, 'label' => __('Imagick (force)')],
            ['value' => Config::ENCODER_GD,      'label' => __('GD (force)')],
        ];
    }
}

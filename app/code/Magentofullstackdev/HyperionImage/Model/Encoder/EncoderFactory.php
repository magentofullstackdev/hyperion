<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Encoder;

use Magentofullstackdev\HyperionImage\Exception\EncoderException;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Format\FormatInterface;

/**
 * Picks the right encoder per format based on the admin
 * `hyperion_image/encoder/preference` setting and the runtime
 * capability check on each backend.
 *
 *   - `auto`     -- Imagick first (broader format support), GD fallback.
 *   - `imagick`  -- force Imagick; throw if it doesn't support the format.
 *   - `gd`       -- force GD; throw if it doesn't support the format.
 *
 * Throws when nothing supports the requested format so the caller
 * (Converter) can skip / log rather than write a broken file.
 */
class EncoderFactory
{
    public function __construct(
        private readonly Config $config,
        private readonly ImagickEncoder $imagickEncoder,
        private readonly GdEncoder $gdEncoder
    ) {
    }

    public function get(FormatInterface $format): EncoderInterface
    {
        $preference = $this->config->getEncoderPreference();

        if ($preference === Config::ENCODER_IMAGICK) {
            if (!$this->imagickEncoder->supports($format)) {
                throw new EncoderException(
                    'Imagick encoder requested but does not support ' . $format->getName()
                );
            }
            return $this->imagickEncoder;
        }

        if ($preference === Config::ENCODER_GD) {
            if (!$this->gdEncoder->supports($format)) {
                throw new EncoderException(
                    'GD encoder requested but does not support ' . $format->getName()
                );
            }
            return $this->gdEncoder;
        }

        // auto -- prefer Imagick (AVIF support is Imagick-only on most stock PHP builds).
        if ($this->imagickEncoder->supports($format)) {
            return $this->imagickEncoder;
        }
        if ($this->gdEncoder->supports($format)) {
            return $this->gdEncoder;
        }
        throw new EncoderException(
            'No encoder supports ' . $format->getName() . ' on this installation.'
        );
    }
}

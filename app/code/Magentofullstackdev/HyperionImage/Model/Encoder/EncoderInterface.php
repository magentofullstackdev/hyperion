<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Encoder;

use Magentofullstackdev\HyperionImage\Exception\EncoderException;
use Magentofullstackdev\HyperionImage\Model\Format\FormatInterface;

/**
 * Contract for a backend that converts a JPG/PNG source to a
 * modern format target. Two implementations ship -- `ImagickEncoder`
 * (preferred when the extension is loaded; supports both WebP and
 * AVIF) and `GdEncoder` (fallback; AVIF requires libavif at PHP
 * compile time and is not present on every distro).
 *
 * Encoders MUST write atomically -- encode to a `<target>.tmp`
 * sibling and rename into place -- so the storefront never serves
 * a half-written file when conversion crashes mid-flight.
 */
interface EncoderInterface
{
    /**
     * Convert the source image to the target format, writing the
     * result at `$targetPath` on success. Returns true on success;
     * implementations must throw `EncoderException` for hard
     * failures rather than returning false.
     *
     * @throws EncoderException when the source can't be read,
     *         the target can't be written, or the format isn't
     *         supported on the current PHP installation.
     */
    /**
     * Encodes the source into the target format; a positive `$maxWidth`
     * smaller than the source width scales the image down to it, keeping
     * the aspect ratio (a larger value leaves the size alone).
     */
    public function encode(
        string $sourcePath,
        string $targetPath,
        FormatInterface $format,
        int $quality,
        int $maxWidth = 0
    ): bool;

    /**
     * True if this encoder can handle the given format on the
     * current PHP installation (extension loaded, format
     * delegate compiled in).
     */
    public function supports(FormatInterface $format): bool;
}

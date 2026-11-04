<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Encoder;

use Imagick;
use ImagickException;
use Magentofullstackdev\HyperionImage\Exception\EncoderException;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\FormatInterface;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;

/**
 * Imagick-backed encoder. Preferred over GD when the extension is
 * loaded because:
 *   - AVIF is supported through ImageMagick's libheif delegate; GD
 *     needs `imageavif()` which is missing from many distros.
 *   - Quality / speed tuning (the `heic:speed` option) is exposed
 *     for AVIF, where GD only takes a quality int.
 *
 * The source is pinged first (`Imagick::pingImage` reads the header
 * only) and the pixel budget of `hyperion_image/general/max_pixels`
 * is checked BEFORE `readImage` decodes it, so a decompression bomb
 * never allocates its canvas.
 *
 * Writes atomically: encodes to `<target>.tmp` then renames into
 * place so a crash mid-encode never leaves a half-written file
 * for the web server to serve. One `finally` releases the Imagick
 * object and removes the `.tmp` file when it is still on disk (that
 * is, when the rename did not happen).
 */
class ImagickEncoder implements EncoderInterface
{
    public function __construct(
        private readonly Config $config
    ) {
    }

    public function supports(FormatInterface $format): bool
    {
        if (!extension_loaded('imagick')) {
            return false;
        }
        $magickFormat = match (true) {
            $format instanceof WebpFormat => 'WEBP',
            $format instanceof AvifFormat => 'AVIF',
            default => null,
        };
        if ($magickFormat === null) {
            return false;
        }
        return !empty(Imagick::queryFormats($magickFormat));
    }

    public function encode(
        string $sourcePath,
        string $targetPath,
        FormatInterface $format,
        int $quality,
        int $maxWidth = 0
    ): bool {
        if (!file_exists($sourcePath)) {
            throw new EncoderException('Source file not found: ' . $sourcePath);
        }

        $tmpPath = $targetPath . '.tmp';
        $image = new Imagick();
        // Imagick reports through exceptions; the handler only keeps the
        // E_WARNING of a refused rename out of the log (phpcs forbids `@`).
        set_error_handler(static fn (): bool => true);
        try {
            // Header only: width and height without decoding the pixels.
            $image->pingImage($sourcePath);
            $this->assertWithinPixelBudget($sourcePath, $image->getImageWidth(), $image->getImageHeight());
            $image->clear();

            $image->readImage($sourcePath);
            if ($maxWidth > 0 && $image->getImageWidth() > $maxWidth) {
                $image->resizeImage($maxWidth, 0, Imagick::FILTER_LANCZOS, 1);
            }
            $image->setImageFormat($format->getImagickFormat());
            $image->setImageCompressionQuality($quality);

            if ($format instanceof AvifFormat) {
                // AVIF speed/size knob -- 0 (slow/best) to 9 (fast/worst).
                // 6 is the documented balanced default in libavif.
                $image->setOption('heic:speed', '6');
            }

            $image->writeImage($tmpPath);

            if (!rename($tmpPath, $targetPath)) {
                throw new EncoderException('Atomic rename failed: ' . $targetPath);
            }

            return true;
        } catch (ImagickException $e) {
            // Unreadable or truncated source, unwritable target: the same
            // diagnostic path as GD's "Cannot read image", logged as a
            // conversion warning by the Converter.
            throw new EncoderException(
                'Imagick failed for ' . $sourcePath . ': ' . $e->getMessage(),
                (int) $e->getCode(),
                $e
            );
        } finally {
            $image->clear();
            $image->destroy();
            // Still on disk only when the rename did not happen: a failed
            // or partial write, a refused rename, or an exception in between.
            $this->safeUnlink($tmpPath);
            restore_error_handler();
        }
    }

    /**
     * Refuse a source whose header declares no canvas or more pixels
     * than the configured budget (0 = no budget).
     *
     * @throws EncoderException
     */
    private function assertWithinPixelBudget(string $sourcePath, int $width, int $height): void
    {
        if ($width <= 0 || $height <= 0) {
            throw new EncoderException('Image declares no canvas: ' . $sourcePath);
        }
        $maxPixels = $this->config->getMaxPixels();
        if ($maxPixels > 0 && $width * $height > $maxPixels) {
            throw new EncoderException(sprintf(
                'Image exceeds the pixel budget (%d x %d = %d > %d): %s',
                $width,
                $height,
                $width * $height,
                $maxPixels,
                $sourcePath
            ));
        }
    }

    /**
     * Best-effort delete used to clean up `<target>.tmp` partials
     * after a failure path. We ignore unlink's return code rather
     * than masking the original error.
     */
    private function safeUnlink(string $path): void
    {
        if (!is_file($path)) {
            return;
        }
        set_error_handler(static fn (): bool => true);
        try {
            unlink($path);
        } finally {
            restore_error_handler();
        }
    }
}

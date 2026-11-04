<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Encoder;

use GdImage;
use Magentofullstackdev\HyperionImage\Exception\EncoderException;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\FormatInterface;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;

/**
 * GD-backed fallback encoder. Used when the Imagick extension is
 * unavailable or when the admin has explicitly forced GD.
 *
 * WebP support is broadly available in the bundled GD on PHP 8.x.
 * AVIF additionally requires libavif at PHP compile time and the
 * `imageavif()` function -- many distro PHP packages ship without
 * it, so `supports(AvifFormat)` does the runtime probe rather than
 * trusting `gd_info()` alone.
 *
 * Only JPEG and PNG sources are decoded: `PathResolver` admits no
 * other extension, so a file whose header says otherwise is refused.
 * The header is read first (`getimagesize`) and the pixel budget of
 * `hyperion_image/general/max_pixels` is checked BEFORE
 * `imagecreatefrom*` allocates the canvas: a decompression bomb (a
 * few kilobytes that declare a 30000 x 30000 canvas) never reaches
 * the decoder.
 *
 * Atomic write semantics match `ImagickEncoder` -- encode to a
 * `<target>.tmp` sibling then rename into place. One `finally`
 * releases the GD image and removes the `.tmp` file when it is still
 * on disk (that is, when the rename did not happen).
 */
class GdEncoder implements EncoderInterface
{
    public function __construct(
        private readonly Config $config
    ) {
    }

    public function supports(FormatInterface $format): bool
    {
        if (!extension_loaded('gd')) {
            return false;
        }
        $info = gd_info();
        return match (true) {
            $format instanceof WebpFormat => !empty($info['WebP Support']) && function_exists('imagewebp'),
            $format instanceof AvifFormat => !empty($info['AVIF Support']) && function_exists('imageavif'),
            default => false,
        };
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
        $image = null;

        // getimagesize / imagecreatefrom* / image* writers emit E_WARNING
        // on bad input or an unwritable target. Wrap the whole encode in
        // a temporary error handler instead of `@` suppression (Magento
        // phpcs forbids the silence operator) so we can surface a clean
        // EncoderException without polluting the log with the underlying
        // "could not read image" warnings.
        set_error_handler(static fn (): bool => true);
        try {
            $info = getimagesize($sourcePath);
            if ($info === false) {
                throw new EncoderException('Cannot read image: ' . $sourcePath);
            }
            $this->assertWithinPixelBudget($sourcePath, (int) $info[0], (int) $info[1]);

            $image = match ($info[2]) {
                IMAGETYPE_JPEG => imagecreatefromjpeg($sourcePath),
                IMAGETYPE_PNG => imagecreatefrompng($sourcePath),
                default => false,
            };
            if (!$image instanceof GdImage) {
                $image = null;
                throw new EncoderException('Failed to load image as GD resource: ' . $sourcePath);
            }

            // Preserve PNG alpha channel for output formats that support it.
            if ($info[2] === IMAGETYPE_PNG) {
                imagepalettetotruecolor($image);
                imagealphablending($image, true);
                imagesavealpha($image, true);
            }

            if ($maxWidth > 0 && (int) $info[0] > $maxWidth) {
                $scaled = imagescale($image, $maxWidth, -1, IMG_BICUBIC);
                if (!$scaled instanceof GdImage) {
                    throw new EncoderException('GD resize failed for ' . $sourcePath);
                }
                $image = $scaled;
                if ($info[2] === IMAGETYPE_PNG) {
                    imagealphablending($image, true);
                    imagesavealpha($image, true);
                }
            }

            $ok = match (true) {
                $format instanceof WebpFormat => imagewebp($image, $tmpPath, $quality),
                $format instanceof AvifFormat => imageavif($image, $tmpPath, $quality),
                default => false,
            };
            if (!$ok) {
                throw new EncoderException('GD encode failed for ' . $format->getName() . ': ' . $targetPath);
            }

            if (!rename($tmpPath, $targetPath)) {
                throw new EncoderException('Atomic rename failed: ' . $targetPath);
            }

            return true;
        } finally {
            // A GdImage is freed with its last reference (imagedestroy() is a no-op since
            // PHP 8.0 and deprecated in 8.5).
            $image = null;
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
     * after a failure path. The temp file may or may not exist
     * (the encoder may have failed before writing it); we ignore
     * the unlink return code rather than masking the underlying
     * encode-or-rename error.
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

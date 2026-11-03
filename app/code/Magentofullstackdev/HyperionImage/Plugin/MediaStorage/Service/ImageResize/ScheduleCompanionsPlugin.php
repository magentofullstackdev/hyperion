<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Plugin\MediaStorage\Service\ImageResize;

use Generator;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Filesystem;
use Magento\MediaStorage\Service\ImageResize;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Service\CompanionScheduler;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Schedules WebP / AVIF companions for the cache files core's
 * `Magento\MediaStorage\Service\ImageResize` writes.
 *
 * `ScheduleConversionPlugin` only sees `Product\Image::saveFile()`, the
 * on-demand resize of the Luma-style image helper. Hyperion builds its
 * image URLs through `UrlBuilder`, which never resizes, so the gallery
 * and tile sizes of a Hyperion store come from this service instead:
 * `bin/magento catalog:images:resize` (`resizeFromThemes`), the product
 * save observer and the `media.storage.catalog.image.resize` consumer
 * (`resizeFromImageName`), and `get.php` for a missing cache file (same
 * method). The service writes through the image adapter, so none of
 * those files would ever reach the conversion pipeline (the PDP
 * gallery image would never get a companion).
 *
 * The service exposes no list of the files it wrote: `resizeFromImageName`
 * returns nothing and `resizeFromThemes` yields the original image name
 * per product image. Both plugins therefore look the resized sizes up
 * the way the cache is laid out, `catalog/product/cache/<hash><image
 * name>` for every hash directory, and hand every file that lacks an
 * enabled companion to `CompanionScheduler`. A file that already has
 * its companions is skipped (the service does not rewrite an existing
 * cache file, so an existing companion is current), which keeps a
 * second run of the command free of duplicate messages.
 *
 * The generator of `resizeFromThemes` is wrapped lazily: each image is
 * scheduled when the command consumes its entry, right after its sizes
 * were written, and the entries are yielded unchanged (the command
 * reads `current()` for the total before iterating).
 */
class ScheduleCompanionsPlugin
{
    private const CACHE_PATH = 'catalog/product/cache';

    public function __construct(
        private readonly Config $config,
        private readonly Filesystem $filesystem,
        private readonly CompanionScheduler $scheduler,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param ImageResize $subject
     * @param mixed $result
     * @param string $originalImageName gallery value, e.g. `/m/b/mb01-blue-0.jpg`
     * @return mixed unchanged
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterResizeFromImageName(ImageResize $subject, $result, string $originalImageName)
    {
        $this->scheduleFor($originalImageName);

        return $result;
    }

    /**
     * @param ImageResize $subject
     * @param Generator $result
     * @return Generator the same entries, each scheduled before it is yielded
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterResizeFromThemes(ImageResize $subject, Generator $result): Generator
    {
        return $this->wrap($result);
    }

    private function wrap(Generator $inner): Generator
    {
        foreach ($inner as $info => $count) {
            if (is_array($info) && isset($info['filename']) && (string) ($info['error'] ?? '') === '') {
                $this->scheduleFor((string) $info['filename']);
            }
            yield $info => $count;
        }
    }

    /**
     * Schedule the companions of every cache file of the given image.
     * Returns the number of files dispatched; never throws.
     */
    private function scheduleFor(string $originalImageName): int
    {
        if (!$this->config->isEnabled()) {
            return 0;
        }
        $imageName = '/' . ltrim($originalImageName, '/');
        if ($imageName === '/' || str_contains($imageName, '..')) {
            return 0;
        }

        $dispatched = 0;
        try {
            $mediaDir = $this->filesystem->getDirectoryRead(DirectoryList::MEDIA);
            if (!$mediaDir->isDirectory(self::CACHE_PATH)) {
                return 0;
            }
            foreach ($mediaDir->read(self::CACHE_PATH) as $entry) {
                $relative = rtrim((string) $entry, '/') . $imageName;
                if (!$mediaDir->isFile($relative)) {
                    continue;
                }
                if ($this->scheduler->scheduleIfMissing($mediaDir->getAbsolutePath($relative))) {
                    $dispatched++;
                }
            }
        } catch (Throwable $e) {
            // The resize succeeded; a scheduling problem must not fail the command, the observer or get.php.
            $this->logger->warning(
                'HyperionImage: scheduling companions after resize failed for ' . $originalImageName
                . ': ' . $e->getMessage()
            );
        }

        return $dispatched;
    }
}

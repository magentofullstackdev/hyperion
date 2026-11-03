<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Plugin\Catalog\Helper\Image;

use FilesystemIterator;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Filesystem;
use Psr\Log\LoggerInterface;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Throwable;

/**
 * Hooks `Magento\Catalog\Helper\Image::clearCache` so that whenever
 * Magento wipes the catalog product image cache, our companion
 * `.webp` / `.avif` files are wiped alongside it.
 *
 * Why scope by extension rather than by source file: the helper
 * doesn't tell us which originals were cleared, only that the
 * cache directory was emptied. So we walk the dir tree and remove
 * any leftover `.webp` / `.avif` files. The directory walk is
 * STRICTLY scoped to `pub/media/catalog/product/cache/` -- never
 * a parent dir, never a wildcard above it. Misconfiguration that
 * pointed `mediaDir` elsewhere would still constrain to the
 * `catalog/product/cache` sub-tree.
 */
class ClearCachePlugin
{
    private const CACHE_PATH = 'catalog/product/cache';

    public function __construct(
        private readonly Filesystem $filesystem,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param ImageHelper $subject
     * @param mixed $result
     * @return mixed unchanged -- passes through Magento's original return.
     */
    public function afterClearCache(ImageHelper $subject, $result)
    {
        try {
            $mediaDir = $this->filesystem->getDirectoryWrite(DirectoryList::MEDIA);
            if (!$mediaDir->isDirectory(self::CACHE_PATH)) {
                return $result;
            }

            $absCachePath = $mediaDir->getAbsolutePath(self::CACHE_PATH);
            $removed = 0;
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($absCachePath, FilesystemIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                $name = $file->getFilename();
                if (str_ends_with($name, '.webp') || str_ends_with($name, '.avif')) {
                    if ($this->safeUnlink($file->getPathname())) {
                        $removed++;
                    }
                }
            }

            if ($removed > 0) {
                $this->logger->info(
                    sprintf('HyperionImage: cleared %d companion files on cache flush', $removed)
                );
            }
        } catch (Throwable $e) {
            $this->logger->warning('HyperionImage: companion cleanup error: ' . $e->getMessage());
        }

        return $result;
    }

    private function safeUnlink(string $path): bool
    {
        $previousHandler = set_error_handler(static fn (): bool => true);
        try {
            return unlink($path);
        } finally {
            restore_error_handler();
        }
    }
}

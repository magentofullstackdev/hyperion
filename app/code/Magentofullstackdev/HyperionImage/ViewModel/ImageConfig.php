<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\ViewModel;

use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Filesystem;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Service\CompanionScheduler;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * View model for `.phtml` consumers -- exposes the format-enable
 * flags AND a per-image existence check so templates only emit
 * `<source>` when the companion file is actually on disk.
 *
 * Why per-image existence matters: browsers do **not** fall through
 * `<picture>` to the `<img>` fallback on a 404. Once a `<source>` is
 * selected by `type` capability, the browser commits -- and a missing
 * companion file produces a broken image. The only way to keep the
 * `<img>` JPG as the safe baseline is to omit the `<source>` tag
 * entirely when the companion isn't available yet.
 *
 * Cost: one `file_exists()` per image per render. With Tailwind/PHP
 * opcache hot, a category page with 12 tiles costs ~12 stat() calls.
 * Per-request memoised below so the same URL only stats once.
 *
 * Safety net: a companion that is missing while the source exists is
 * handed to `CompanionScheduler::scheduleOnceIfMissing()` (queue or
 * sync per the admin mode, one attempt a day per file), so the next
 * render of the page ships the `<source>` instead of staying without
 * one forever (the gallery sizes written by `catalog:images:resize`
 * otherwise never get a companion).
 */
class ImageConfig implements ArgumentInterface
{
    /** @var array<string, bool> per-request stat-cache, keyed by absolute path */
    private array $existsCache = [];

    /** @var string|null cached media URL prefix (one resolution per request) */
    private ?string $mediaUrlPrefix = null;

    /** @var array<string, array{int, int}|null> */
    private array $sizeCache = [];

    public function __construct(
        private readonly Config $config,
        private readonly Filesystem $filesystem,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger,
        private readonly CompanionScheduler $companionScheduler
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->config->isEnabled();
    }

    public function isWebpEnabled(): bool
    {
        return $this->isEnabled() && $this->config->isWebpEnabled();
    }

    public function isAvifEnabled(): bool
    {
        return $this->isEnabled() && $this->config->isAvifEnabled();
    }

    /**
     * Companion URL convention: append `.<ext>` to the source URL.
     * Always returns the calculated URL -- caller MUST check
     * `hasWebpCompanion()` / `hasAvifCompanion()` before emitting
     * the `<source>` tag, since the URL may correspond to a missing
     * file on disk.
     */
    public function getWebpUrl(string $sourceUrl): string
    {
        return $sourceUrl . '.webp';
    }

    public function getAvifUrl(string $sourceUrl): string
    {
        return $sourceUrl . '.avif';
    }

    /**
     * True iff the WebP companion exists on disk AND WebP is admin-
     * enabled. Returns false when WebP is disabled, when the source
     * URL doesn't live under `/media/` (defensive -- non-media
     * URLs aren't ours to optimize), or when the file isn't there
     * yet (fresh upload, queue not drained).
     */
    public function hasWebpCompanion(string $sourceUrl): bool
    {
        if (!$this->isWebpEnabled()) {
            return false;
        }
        return $this->companionExists($sourceUrl, 'webp');
    }

    public function hasAvifCompanion(string $sourceUrl): bool
    {
        if (!$this->isAvifEnabled()) {
            return false;
        }
        return $this->companionExists($sourceUrl, 'avif');
    }

    /**
     * True when `<source>.<extension>` exists next to the local source
     * file. A miss for an existing source schedules the conversion once
     * (see the class doc) so a later render finds the companion.
     */
    private function companionExists(string $sourceUrl, string $extension): bool
    {
        $sourcePath = $this->urlToAbsolutePath($sourceUrl);
        if ($sourcePath === null) {
            return false;
        }
        $absolutePath = $sourcePath . '.' . $extension;
        if (isset($this->existsCache[$absolutePath])) {
            return $this->existsCache[$absolutePath];
        }
        try {
            $exists = file_exists($absolutePath) && is_file($absolutePath);
            if (!$exists) {
                $this->companionScheduler->scheduleOnceIfMissing($sourcePath);
            }
        } catch (Throwable $e) {
            $this->logger->error(
                'ImageConfig::companionExists failed for ' . $absolutePath,
                ['exception' => $e]
            );
            $exists = false;
        }
        return $this->existsCache[$absolutePath] = $exists;
    }

    /**
     * Map a public URL like
     * `https://hyperion.local/media/catalog/product/cache/abc/foo.jpg.webp`
     * back to the absolute filesystem path under `pub/media/`.
     * Returns null when the URL doesn't sit under the media root --
     * e.g. theme assets or cross-origin URLs aren't ours.
     */
    /**
     * The pixel size of a local media image (no layout shift): `[width, height]`
     * for a URL under the media root whose file exists and is an image, null
     * otherwise (remote images, theme assets, missing files). Cached for the
     * request; the CMS output that carries the result is cached by the page.
     *
     * @return array{int, int}|null
     */
    public function getIntrinsicSize(string $url): ?array
    {
        if (isset($this->sizeCache[$url]) || array_key_exists($url, $this->sizeCache)) {
            return $this->sizeCache[$url];
        }
        $size = null;
        try {
            $path = $this->urlToAbsolutePath($url);
            // Raster formats getimagesize() reads; anything else (SVG, a missing or foreign file) has no size here.
            $extension = strtolower((string) pathinfo((string) parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
            if ($path !== null && in_array($extension, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'], true) && is_file($path)) {
                // phpcs:ignore Magento2.Functions.DiscouragedFunction
                $info = getimagesize($path);
                if (is_array($info) && (int) $info[0] > 0 && (int) $info[1] > 0) {
                    $size = [(int) $info[0], (int) $info[1]];
                }
            }
        } catch (Throwable $e) {
            $this->logger->error('ImageConfig::getIntrinsicSize failed', ['exception' => $e, 'url' => $url]);
        }
        $this->sizeCache[$url] = $size;

        return $size;
    }

    private function urlToAbsolutePath(string $url): ?string
    {
        $prefix = $this->getMediaUrlPrefix();
        if ($prefix === '' || !str_starts_with($url, $prefix)) {
            return null;
        }
        $relative = ltrim(substr($url, strlen($prefix)), '/');
        if ($relative === '' || str_contains($relative, '..')) {
            return null;
        }
        $mediaDir = $this->filesystem->getDirectoryRead(DirectoryList::MEDIA);
        return $mediaDir->getAbsolutePath($relative);
    }

    private function getMediaUrlPrefix(): string
    {
        if ($this->mediaUrlPrefix !== null) {
            return $this->mediaUrlPrefix;
        }
        try {
            $store = $this->storeManager->getStore();
            $url = $store instanceof Store ? $store->getBaseUrl(UrlInterface::URL_TYPE_MEDIA) : '';
            $this->mediaUrlPrefix = rtrim((string) $url, '/');
        } catch (Throwable $e) {
            $this->logger->error(
                'ImageConfig::getMediaUrlPrefix failed to resolve the media base URL',
                ['exception' => $e]
            );
            $this->mediaUrlPrefix = '';
        }
        return $this->mediaUrlPrefix;
    }
}

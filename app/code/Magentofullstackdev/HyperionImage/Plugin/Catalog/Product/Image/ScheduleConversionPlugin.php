<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Plugin\Catalog\Product\Image;

use Magento\Catalog\Model\Product\Image as ProductImage;
use Magento\Catalog\Model\View\Asset\Image as ImageAsset;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\PathResolver;
use Magentofullstackdev\HyperionImage\Service\ConversionService;
use Psr\Log\LoggerInterface;
use ReflectionClass;
use Throwable;

/**
 * Hooks `Magento\Catalog\Model\Product\Image::saveFile` so every
 * cached JPG/PNG written to `pub/media/catalog/product/cache/...`
 * triggers WebP/AVIF generation.
 *
 * Architecture contract:
 *   - JPG is the foundation; Magento writes it via stock cache flow.
 *   - WebP/AVIF are async optimizations layered on top.
 *   - The browser reads `<picture>` and falls back to the `<img>`
 *     JPG naturally on a companion 404 -- no JS, no controller.
 *
 * Per the admin `conversion_mode` setting:
 *   - `queue` (default) -- publish; cron consumer encodes async.
 *   - `sync`            -- encode in-process (slow first render;
 *                         only for environments without cron).
 *
 * Two safety filters before dispatch:
 *   1. Skip placeholders (`Magento_Catalog/images/product/placeholder/...`):
 *      converting the placeholder PNG produces companions that mask
 *      product-not-yet-resized cases and pollute cache.
 *   2. Delete existing companions for the freshly-written JPG. The
 *      `afterSaveFile` hook means Magento just rewrote the source,
 *      so any pre-existing `.webp`/`.avif` is from an older bytestream
 *      and will read mismatched content if served. The 404 between
 *      delete and consumer-run is intentional -- the browser falls
 *      back to the new JPG naturally.
 *
 * Magento's `saveFile()` writes to `$this->imageAsset->getPath()`
 * (private property on `ProductImage`). The legacy `getNewFile()`
 * accessor is set elsewhere in the cache pipeline and is not
 * populated by `saveFile()` itself, so reading it returns null in
 * this hook. We pull the path via Reflection -- narrow, localised
 * read of a private property; no behavioural change to Magento.
 */
class ScheduleConversionPlugin
{
    public function __construct(
        private readonly Config $config,
        private readonly ConversionService $conversionService,
        private readonly PathResolver $pathResolver,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param ProductImage $subject
     * @param mixed $result
     * @return mixed same as the original return for plugin compatibility
     */
    public function afterSaveFile(ProductImage $subject, $result)
    {
        if (!$this->config->isEnabled()) {
            return $result;
        }

        try {
            if ($this->isPlaceholder($subject)) {
                return $result;
            }

            $absolutePath = $this->resolveSavedPath($subject);
            if ($absolutePath === null) {
                return $result;
            }

            // Invalidate stale companions so the browser sees a 404
            // until the consumer regenerates against the new JPG.
            // The 404 path is the design -- `<picture>` falls back
            // to `<img src="...jpg">` natively.
            $this->deleteCompanions($absolutePath);

            $this->dispatch($absolutePath);
        } catch (Throwable $e) {
            // Image cache writes must NEVER fail because of WebP plugin --
            // log and let the original path return to the caller.
            $this->logger->warning('HyperionImage: schedule failed: ' . $e->getMessage());
        }

        return $result;
    }

    /**
     * True when the cached image originates from Magento's product
     * placeholder (no real product image uploaded). Converting the
     * placeholder produces .webp companions that would persist past
     * the moment the merchant uploads a real image, so we skip.
     */
    private function isPlaceholder(ProductImage $subject): bool
    {
        $baseFile = $subject->getBaseFile();
        if (!$baseFile) {
            return true;
        }
        if (str_contains($baseFile, '/placeholder/')) {
            return true;
        }
        if (preg_match('#Magento_Catalog/images/product/placeholder#', $baseFile) === 1) {
            return true;
        }
        return false;
    }

    private function dispatch(string $absolutePath): void
    {
        // Queue or sync per the admin mode, decided in one place for every trigger.
        $this->conversionService->dispatch($absolutePath);
    }

    /**
     * Best-effort delete of every companion produced for the given
     * source. Errors are swallowed -- failure means the next consumer
     * pass will overwrite via atomic-rename anyway.
     */
    private function deleteCompanions(string $sourcePath): void
    {
        foreach ($this->pathResolver->getCompanionPaths($sourcePath) as $companion) {
            if (!file_exists($companion)) {
                continue;
            }
            $previousHandler = set_error_handler(static fn (): bool => true);
            try {
                unlink($companion);
            } finally {
                restore_error_handler();
            }
        }
    }

    /**
     * Resolve the absolute path Magento just wrote to. Reads the
     * private `imageAsset` on the Image subject via Reflection
     * because the public accessor (`getNewFile`) is not populated
     * by `saveFile()` on this Magento version.
     */
    private function resolveSavedPath(ProductImage $subject): ?string
    {
        $imageAsset = $this->readImageAsset($subject);
        if (!$imageAsset instanceof ImageAsset) {
            return null;
        }

        $path = $imageAsset->getPath();
        if (!is_string($path) || $path === '') {
            return null;
        }
        if (!file_exists($path)) {
            return null;
        }
        return $path;
    }

    private function readImageAsset(ProductImage $subject): ?object
    {
        // Walk the inheritance chain because `imageAsset` is declared on
        // the concrete class -- `ReflectionClass::getProperty()` on a
        // child that doesn't redeclare it would throw otherwise.
        $reflection = new ReflectionClass($subject);
        while ($reflection !== false) {
            if ($reflection->hasProperty('imageAsset')) {
                $property = $reflection->getProperty('imageAsset');
                $value = $property->getValue($subject);
                return is_object($value) ? $value : null;
            }
            $reflection = $reflection->getParentClass();
        }
        return null;
    }
}

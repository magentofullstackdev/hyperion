<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model;

use Magentofullstackdev\HyperionImage\Model\Format\FormatInterface;

/**
 * Translates Magento product-cache image paths into companion paths
 * for modern formats. Convention: append the new extension to the
 * existing filename (`puma-shoe.jpg` -> `puma-shoe.jpg.webp`,
 * `puma-shoe.jpg.avif`) rather than replacing it.
 * Why append rather than replace?
 *   - Keeps the original JPG path intact for browsers that don't
 *     accept the modern format.
 *   - Matches the Nginx `try_files $uri$webp_suffix $uri` rewrite
 *     pattern documented as a Strategy 2 follow-up -- a single rule
 *     can transparently serve `.jpg.webp` for clients that send
 *     `Accept: image/webp` without changing any HTML.
 *   - Make cleanup trivially scoped: companions live next to the
 *     source, so a cache flush of the source dir wipes them too.
 */
class PathResolver
{
    /**
     * Allow-list of media sub-directories whose images we'll convert.
     * Restricting to a known set keeps the converter from accidentally
     * writing companions next to customer avatars, downloadable
     * product files, or admin uploads outside the storefront image
     * surface.
     *   /catalog/product/cache/ -> product image cache (auto-scheduled
     *                              by the ScheduleConversionPlugin)
     *   /catalog/category/ -> category banners shown above the PLP
     *   /wysiwyg/ -> WYSIWYG library used by CMS blocks,
     *                              CMS pages, widget HTML
     */
    private const ALLOWED_PATH_FRAGMENTS = [
        '/catalog/product/cache/',
        '/catalog/category/',
        '/wysiwyg/',
    ];

    /**
     * Companion path for a given source + format. Stateless and
     * cheap -- string concatenation only, no filesystem I/O.
     */
    public function resolve(string $sourcePath, FormatInterface $format): string
    {
        return $sourcePath . '.' . $format->getExtension();
    }

    /**
     * True when the path looks like a media image we should convert.
     * Two checks:
     *   - lives under one of the allowlisted media subdirectories
     *     above (so we don't touch arbitrary uploads).
     *   - extension is jpg / jpeg / png -- the only raster sources
     *     Magento writes in those directories.
     */
    public function isConvertibleSource(string $path): bool
    {
        $matched = false;
        foreach (self::ALLOWED_PATH_FRAGMENTS as $fragment) {
            if (str_contains($path, $fragment)) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            return false;
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return in_array($ext, ['jpg', 'jpeg', 'png'], true);
    }

    /**
     * All companion files associated with a source path. Used by
     * the cleanup plugin to remove them when Magento clears the
     * cache. Returned regardless of whether each path actually
     * exists -- caller filters with `file_exists`.
     *
     * @return string[]
     */
    public function getCompanionPaths(string $sourcePath): array
    {
        return [
            $sourcePath . '.webp',
            $sourcePath . '.avif',
        ];
    }
}

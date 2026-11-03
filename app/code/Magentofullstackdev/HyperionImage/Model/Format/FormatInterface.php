<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Format;

/**
 * Value-object contract for the modern image formats HyperionImage
 * generates next to Magento's JPG/PNG cache. Implementations are
 * stateless and side-effect-free -- they describe a format, the
 * encoder layer does the work.
 */
interface FormatInterface
{
    /**
     * Short slug used in admin labels and config XML paths
     * (`webp`, `avif`).
     */
    public function getName(): string;

    /**
     * File extension without leading dot, used for path-resolver
     * companion-file naming (`webp` -> `foo.jpg.webp`).
     */
    public function getExtension(): string;

    /**
     * MIME type emitted in the `<source type="...">` attribute on
     * the storefront.
     */
    public function getMimeType(): string;

    /**
     * Format identifier accepted by `Imagick::setImageFormat()` and
     * `Imagick::queryFormats()` (`WEBP`, `AVIF`).
     */
    public function getImagickFormat(): string;
}

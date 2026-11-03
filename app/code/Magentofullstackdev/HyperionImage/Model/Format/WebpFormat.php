<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Format;

/**
 * WebP -- VP8L-based modern image format. Wide browser support
 * (Chrome 32+, Firefox 65+, Safari 14+, Edge 18+); typically
 * 25-35% smaller than JPEG at equivalent quality.
 */
class WebpFormat implements FormatInterface
{
    public function getName(): string
    {
        return 'webp';
    }

    public function getExtension(): string
    {
        return 'webp';
    }

    public function getMimeType(): string
    {
        return 'image/webp';
    }

    public function getImagickFormat(): string
    {
        return 'WEBP';
    }
}

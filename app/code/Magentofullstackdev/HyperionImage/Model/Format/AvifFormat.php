<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model\Format;

/**
 * AVIF -- AV1-based modern image format. Smaller than WebP for the
 * same perceptual quality but encoding is significantly slower
 * (3-10x CPU). Browser support is good as of 2024 (Chrome 85+,
 * Firefox 93+, Safari 16+).
 */
class AvifFormat implements FormatInterface
{
    public function getName(): string
    {
        return 'avif';
    }

    public function getExtension(): string
    {
        return 'avif';
    }

    public function getMimeType(): string
    {
        return 'image/avif';
    }

    public function getImagickFormat(): string
    {
        return 'AVIF';
    }
}

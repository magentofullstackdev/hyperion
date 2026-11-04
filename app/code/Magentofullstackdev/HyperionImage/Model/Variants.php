<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model;

use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;

/**
 * Which resized variants a content image gets: the configured widths that
 * are smaller than the source (a 600 px banner gets none; a 1280 px one
 * gets 640 and 960), in the formats that are enabled. The source width is
 * read from the file header once per request.
 */
class Variants
{
    /** @var array<string, int> */
    private array $widthCache = [];

    public function __construct(
        private readonly Config $config,
        private readonly PathResolver $pathResolver,
        private readonly WebpFormat $webpFormat,
        private readonly AvifFormat $avifFormat
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->config->isEnabled() && $this->config->isVariantsEnabled();
    }

    /**
     * The widths to generate for this source, ascending; empty when variants
     * are off, the path is not a content image or the file is unreadable.
     *
     * @return int[]
     */
    public function widthsFor(string $sourcePath): array
    {
        if (!$this->isEnabled() || !$this->pathResolver->supportsVariants($sourcePath)) {
            return [];
        }
        $sourceWidth = $this->sourceWidth($sourcePath);
        if ($sourceWidth <= 0) {
            return [];
        }

        return array_values(array_filter(
            $this->config->getVariantWidths(),
            static fn (int $width): bool => $width < $sourceWidth
        ));
    }

    /**
     * The variant files of this source in every enabled format.
     *
     * @return string[]
     */
    public function pathsFor(string $sourcePath): array
    {
        $paths = [];
        foreach ($this->widthsFor($sourcePath) as $width) {
            foreach ($this->enabledFormats() as $format) {
                $paths[] = $this->pathResolver->resolveVariant($sourcePath, $format, $width);
            }
        }

        return $paths;
    }

    /**
     * Every variant file this source may have had under any configuration
     * (both formats, every configured width): what a clean-up deletes.
     *
     * @return string[]
     */
    public function allPossiblePaths(string $sourcePath): array
    {
        if (!$this->pathResolver->supportsVariants($sourcePath)) {
            return [];
        }
        $paths = [];
        foreach ($this->config->getVariantWidths() as $width) {
            foreach ([$this->webpFormat, $this->avifFormat] as $format) {
                $paths[] = $this->pathResolver->resolveVariant($sourcePath, $format, $width);
            }
        }

        return $paths;
    }

    /**
     * @return array<int, WebpFormat|AvifFormat>
     */
    public function enabledFormats(): array
    {
        $formats = [];
        if ($this->config->isWebpEnabled()) {
            $formats[] = $this->webpFormat;
        }
        if ($this->config->isAvifEnabled()) {
            $formats[] = $this->avifFormat;
        }

        return $formats;
    }

    private function sourceWidth(string $sourcePath): int
    {
        if (isset($this->widthCache[$sourcePath])) {
            return $this->widthCache[$sourcePath];
        }
        $width = 0;
        if (is_file($sourcePath)) {
            set_error_handler(static fn (): bool => true);
            try {
                // phpcs:ignore Magento2.Functions.DiscouragedFunction
                $info = getimagesize($sourcePath);
            } finally {
                restore_error_handler();
            }
            if (is_array($info)) {
                $width = (int) $info[0];
            }
        }

        return $this->widthCache[$sourcePath] = $width;
    }
}

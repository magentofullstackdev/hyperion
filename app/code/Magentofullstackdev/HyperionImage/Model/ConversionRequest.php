<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model;

use Magentofullstackdev\HyperionImage\Api\Data\ConversionRequestInterface;

/**
 * DTO carried as the body of a `hyperion.image.convert` queue
 * message. Exposes a single `sourcePath` slot -- every other piece
 * of context (per-format quality, encoder preference, skip-if-larger
 * flag) is read from `Model\Config` at consume time so admin
 * changes apply to in-flight messages.
 *
 * Magento's queue serialiser supports this shape natively because
 * it maps `getX` / `setX` accessor pairs to JSON keys via the
 * declared interface in `etc/communication.xml`.
 */
class ConversionRequest implements ConversionRequestInterface
{
    private string $sourcePath = '';

    public function __construct(string $sourcePath = '')
    {
        $this->sourcePath = $sourcePath;
    }

    public function getSourcePath(): string
    {
        return $this->sourcePath;
    }

    public function setSourcePath(string $path): void
    {
        $this->sourcePath = $path;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Service;

use Magentofullstackdev\HyperionImage\Api\Data\ConversionRequestInterface;
use Magentofullstackdev\HyperionImage\Model\ConversionRequest;

/**
 * Hand-written factory for `ConversionRequest`. Magento's
 * auto-generated `*Factory` shape would force callers into
 * `create(['sourcePath' => $path])`; this typed `create(string)`
 * variant keeps the call sites readable. Stateless -- does not
 * touch the object manager.
 */
class ConversionRequestFactory
{
    public function create(string $sourcePath): ConversionRequestInterface
    {
        return new ConversionRequest($sourcePath);
    }
}

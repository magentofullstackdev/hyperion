<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Api\Data;

/**
 * Contract for the queue message body. Kept under `Api\Data\` so the
 * Magento queue framework can resolve it via the `is_array` /
 * `is_object` schema check in `etc/communication.xml` -- the framework
 * only looks at interface FQNs, not concrete classes.
 *
 * The DTO is intentionally minimal: a single absolute filesystem
 * path. Per-request quality / format selection is read from
 * `Model\Config` at the moment the consumer fires so admin changes
 * mid-flight take effect on still-queued messages.
 *
 * NOTE: Every method below carries a PHPDoc `@param` / `@return`
 * tag. Magento's `Reflection\TypeProcessor` (called from the queue
 * codegen) refuses interfaces whose accessor return types aren't
 * spelled out in PHPDoc -- native PHP return types are not enough
 * here. Don't drop the docblocks.
 */
interface ConversionRequestInterface
{
    /**
     * Absolute path of the source image to convert. Must live under
     * `pub/media/catalog/product/cache/` -- the consumer rejects any
     * other path through `PathResolver::isConvertibleSource`.
     *
     * @return string
     */
    public function getSourcePath(): string;

    /**
     * Used by the queue serialiser when materialising a message
     * back into a DTO on the consumer side.
     *
     * @param string $path
     * @return void
     */
    public function setSourcePath(string $path): void;
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

/**
 * Renders one block of a fragment-only layout handle, so an htmx response can
 * carry the very same markup as the page (for example out of band with
 * `hx-swap-oob`).
 *
 * The handle is loaded without the `default` handle. A missing block or a
 * render failure is logged and answers an empty string: a fragment never
 * breaks the response it rides along with.
 *
 * @api
 * @since 0.9.0
 */
interface FragmentRendererInterface
{
    /**
     * @param string $handle Layout handle to load (no `default` merge).
     * @param string $blockName Block to render from that handle.
     * @param array<string, mixed> $data Extra block data, e.g. ['oob' => true].
     * @return string The block HTML, empty on failure.
     */
    public function render(string $handle, string $blockName, array $data = []): string;
}

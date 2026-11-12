<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magentofullstackdev\HyperionCore\Block\AssetManifest;
use Magento\Framework\View\Element\Block\ArgumentInterface;

/**
 * Exposes the LOCAL, cache-busted HTMX asset URL to layout XML and .phtml
 * templates.
 *
 * HTMX is installed via npm (`htmx.org` package) and copied into the Vite
 * output by the `hyperion-htmx-asset` plugin in vite.config.js -- it appears
 * in manifest.json under the key `htmx`. This ViewModel delegates to
 * Magentofullstackdev\HyperionCore\Block\AssetManifest so the same hashing/fallback logic that
 * governs every other Hyperion asset governs HTMX too. No external CDN is
 * contacted at runtime.
 */
class HtmxConfig implements ArgumentInterface
{
    public const MANIFEST_ENTRY = 'htmx';

    /**
     * Hyperion uses no `hx-on`, no `js:` values, no trigger filters and
     * swaps no executable script, so htmx runs without eval and drops
     * script tags from responses. Its indicator rules live in the theme
     * stylesheet, not in a style tag injected at runtime.
     *
     * No history snapshot is kept: a Back or Forward across an htmx-pushed
     * URL reloads the public URL (served from the edge cache), so no
     * component has to survive a serialized copy of the upgraded page and
     * nothing private is written to `sessionStorage`.
     */
    private const CONFIG = [
        'allowEval' => false,
        'allowScriptTags' => false,
        'includeIndicatorStyles' => false,
        'historyCacheSize' => 0,
        'refreshOnHistoryMiss' => true,
    ];

    public function __construct(
        private readonly AssetManifest $assetManifest
    ) {
    }

    /**
     * Cache-busted local URL for the HTMX script.
     *
     * Falls back to an un-hashed `/static/frontend/Magentofullstackdev/hyperion/assets/htmx.js`
     * if the manifest is missing -- the AssetManifest block handles that
     * fallback internally and logs a warning.
     */
    public function getScriptUrl(): string
    {
        return $this->assetManifest->getAssetUrl(self::MANIFEST_ENTRY);
    }

    /**
     * Content of the `<meta name="htmx-config">` tag.
     */
    public function getConfigJson(): string
    {
        return (string) json_encode(self::CONFIG);
    }
}

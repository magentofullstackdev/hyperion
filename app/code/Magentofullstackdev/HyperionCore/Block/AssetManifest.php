<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Block;

use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Exception\FileSystemException;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Psr\Log\LoggerInterface;

/**
 * Reads the Vite manifest.json produced by the Centralized Frontend
 * Workspace at /frontend/packages/theme-default/, which writes its
 * output directly into the theme's source directory at
 * `app/design/frontend/Magentofullstackdev/hyperion/web/`. Magento's
 * `setup:static-content:deploy` then mirrors `web/` into
 * `pub/static/frontend/Magentofullstackdev/hyperion/`.
 *
 * The manifest is read from the theme **source** directory rather than
 * the deployed `pub/static/` path so that:
 *   * developer-mode pages render correctly without requiring a static
 *     deploy after every `npm run build`,
 *   * production reads still resolve through the same code path
 *     (`pub/static/...` is not consulted directly).
 *
 * Public asset URLs are still constructed via Magento's `getBaseUrl('static')`
 * so the user sees `/static/frontend/Magentofullstackdev/hyperion/...` as before.
 *
 * If the manifest is missing or malformed (e.g. the Vite build has not
 * been run yet) the block logs the error and returns an un-hashed
 * fallback URL so the page still loads -- at the cost of cache-busting.
 *
 * The manifest maps entry names to hashed filenames.
 */
class AssetManifest extends Template implements ArgumentInterface
{
    private const THEME_STATIC_PATH = 'frontend/Magentofullstackdev/hyperion';
    private const THEME_FULL_PATH = 'frontend/Magentofullstackdev/hyperion';
    private const MANIFEST_FILENAME = 'manifest.json';
    private const ASSETS_SUBDIR = 'assets';

    /** @var array<string, mixed>|null decoded manifest; values are entry arrays unless the file is malformed */
    private ?array $manifestCache = null;

    /** @var string|null cached critical CSS content for the request */
    private ?string $criticalCssCache = null;

    public function __construct(
        Context $context,
        private readonly ComponentRegistrarInterface $componentRegistrar,
        private readonly FileDriver $fileDriver,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * Resolve an entry name (e.g. "entry", "hyperion-slider") or a manifest
     * key (e.g. "web/js/entry.js") to a cache-busted public URL.
     *
     * Falls back to /static/frontend/Magentofullstackdev/hyperion/assets/<name>.js when
     * the manifest is unavailable.
     */
    public function getAssetUrl(string $entryName): string
    {
        $manifest = $this->getManifest();

        $entry = $this->lookupEntry($manifest, $entryName);
        if ($entry !== null && !empty($entry['file'])) {
            return $this->toPublicUrl((string) $entry['file']);
        }

        $this->logger->warning(
            'Hyperion asset manifest missing entry; serving un-hashed fallback.',
            ['entry' => $entryName]
        );

        return $this->toPublicUrl(self::ASSETS_SUBDIR . '/' . $this->normaliseFallbackName($entryName));
    }

    /**
     * Read the handcrafted critical CSS off disk so head/scripts.phtml
     * can inline it inside a `<style>` tag. Cached per-request to avoid
     * a re-read when the head template is rendered after a layout-pass
     * change.
     *
     * Returns an empty string when the manifest doesn't include a
     * `critical` entry or the file can't be read -- the caller should
     * skip emitting the inline `<style>` tag rather than render an
     * empty one (a noop `<style></style>` is still a parse cost).
     */
    public function getCriticalCss(): string
    {
        if ($this->criticalCssCache !== null) {
            return $this->criticalCssCache;
        }

        $manifest = $this->getManifest();
        $entry = $this->lookupEntry($manifest, 'critical');
        if ($entry === null || empty($entry['file'])) {
            return $this->criticalCssCache = '';
        }

        $themePath = $this->componentRegistrar->getPath(
            ComponentRegistrar::THEME,
            self::THEME_FULL_PATH
        );
        if ($themePath === null) {
            return $this->criticalCssCache = '';
        }

        $absolute = $themePath . '/web/' . ltrim((string) $entry['file'], '/');
        try {
            if (!$this->fileDriver->isExists($absolute)) {
                $this->logger->warning('Hyperion critical CSS missing on disk.', ['path' => $absolute]);
                return $this->criticalCssCache = '';
            }
            return $this->criticalCssCache = (string) $this->fileDriver->fileGetContents($absolute);
        } catch (FileSystemException $e) {
            $this->logger->warning('Hyperion critical CSS read failed.', ['error' => $e->getMessage()]);
            return $this->criticalCssCache = '';
        }
    }

    /**
     * Resolve the CSS URLs associated with a given JS entry (Vite emits
     * `"css": ["assets/entry.abc.css"]` alongside JS entries).
     *
     * @return string[] public URLs, empty array when none or manifest missing
     */
    public function getEntryCssUrls(string $entryName): array
    {
        $manifest = $this->getManifest();
        $entry = $this->lookupEntry($manifest, $entryName);
        if ($entry === null || empty($entry['css']) || !is_array($entry['css'])) {
            return [];
        }

        return array_map(
            fn (string $relative): string => $this->toPublicUrl($relative),
            array_values(array_filter($entry['css'], 'is_string'))
        );
    }

    /**
     * Parse and cache the Vite manifest.
     *
     * @return array<string, mixed>
     */
    public function getManifest(): array
    {
        if ($this->manifestCache !== null) {
            return $this->manifestCache;
        }

        try {
            // Theme source: <theme>/web/manifest.json -- the Vite workspace
            // writes here directly so developer-mode pages don't need a
            // Magento static deploy after each rebuild. Resolved through
            // ComponentRegistrar so the lookup works whether the theme is
            // installed under app/design/ or vendor/.
            $themePath = $this->componentRegistrar->getPath(
                ComponentRegistrar::THEME,
                self::THEME_FULL_PATH
            );
            if ($themePath === null) {
                $this->logger->warning('Hyperion theme is not registered.', ['theme' => self::THEME_FULL_PATH]);
                return $this->manifestCache = [];
            }
            $absoluteManifest = $themePath . '/web/' . self::MANIFEST_FILENAME;
            if (!$this->fileDriver->isExists($absoluteManifest)) {
                $this->logger->warning('Hyperion Vite manifest not found.', ['path' => $absoluteManifest]);
                return $this->manifestCache = [];
            }
            $contents = $this->fileDriver->fileGetContents($absoluteManifest);
            $decoded = json_decode($contents, true);
            if (!is_array($decoded)) {
                $this->logger->error('Hyperion Vite manifest is malformed (non-JSON-object).');
                return $this->manifestCache = [];
            }
            return $this->manifestCache = $decoded;
        } catch (FileSystemException $e) {
            $this->logger->error('Hyperion Vite manifest read failed: ' . $e->getMessage());
            return $this->manifestCache = [];
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Vite manifest parse failed: ' . $e->getMessage());
            return $this->manifestCache = [];
        }
    }

    /**
     * @param array<string, mixed> $manifest
     * @return array<string, mixed>|null
     */
    private function lookupEntry(array $manifest, string $entryName): ?array
    {
        // Direct key match (e.g. "web/js/entry.js").
        if (isset($manifest[$entryName]) && is_array($manifest[$entryName])) {
            return $manifest[$entryName];
        }
        // Short name match -- Vite's `name` property, e.g. "entry" or "hyperion-slider".
        foreach ($manifest as $candidate) {
            if (is_array($candidate) && ($candidate['name'] ?? null) === $entryName) {
                return $candidate;
            }
        }
        // Normalised filename match -- "hyperion-slider.js" maps to source ".../hyperion-slider.js".
        $needle = '/' . ltrim($entryName, '/');
        foreach ($manifest as $sourcePath => $candidate) {
            if (is_array($candidate) && str_ends_with('/' . $sourcePath, $needle)) {
                return $candidate;
            }
        }
        // Filename-stem match -- "critical" matches source "src/css/source/critical.css".
        // Vite doesn't add a `name` field to CSS-only entries, so the short-name lookup
        // above misses them; this fallback makes them addressable by their file stem.
        foreach ($manifest as $sourcePath => $candidate) {
            if (is_array($candidate) && pathinfo((string) $sourcePath, PATHINFO_FILENAME) === $entryName) {
                return $candidate;
            }
        }
        return null;
    }

    private function toPublicUrl(string $relative): string
    {
        $relative = ltrim($relative, '/');
        // Magento's static-content deploy materialises theme assets at
        // `pub/static/frontend/<vendor>/<theme>/<locale>/...`. The
        // workspace's Vite build writes its source into `web/`, and the
        // deploy mirrors `web/` into the locale subdir. Include the
        // locale segment in the public URL so nginx's `try_files`
        // succeeds against the deployed copy without needing a
        // static.php round-trip.
        $store = $this->_storeManager->getStore();
        $locale = (string) $this->_scopeConfig->getValue(
            'general/locale/code',
            ScopeInterface::SCOPE_STORE,
            $store->getCode()
        );
        if ($locale === '') {
            // Defensive fallback -- unlikely on a configured Magento store.
            $locale = 'en_US';
        }
        $baseUrl = $store instanceof Store
            ? $store->getBaseUrl(UrlInterface::URL_TYPE_STATIC)
            : $this->_urlBuilder->getBaseUrl(['_type' => UrlInterface::URL_TYPE_STATIC]);
        return $baseUrl . self::THEME_STATIC_PATH . '/' . $locale . '/' . $relative;
    }

    private function normaliseFallbackName(string $entryName): string
    {
        $base = basename($entryName);
        if (!str_contains($base, '.')) {
            $base .= '.js';
        }
        return $base;
    }
}

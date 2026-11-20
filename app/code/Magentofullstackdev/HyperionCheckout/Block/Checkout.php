<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Block;

use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Exception\RuntimeException;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Directory\ReadInterface;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Locale\ResolverInterface as LocaleResolver;
use Magento\Framework\Phrase;
use Magento\Framework\Serialize\Serializer\Json as JsonSerializer;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Template;

/**
 * Page block of the Lit checkout: the mount shell in the body
 * (`checkout.phtml`) and the stylesheet and module preloads in the head
 * (`checkout/head.phtml`).
 *
 * Responsibilities:
 *
 *   1. Serialize the full `CompositeConfigProvider::getConfig()` payload
 *      into the `#checkout-config` JSON island. A payload that cannot be
 *      encoded is logged with the top-level key that fails and the
 *      template prints an error message instead of the application.
 *
 *   2. Resolve the hashed JS / CSS filenames via Vite's build manifest
 *      (`view/frontend/web/.vite/manifest.json`). The manifest is
 *      produced by `@hyperion/module-checkout`'s Vite build at
 *      `frontend/packages/module-checkout/` (workspace-driven), which
 *      writes its output directly into this module's
 *      `view/frontend/web/`. Throws `RuntimeException` on missing
 *      manifest -- never silently falls back to a fixed filename.
 *
 *   3. Cache the resolved manifest on the class for the lifetime of
 *      the PHP request (static property). Re-reads only happen on a
 *      fresh request, which is cheap (a few kilobytes).
 *
 *   4. List the chunks the first render needs (`getPreloadUrls()`), so the
 *      head can preload them while the body is still streaming.
 */
class Checkout extends Template
{
    private const MANIFEST_PATH = 'frontend/Magentofullstackdev/hyperion/Magentofullstackdev_HyperionCheckout/.vite/manifest.json';
    private const ENTRY_KEY = 'src/main.ts';

    /**
     * Manifest keys of the parts only some stores show, each a chunk of its
     * own (`src/components/optional-sections.ts` of the bundle).
     */
    public const SECTION_KEYS = [
        'gift-options' => 'src/components/checkout-gift-message.ts',
        'agreements' => 'src/components/checkout-agreements.ts',
        'captcha' => 'src/components/captcha-field.ts',
    ];

    /**
     * The chunk that holds `<checkout-app>`. Its manifest key carries the
     * content hash, so it is recognized by the fields that do not: the chunk
     * name and the file name the Vite configuration pins for it.
     */
    private const APP_CHUNK_NAME = 'checkout-app';
    private const APP_CHUNK_FILE_PATTERN = '#^assets/checkout-app-[A-Za-z0-9_-]+\.js$#';

    /** Manifest key of a locale catalog chunk (`src/i18n/it_IT.json`). */
    private const LOCALE_KEY_PATTERN = '#^src/i18n/([A-Za-z]+)_[A-Za-z0-9]+\.json$#';

    private const JSON_FLAGS = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;

    /** @var array<string, mixed>|null */
    private static ?array $cachedManifest = null;

    public function __construct(
        Template\Context $context,
        private readonly JsonSerializer $jsonSerializer,
        private readonly CompositeConfigProvider $compositeConfigProvider,
        private readonly Filesystem $filesystem,
        private readonly ComponentRegistrarInterface $componentRegistrar,
        private readonly FileDriver $fileDriver,
        private readonly LocaleResolver $localeResolver,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * Serialize the merged checkoutConfig for the JSON island.
     *
     * Bypasses Magento's `JsonSerializer` deliberately: that helper
     * calls `json_encode()` without flags, so user-controllable strings
     * containing the literal `</script>` would terminate the surrounding
     * `<script type="application/json">` tag and inject HTML. The HEX
     * flags emit `<\/script>` instead, keeping the island
     * parser-safe regardless of input.
     *
     * A byte sequence that is not UTF-8 (an address imported in another
     * encoding) is replaced with U+FFFD instead of failing the page. What
     * still cannot be encoded (a non finite number, a resource, a recursive
     * structure) is logged with the top-level key it sits under, and the
     * method answers an empty string: the template then prints an error
     * message instead of the application.
     */
    public function getCheckoutConfigJson(): string
    {
        $config = $this->compositeConfigProvider->getConfig();
        try {
            return json_encode($config, self::JSON_FLAGS);
        } catch (\JsonException $e) {
            $this->_logger->critical(
                'Hyperion checkout: the checkout configuration cannot be serialized: ' . $e->getMessage(),
                ['keys' => $this->findUnserializableKeys($config)]
            );
            return '';
        }
    }

    /**
     * Top-level keys of the checkout configuration whose value fails to encode.
     *
     * @param array<int|string, mixed> $config
     * @return string[]
     */
    private function findUnserializableKeys(array $config): array
    {
        $failing = [];
        foreach ($config as $key => $value) {
            try {
                json_encode($value, self::JSON_FLAGS);
            } catch (\JsonException $e) {
                $failing[] = (string) $key;
            }
        }
        return $failing;
    }

    /**
     * URLs of the module chunks the first render of the checkout needs, for
     * `<link rel="modulepreload">`: the static imports of the entry, the chunk
     * of `<checkout-app>` (a dynamic import of the entry) with its own static
     * imports, and the catalog chunk of the store locale when the build has
     * one. The entry itself is the page's module script and is not listed.
     *
     * `$sections` names the optional sections this store shows (keys of
     * SECTION_KEYS): each is a chunk the entry imports next to the
     * application only when the store uses it, so it is preloaded on the same
     * condition.
     *
     * A preload is an optimization: a manifest that cannot be read, or one
     * without the application chunk, yields an empty list.
     *
     * @param string[] $sections
     * @return string[]
     */
    public function getPreloadUrls(array $sections = []): array
    {
        try {
            $manifest = $this->loadManifest();
        } catch (\Throwable $e) {
            $this->_logger->warning('Hyperion checkout: no module preloads, ' . $e->getMessage());
            return [];
        }
        $entry = $manifest[self::ENTRY_KEY] ?? null;
        $appKey = is_array($entry) ? $this->findAppChunkKey($manifest, $entry) : null;
        if ($appKey === null) {
            return [];
        }

        $roots = [self::ENTRY_KEY, $appKey];
        foreach ($sections as $section) {
            $sectionKey = self::SECTION_KEYS[$section] ?? null;
            if ($sectionKey !== null && isset($manifest[$sectionKey])) {
                $roots[] = $sectionKey;
            }
        }
        $localeKey = $this->findLocaleChunkKey($manifest);
        if ($localeKey !== null) {
            $roots[] = $localeKey;
        }

        $files = [];
        $visited = [];
        foreach ($roots as $root) {
            $this->collectStaticImports($manifest, $root, $visited, $files);
        }
        unset($files[self::ENTRY_KEY]);

        $urls = [];
        foreach (array_unique($files) as $file) {
            $urls[] = $this->getViewFileUrl('Magentofullstackdev_HyperionCheckout::' . $file);
        }
        return $urls;
    }

    /**
     * True when the static files are served from another origin than the
     * storefront (a CDN): the preload links then carry `crossorigin`.
     */
    public function isStaticCrossOrigin(): bool
    {
        $static = $this->originOf((string) $this->_urlBuilder->getBaseUrl(['_type' => UrlInterface::URL_TYPE_STATIC]));
        $web = $this->originOf((string) $this->_urlBuilder->getBaseUrl(['_type' => UrlInterface::URL_TYPE_WEB]));

        return $static !== '' && $web !== '' && $static !== $web;
    }

    /**
     * Host and port of a URL (the scheme follows the page on both sides).
     */
    private function originOf(string $url): string
    {
        // phpcs:ignore Magento2.Functions.DiscouragedFunction
        $parts = parse_url($url);
        if (!is_array($parts) || !isset($parts['host'])) {
            return '';
        }
        return strtolower($parts['host']) . (isset($parts['port']) ? ':' . $parts['port'] : '');
    }

    /**
     * Manifest key of the application chunk among the entry's dynamic imports.
     *
     * @param array<string, mixed> $manifest
     * @param array<string, mixed> $entry
     */
    private function findAppChunkKey(array $manifest, array $entry): ?string
    {
        $dynamicImports = $entry['dynamicImports'] ?? [];
        if (!is_array($dynamicImports)) {
            return null;
        }
        foreach ($dynamicImports as $key) {
            $chunk = is_string($key) ? ($manifest[$key] ?? null) : null;
            if (!is_array($chunk) || !isset($chunk['file']) || !is_string($chunk['file'])) {
                continue;
            }
            if (($chunk['name'] ?? null) === self::APP_CHUNK_NAME
                || preg_match(self::APP_CHUNK_FILE_PATTERN, $chunk['file']) === 1
            ) {
                return $key;
            }
        }
        return null;
    }

    /**
     * Manifest key of the catalog chunk that serves the store locale: the
     * exact locale, else the first catalog of the same language, like the
     * bundle resolves it. The source language has no chunk (it is part of
     * the entry).
     *
     * @param array<string, mixed> $manifest
     */
    private function findLocaleChunkKey(array $manifest): ?string
    {
        $locale = (string) $this->localeResolver->getLocale();
        if ($locale === '') {
            return null;
        }
        $exact = 'src/i18n/' . $locale . '.json';
        if (isset($manifest[$exact]) && is_array($manifest[$exact])) {
            return $exact;
        }
        $language = strtolower(explode('_', $locale)[0]);
        if ($language === 'en') {
            return null;
        }
        foreach ($manifest as $key => $chunk) {
            if (is_array($chunk)
                && preg_match(self::LOCALE_KEY_PATTERN, (string) $key, $match) === 1
                && strtolower($match[1]) === $language
            ) {
                return (string) $key;
            }
        }
        return null;
    }

    /**
     * Walk the static import graph from one manifest key and record the
     * file of every chunk reached, in discovery order.
     *
     * @param array<string, mixed> $manifest
     * @param string $key
     * @param array<string, bool> $visited
     * @param array<string, string> $files
     */
    private function collectStaticImports(array $manifest, string $key, array &$visited, array &$files): void
    {
        if (isset($visited[$key])) {
            return;
        }
        $visited[$key] = true;
        $chunk = $manifest[$key] ?? null;
        if (!is_array($chunk) || !isset($chunk['file']) || !is_string($chunk['file'])) {
            return;
        }
        $files[$key] = $chunk['file'];
        $imports = $chunk['imports'] ?? [];
        if (!is_array($imports)) {
            return;
        }
        foreach ($imports as $import) {
            if (is_string($import)) {
                $this->collectStaticImports($manifest, $import, $visited, $files);
            }
        }
    }

    /**
     * URL of the hashed entry module.
     */
    public function getBundleUrl(): string
    {
        $manifest = $this->loadManifest();
        $entry = $manifest[self::ENTRY_KEY] ?? null;
        if (!is_array($entry) || !isset($entry['file']) || !is_string($entry['file'])) {
            throw new RuntimeException(
                new Phrase(
                    'Magentofullstackdev_HyperionCheckout manifest is missing the "%1" entry. '
                    . 'Run `npm run build:checkout` inside /frontend.',
                    [self::ENTRY_KEY]
                )
            );
        }
        return $this->getViewFileUrl('Magentofullstackdev_HyperionCheckout::' . $entry['file']);
    }

    /**
     * URL of the entry's companion stylesheet. Vite lists CSS imports
     * under the entry's `css` array; the Lit checkout emits exactly
     * one stylesheet so we take index 0.
     */
    public function getStylesUrl(): string
    {
        $manifest = $this->loadManifest();
        $entry = $manifest[self::ENTRY_KEY] ?? null;
        if (
            !is_array($entry)
            || !isset($entry['css'])
            || !is_array($entry['css'])
            || !isset($entry['css'][0])
            || !is_string($entry['css'][0])
        ) {
            throw new RuntimeException(
                new Phrase(
                    'Magentofullstackdev_HyperionCheckout manifest is missing a CSS asset for entry "%1".',
                    [self::ENTRY_KEY]
                )
            );
        }
        return $this->getViewFileUrl('Magentofullstackdev_HyperionCheckout::' . $entry['css'][0]);
    }

    /**
     * Load the Vite manifest JSON. Cached per PHP request.
     *
     * The manifest is a static asset -- Magento's static-content
     * versioning copies it into `pub/static/version.../frontend/...`
     * during deploy, but we read the source copy from the module tree
     * because the PHP process isn't guaranteed to see the versioned
     * copy before static:content:deploy runs.
     *
     * @return array<string, mixed>
     */
    private function loadManifest(): array
    {
        if (self::$cachedManifest !== null) {
            return self::$cachedManifest;
        }

        /** @var ReadInterface $staticDir */
        $staticDir = $this->filesystem->getDirectoryRead(DirectoryList::STATIC_VIEW);
        if ($staticDir->isFile(self::MANIFEST_PATH)) {
            $raw = $staticDir->readFile(self::MANIFEST_PATH);
            $parsed = $this->jsonSerializer->unserialize($raw);
            if (is_array($parsed)) {
                self::$cachedManifest = $parsed;
                return $parsed;
            }
        }

        // Fallback: read directly from the module source. Useful in dev
        // when static:content:deploy hasn't run since the last build.
        // Resolved via ComponentRegistrar so the lookup works regardless
        // of whether the module is installed under app/code/ or vendor/.
        $modulePath = $this->componentRegistrar->getPath(
            ComponentRegistrar::MODULE,
            'Magentofullstackdev_HyperionCheckout'
        );
        $moduleManifest = $modulePath !== null
            ? $modulePath . '/view/frontend/web/.vite/manifest.json'
            : null;
        if ($moduleManifest !== null && $this->fileDriver->isExists($moduleManifest)) {
            $raw = $this->fileDriver->fileGetContents($moduleManifest);
            $parsed = $this->jsonSerializer->unserialize($raw);
            if (is_array($parsed)) {
                self::$cachedManifest = $parsed;
                return $parsed;
            }
        }

        throw new RuntimeException(
            new Phrase(
                'Magentofullstackdev_HyperionCheckout Vite manifest not found. Looked at: '
                . '(a) pub/static/%1 (b) %2. Run `npm run build:checkout` '
                . 'inside /frontend and `bin/magento setup:static-content:deploy -f`.',
                [self::MANIFEST_PATH, $moduleManifest ?? '<module path unresolved>']
            )
        );
    }

    /**
     * Test-only manifest reset.
     */
    public static function resetManifestCacheForTests(): void
    {
        self::$cachedManifest = null;
    }
}

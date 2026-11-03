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
use Magento\Framework\Phrase;
use Magento\Framework\Serialize\Serializer\Json as JsonSerializer;
use Magento\Framework\View\Element\Template;

/**
 * Page block that renders the Lit checkout mount shell.
 *
 * Three responsibilities:
 *
 *   1. Serialize the full `CompositeConfigProvider::getConfig()` payload
 *      into the `#checkout-config` JSON island.
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
 *      fresh request, which is cheap (200-byte file).
 */
class Checkout extends Template
{
    private const MANIFEST_PATH = 'frontend/Magentofullstackdev/hyperion/Magentofullstackdev_HyperionCheckout/.vite/manifest.json';
    private const ENTRY_KEY = 'src/main.ts';

    /** @var array<string, mixed>|null */
    private static ?array $cachedManifest = null;

    public function __construct(
        Template\Context $context,
        private readonly JsonSerializer $jsonSerializer,
        private readonly CompositeConfigProvider $compositeConfigProvider,
        private readonly Filesystem $filesystem,
        private readonly ComponentRegistrarInterface $componentRegistrar,
        private readonly FileDriver $fileDriver,
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
     */
    public function getCheckoutConfigJson(): string
    {
        return json_encode(
            $this->compositeConfigProvider->getConfig(),
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
                | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
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

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Vite build config for @magentofullstackdev/hyperion-checkout.
 *
 * Builds a single ES module + one CSS file directly into the matching
 * Magento Composer package inside this repo at
 * `../../../app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/`
 * (`packageDir/../../..` is the repository root). The compiled assets
 * are committed so Composer consumers never need Node.
 * The PHP block (`Magentofullstackdev\HyperionCheckout\Block\Checkout`) reads the manifest
 * at `view/frontend/web/.vite/manifest.json` to resolve the hashed
 * filenames at request time.
 *
 * Manifest: `build.manifest = true` is mandatory: without it the PHTML
 * block has nothing to resolve and will throw RuntimeException.
 *
 * Code splitting: the entry boots (config, store, catalog) and imports
 * the UI as one chunk, `checkout-app`, which the PHP block preloads from
 * the head. The parts only some stores show (gift options, terms to
 * accept, the image CAPTCHA field) are chunks of their own, imported next
 * to it when the store uses them (`src/components/optional-sections.ts`)
 * and preloaded on the same condition. Individual payment gateway
 * renderers `await import()` their code lazily; those become separate
 * chunks via Rollup's default behavior.
 *
 * Licenses: `THIRD_PARTY_LICENSES.txt` next to the assets carries the full
 * license text of every bundled library (../../build/third-party-licenses.ts).
 */
import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { thirdPartyLicensesPlugin } from '../../build/third-party-licenses';

const packageDir = dirname(fileURLToPath(import.meta.url));
// frontend/packages/module-checkout/ -> the repository root is three levels up.
const repoRoot = resolve(packageDir, '../../..');
const outDir = resolve(
    repoRoot,
    'app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web'
);

export default defineConfig({
    root: packageDir,
    // Relative base: Magento serves the assets from a versioned, per-locale
    // static directory, so a lazy chunk must resolve its dependencies (other
    // chunks, the entry stylesheet) against its own URL. With the default
    // absolute base Vite preloads `/assets/...`, which does not exist, and
    // the dynamic import of every gateway renderer is rejected.
    base: './',
    // view/frontend/web/THIRD_PARTY_LICENSES.txt: the full license text of
    // every bundled library (lit, signals, polyfill), written by the build so
    // it survives emptyOutDir and never enters the manifest.
    plugins: [
        thirdPartyLicensesPlugin({
            file: resolve(outDir, 'THIRD_PARTY_LICENSES.txt'),
            bundle: 'checkout',
            // The `lit` facade only re-exports, so the chunk scan never sees it.
            extraPackages: ['lit'],
            resolveFrom: import.meta.url,
        }),
    ],
    resolve: {
        alias: {
            '@': resolve(packageDir, 'src'),
        },
    },
    server: {
        port: 5175,
        strictPort: true,
    },
    build: {
        outDir,
        emptyOutDir: true,
        manifest: true,
        rollupOptions: {
            input: {
                checkout: resolve(packageDir, 'src/main.ts'),
            },
            output: {
                entryFileNames: 'assets/checkout-[hash].js',
                // The chunk that holds <checkout-app> keeps the file name
                // `checkout-app-<hash>.js` whatever name Rollup derives for
                // it: Block\Checkout recognizes it by that name to preload it
                // (its manifest key carries the hash).
                chunkFileNames: (chunk) =>
                    chunk.moduleIds.some((id) => id.endsWith('/src/components/checkout-app.ts'))
                        ? 'assets/checkout-app-[hash].js'
                        : 'assets/[name]-[hash].js',
                assetFileNames: (info) => {
                    const name = info.name ?? 'asset';
                    if (name.endsWith('.css')) {
                        return 'assets/checkout-[hash].css';
                    }
                    return 'assets/[name]-[hash][extname]';
                },
            },
        },
        sourcemap: true,
        target: 'es2022',
        minify: 'esbuild',
        cssMinify: 'esbuild',
    },
    esbuild: {
        target: 'es2022',
    },
});

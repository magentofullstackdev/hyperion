// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Vite configuration for @magentofullstackdev/hyperion-theme.
 *
 * Builds TS/Lit/CSS source from `./src/` into the matching Magento
 * Composer package inside this repo at
 * `../../../app/design/frontend/Magentofullstackdev/hyperion/web/`
 * (`packageDir/../../..` is the hyperion-repo root). The compiled assets
 * are committed so Composer consumers never need Node. Magento's
 * `setup:static-content:deploy` then mirrors `web/` into
 * `pub/static/frontend/Magentofullstackdev/hyperion/`.
 *
 *   • Auto-discovers every file in `src/js/components/` as an
 *     independent chunk (one chunk per Lit component).
 *   • Writes a manifest.json consumed by Hyperion\Core\Block\AssetManifest.
 *   • Produces ES-module output for native <script type="module">
 *     loading.
 *   • Emits HTMX as a standalone, cache-busted, NON-module asset copied
 *     from the `htmx.org` npm package, never from a CDN, never bundled
 *     into the entry chunk.
 *   • Writes web/THIRD_PARTY_LICENSES.txt (full license text of every
 *     bundled library, htmx included) through ../../build/third-party-licenses.ts.
 */
import { defineConfig } from 'vite';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { globSync } from 'glob';
import { thirdPartyLicensesPlugin } from '../../build/third-party-licenses';

const packageDir = dirname(fileURLToPath(import.meta.url));
// frontend/packages/theme-default/ -> hyperion-repo root is three levels up.
const repoRoot = resolve(packageDir, '../../..');
const themeSourceDir = resolve(repoRoot, 'app/design/frontend/Magentofullstackdev/hyperion');
const outDir = resolve(themeSourceDir, 'web');

const componentInputs = Object.fromEntries(
    globSync('src/js/components/*.{ts,js}', { cwd: packageDir }).map((file) => [
        basename(file, extname(file)),
        resolve(packageDir, file),
    ])
);

const input = {
    entry: resolve(packageDir, 'src/js/entry.js'),
    // Handcrafted critical CSS: Vite emits a fingerprinted file under
    // assets/critical-<hash>.css so head/scripts.phtml can read it off
    // disk and inline it inside <style data-hyperion-critical>. Looked
    // up via `AssetManifest::getEntryCssUrls('critical')`.
    critical: resolve(packageDir, 'src/css/source/critical.css'),
    ...componentInputs,
};

/**
 * Emit the raw UMD build of `htmx.org` as a standalone, cache-busted
 * asset (`assets/htmx-<hash>.js`) and patch it into the Vite manifest
 * under the key `htmx` so AssetManifest can resolve it by short name.
 * The file is deliberately NOT bundled as an ES module: HTMX is UMD
 * and assigns `window.htmx` from a plain `<script src>` tag, which is
 * how default.xml loads it.
 */
function hyperionHtmxAssetPlugin() {
    const require = createRequire(import.meta.url);
    const htmxPkg = require('htmx.org/package.json');
    const htmxSource = require.resolve('htmx.org/dist/htmx.min.js');
    let emittedFileName = '';

    return {
        name: 'hyperion-htmx-asset',
        apply: 'build' as const,
        generateBundle() {
            const source = readFileSync(htmxSource);
            // @ts-expect-error - rollup plugin context typed at build time
            const referenceId = this.emitFile({
                type: 'asset',
                name: 'htmx.js',
                source,
            });
            // @ts-expect-error - rollup plugin context typed at build time
            emittedFileName = this.getFileName(referenceId);
        },
        writeBundle() {
            // Vite's manifest plugin has finished writing manifest.json by
            // the time writeBundle runs. Patch our htmx entry into it so
            // the PHP AssetManifest block can look it up by short name.
            const manifestPath = resolve(outDir, 'manifest.json');
            if (!existsSync(manifestPath) || !emittedFileName) return;
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            manifest.htmx = {
                file: emittedFileName,
                name: 'htmx',
                src: 'node_modules/htmx.org/dist/htmx.min.js',
                version: htmxPkg.version,
            };
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        },
    };
}

/**
 * Copy the transactional email stylesheets to `web/css/email.css` and
 * `web/css/email-inline.css`, WITHOUT a hash: Magento's email header asks
 * for exactly those two asset paths (`{{css file="css/email.css"}}`,
 * `{{inlinecss file="css/email-inline.css"}}`) and, because the theme has
 * no parent, nothing else provides them. They are emitted by the build on
 * purpose: `emptyOutDir` wipes `web/` on every build, so a file placed
 * there by hand does not survive.
 */
function hyperionEmailCssPlugin() {
    return {
        name: 'hyperion-email-css',
        apply: 'build' as const,
        generateBundle() {
            for (const file of ['email.css', 'email-inline.css']) {
                // @ts-expect-error - rollup plugin context typed at build time
                this.emitFile({
                    type: 'asset',
                    fileName: `css/${file}`,
                    source: readFileSync(resolve(packageDir, 'src/css/email', file)),
                });
            }
        },
    };
}

export default defineConfig({
    root: packageDir,
    publicDir: false,
    // `./` makes every dynamic import / CSS-asset reference inside the
    // built bundle resolve **relative to the loading script's URL**.
    // Magento serves theme assets under per-locale subdirectories
    // (`/static/frontend/Magentofullstackdev/hyperion/<locale>/assets/...`), and a
    // fixed absolute base would hard-code one locale into the bundle.
    // Relative resolution lets the same bundle serve every locale: an
    // import inside `/static/.../en_US/assets/entry-<hash>.js` resolves
    // `./photoswipe-<hash>.css` to `/static/.../en_US/assets/photoswipe-<hash>.css`,
    // and `/it_IT/assets/entry-<hash>.js` resolves the same import to
    // `/static/.../it_IT/assets/...` automatically.
    base: './',
    plugins: [
        hyperionHtmxAssetPlugin(),
        hyperionEmailCssPlugin(),
        // web/THIRD_PARTY_LICENSES.txt: the full license text of every bundled
        // library, for Composer consumers who never see the npm packages. The
        // htmx UMD copy is not in the module graph and the `lit` facade leaves
        // no code in a chunk (pure re-exports), so both are listed by name.
        thirdPartyLicensesPlugin({
            file: resolve(outDir, 'THIRD_PARTY_LICENSES.txt'),
            bundle: 'theme',
            extraPackages: ['htmx.org', 'lit'],
            resolveFrom: import.meta.url,
        }),
    ],
    build: {
        outDir,
        emptyOutDir: true,
        manifest: 'manifest.json',
        cssCodeSplit: true,
        sourcemap: true,
        rollupOptions: {
            input,
            output: {
                format: 'es',
                entryFileNames: 'assets/[name].[hash].js',
                chunkFileNames: 'assets/[name].[hash].js',
                assetFileNames: 'assets/[name].[hash][extname]',
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        cors: true,
        origin: 'http://localhost:5173',
        hmr: {
            host: 'hyperion.local',
            protocol: 'wss',
            clientPort: 5173,
        },
    },
});

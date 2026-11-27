// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Dev server of the extension harness (`pnpm dev:harness`): serves
 * `testing/harness.html` on port 5176 (`/harness.html`). A module
 * of the package or of a sibling project is passed as a same-origin path,
 * for example `?module=/@fs/<absolute path>/card.js&tag=sample-card&type=payment`.
 * The server may read the package, the working directory, the sample modules
 * of a repository checkout, and every directory listed in
 * `HYPERION_HARNESS_ALLOW` (separated like `PATH`).
 */
import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testingDir = dirname(fileURLToPath(import.meta.url));
const sampleModules = resolve(testingDir, '../../../../dev/modules');
const allowed = [
    resolve(testingDir, '..'),
    process.cwd(),
    ...(existsSync(sampleModules) ? [sampleModules] : []),
    ...(process.env.HYPERION_HARNESS_ALLOW ?? '').split(delimiter).filter(Boolean).map((dir) => resolve(dir)),
];

export default defineConfig({
    root: testingDir,
    // Vite's cache goes to the node_modules of the directory the server is started from
    // (this package in a repository checkout, your project once the package is installed),
    // never inside the installed package or its testing/ folder.
    cacheDir: resolve(process.cwd(), 'node_modules/.vite/hyperion-harness'),
    server: {
        port: 5176,
        strictPort: true,
        // Only an interactive terminal opens the page: a script or CI run never touches the browser.
        open: process.stdout.isTTY && !process.env.CI ? '/harness.html' : false,
        fs: { allow: allowed },
    },
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Vitest configuration of the testing kit's own tests. The kit is plain
 * JavaScript, kept apart from the checkout's TypeScript suite.
 */
import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    root: dirname(fileURLToPath(import.meta.url)),
    // The package's node_modules, not one inside testing/ (the folder that is published).
    cacheDir: resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/.vite'),
    test: {
        environment: 'jsdom',
        include: ['__tests__/**/*.test.js'],
    },
});

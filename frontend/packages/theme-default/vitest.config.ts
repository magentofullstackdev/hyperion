// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Vitest config for the theme components. Kept apart from vite.config.ts:
 * that file is the storefront build (manifest, HTMX asset plugin, Tailwind),
 * none of which the unit tests need. The components touch `document` and
 * `customElements`, so the tests run in a DOM environment.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        setupFiles: ['src/js/components/__tests__/setup.js'],
        include: ['src/**/__tests__/**/*.test.{js,ts}'],
    },
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * PostCSS pipeline for the Hyperion checkout bundle.
 * Tailwind JIT + autoprefixer; nothing else.
 */
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
};

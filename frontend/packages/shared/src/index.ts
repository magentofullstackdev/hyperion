// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * @magentofullstackdev/hyperion-shared barrel export.
 *
 * Re-exports the public API surface of the shared workspace package:
 * Tailwind preset, base Lit element, mixins, HTML sanitizer. Design tokens (CSS) are
 * consumed via direct CSS imports -- see `./tokens/*` exports in
 * package.json.
 */
export { default as tailwindPreset } from './tailwind/preset.js';
export * from './lit/index.js';
export * from './html/index.js';

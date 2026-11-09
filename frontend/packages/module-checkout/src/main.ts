// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Hyperion Lit checkout -- entry module.
 *
 * Imports the compiled stylesheet and calls `bootstrap()`. The
 * bootstrap module parses `#checkout-config`, initializes the store,
 * configures the REST client, loads the locale catalog, and mounts
 * `<checkout-app>`.
 */
import './styles/tailwind.css';
import { bootstrap } from './bootstrap.js';

void bootstrap().catch((err) => {
    console.error('[hyperion-checkout] bootstrap failed', err);
});

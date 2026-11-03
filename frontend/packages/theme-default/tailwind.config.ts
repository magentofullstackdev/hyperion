// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Tailwind CSS JIT configuration for the Hyperion default theme.
 *
 * Extends the shared semantic-colour preset from
 * @magentofullstackdev/hyperion-shared and declares the theme-local
 * content globs. Paths are relative to this file's directory
 * (frontend/packages/theme-default/); `../../..` is the hyperion-repo
 * root, so the Magento templates scanned are the ones in this repo.
 */
import type { Config } from 'tailwindcss';
import hyperionPreset from '@magentofullstackdev/hyperion-shared/tailwind/preset';

const config: Config = {
    presets: [hyperionPreset as Config],
    content: [
        // Theme PHTML overrides + layout XML (Hyperion theme directory).
        '../../../app/design/frontend/Magentofullstackdev/hyperion/**/*.phtml',
        '../../../app/design/frontend/Magentofullstackdev/hyperion/**/layout/**/*.xml',
        '../../../app/design/frontend/Magentofullstackdev/hyperion/**/page_layout/**/*.xml',
        // TS/JS sources that ship Tailwind class strings inside templates
        // and component logic.
        './src/**/*.{ts,js}',
        // Hyperion sub-module templates and layout XML under app/code/Magentofullstackdev/.
        '../../../app/code/Magentofullstackdev/**/view/frontend/templates/**/*.phtml',
        '../../../app/code/Magentofullstackdev/**/view/frontend/layout/**/*.xml',
        // Hyperion modules may emit Tailwind class strings from PHP block
        // classes that build HTML fragments (Topmenu recursive markup,
        // Toolbar, etc.). Scan those too.
        '../../../app/code/Magentofullstackdev/**/Block/**/*.php',
        // ... and from renderers under Model (the mega menu markup).
        '../../../app/code/Magentofullstackdev/**/Model/**/Renderer.php',
        // ... and from view models (Pricing::renderDiscounted and friends).
        '../../../app/code/Magentofullstackdev/**/ViewModel/**/*.php',
        // ... and from the HTMX response builders (NotificationRenderer).
        '../../../app/code/Magentofullstackdev/**/Model/Htmx/*.php',
    ],
};

export default config;

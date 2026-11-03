// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Tailwind config for @magentofullstackdev/hyperion-checkout.
 *
 * Extends the shared semantic-colour preset from
 * @magentofullstackdev/hyperion-shared so a `bg-primary` /
 * `text-on-primary` resolves identically in checkout markup and theme
 * markup. The preset already aliases legacy `--checkout-color-*` tokens
 * to the suite-level `--color-*` tokens (see
 * @magentofullstackdev/hyperion-shared/tokens/colors.css), which means a
 * child theme that overrides only the suite tokens propagates into the
 * checkout for free.
 */
import type { Config } from 'tailwindcss';
import hyperionPreset from '@magentofullstackdev/hyperion-shared/tailwind/preset';

const config: Config = {
    presets: [hyperionPreset as Config],
    // The bundle is loaded on a storefront page AFTER the theme stylesheet,
    // which is a Tailwind build of its own. Unscoped, this file's plain
    // utilities (`.grid-cols-1`) come later in the cascade than the theme's
    // responsive ones (`lg:grid-cols-4`) and win at equal specificity: the
    // site footer lost its columns on the checkout page. Every utility is
    // therefore scoped to the app root, and the reset stays with the theme
    // (the dev harness imports it from src/styles/dev-harness.css).
    important: 'checkout-app',
    corePlugins: {
        preflight: false,
    },
    content: [
        './index.html',
        './src/**/*.{ts,js,html,css}',
    ],
    theme: {
        extend: {
            colors: {
                // Token-name collision with the shared preset: the
                // checkout's components use `bg-accent` / `focus:ring-accent`
                // to mean "primary action colour" (blue), not the
                // theme-suite's amber highlight (`--color-accent`). Pin
                // the checkout's `accent` to the suite's `--color-primary`
                // so the visual contract stays consistent with the rest
                // of the storefront, same blue on Place Order, on the
                // selected shipping/payment radio, and on input focus
                // rings as on every other Hyperion CTA.
                accent: 'rgb(var(--color-primary) / <alpha-value>)',
                'on-accent': 'rgb(var(--color-on-primary) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['var(--checkout-font-sans)', 'system-ui', 'sans-serif'],
            },
        },
    },
};

export default config;

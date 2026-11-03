// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * @magentofullstackdev/hyperion-shared/tailwind/preset
 *
 * Single source of truth for the Hyperion suite's Tailwind palette
 * mapping. Both @magentofullstackdev/hyperion-theme and @magentofullstackdev/hyperion-checkout
 * extend this preset (`presets: [hyperionPreset]`) so a `bg-primary` /
 * `text-on-primary` / `border-subtle` class resolves identically in
 * theme markup and checkout markup.
 *
 * Every semantic color token is mapped to a CSS Custom Property
 * declared in `@magentofullstackdev/hyperion-shared/tokens/colors.css` using the
 * `rgb(var(--color-*) / <alpha-value>)` syntax that lets Tailwind's
 * opacity-modifier classes (e.g. `bg-primary/50`) work.
 *
 * `primary` and `primary-hover` are independent tokens so that
 * `ring-primary` (focus-visibility) and `bg-primary-hover` (hover)
 * resolve to separate CSS variables -- satisfies WCAG 2.1 AA
 * focus-visibility overridability.
 *
 * The `content` array is intentionally EMPTY here -- each consuming
 * package declares its own `content` glob in its `tailwind.config.ts`
 * because the paths are package-specific.
 */
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
    theme: {
        extend: {
            colors: {
                primary: 'rgb(var(--color-primary) / <alpha-value>)',
                'primary-hover': 'rgb(var(--color-primary-hover) / <alpha-value>)',
                secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
                accent: 'rgb(var(--color-accent) / <alpha-value>)',
                surface: 'rgb(var(--color-surface) / <alpha-value>)',
                'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
                'on-primary': 'rgb(var(--color-on-primary) / <alpha-value>)',
                'on-secondary': 'rgb(var(--color-on-secondary) / <alpha-value>)',
                muted: 'rgb(var(--color-muted) / <alpha-value>)',
                subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
                error: 'rgb(var(--color-error) / <alpha-value>)',
                'on-error': 'rgb(var(--color-on-error) / <alpha-value>)',
                'error-strong': 'rgb(var(--color-error-strong) / <alpha-value>)',
                success: 'rgb(var(--color-success) / <alpha-value>)',
                'on-success': 'rgb(var(--color-on-success) / <alpha-value>)',
                'success-strong': 'rgb(var(--color-success-strong) / <alpha-value>)',
                warning: 'rgb(var(--color-warning) / <alpha-value>)',
                'warning-strong': 'rgb(var(--color-warning-strong) / <alpha-value>)',
                'on-warning': 'rgb(var(--color-on-warning) / <alpha-value>)',
                info: 'rgb(var(--color-info) / <alpha-value>)',
                'on-info': 'rgb(var(--color-on-info) / <alpha-value>)',
                inverted: 'rgb(var(--color-surface-inverted) / <alpha-value>)',
                'on-inverted':         'rgb(var(--color-on-inverted) / <alpha-value>)',
                'on-inverted-muted':   'rgb(var(--color-on-inverted-muted) / <alpha-value>)',
                'subtle-inverted':     'rgb(var(--color-subtle-inverted) / <alpha-value>)',
                'price-sale': 'rgb(var(--color-price-sale) / <alpha-value>)',
                // Extended tokens: semantic replacements for the banned palette classes.
                'surface-sunken':  'rgb(var(--color-surface-sunken) / <alpha-value>)',
                'surface-overlay': 'rgb(var(--color-surface-overlay) / <alpha-value>)',
                'text-default':    'rgb(var(--color-text-default) / <alpha-value>)',
                'text-secondary':  'rgb(var(--color-text-secondary) / <alpha-value>)',
                'text-tertiary':   'rgb(var(--color-text-tertiary) / <alpha-value>)',
                'border-default':  'rgb(var(--color-border-default) / <alpha-value>)',
                divider: 'rgb(var(--color-divider) / <alpha-value>)',
                'error-hover':     'rgb(var(--color-error-hover) / <alpha-value>)',
                'error-active':    'rgb(var(--color-error-active) / <alpha-value>)',
                'success-subtle':  'rgb(var(--color-success-subtle) / <alpha-value>)',
                'warning-light':   'rgb(var(--color-warning-light) / <alpha-value>)',
                'focus-ring':      'rgb(var(--color-focus-ring) / <alpha-value>)',
                // Checkout aliases -- kept in the preset so existing
                // checkout component class names (`bg-brand`, `text-on-brand`)
                // keep resolving without a per-component rewrite.
                brand: 'rgb(var(--checkout-color-brand) / <alpha-value>)',
                'on-brand': 'rgb(var(--checkout-color-on-brand) / <alpha-value>)',
                danger: 'rgb(var(--checkout-color-danger) / <alpha-value>)',
                'on-danger': 'rgb(var(--checkout-color-on-danger) / <alpha-value>)',
            },
            typography: () => ({
                DEFAULT: {
                    css: {
                        '--tw-prose-body':          'rgb(var(--color-secondary))',
                        '--tw-prose-headings':      'rgb(var(--color-secondary))',
                        '--tw-prose-lead':          'rgb(var(--color-muted))',
                        '--tw-prose-links':         'rgb(var(--color-primary))',
                        '--tw-prose-bold':          'rgb(var(--color-secondary))',
                        '--tw-prose-counters':      'rgb(var(--color-muted))',
                        '--tw-prose-bullets':       'rgb(var(--color-subtle))',
                        '--tw-prose-hr':            'rgb(var(--color-subtle))',
                        '--tw-prose-quotes':        'rgb(var(--color-secondary))',
                        '--tw-prose-quote-borders': 'rgb(var(--color-primary))',
                        '--tw-prose-captions':      'rgb(var(--color-muted))',
                        '--tw-prose-code':          'rgb(var(--color-secondary))',
                        '--tw-prose-pre-code':      'rgb(var(--color-on-inverted))',
                        '--tw-prose-pre-bg':        'rgb(var(--color-surface-inverted))',
                        '--tw-prose-th-borders':    'rgb(var(--color-subtle))',
                        '--tw-prose-td-borders':    'rgb(var(--color-subtle))',
                        maxWidth: 'none',
                        a: {
                            fontWeight: '500',
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                            '&:hover': {
                                color: 'rgb(var(--color-primary-hover))',
                            },
                        },
                        'h1, h2, h3, h4': {
                            fontWeight: '700',
                            letterSpacing: '-0.01em',
                        },
                    },
                },
            }),
        },
    },
    plugins: [typography],
};

export default preset;

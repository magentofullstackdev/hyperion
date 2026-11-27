// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Styles for Braintree Hosted Fields.
 *
 * Hosted Fields are iframes: page CSS and its custom properties cannot reach
 * them, so the literal text color, muted and danger colors and the font of
 * the checkout come from the context (`designTokens`).
 */
import type { CheckoutContext } from '../../../../extension-api.js';

/** Shared box styling of a hosted field container, the twin of `<hc-text-input>`. */
export const HOSTED_FIELD_BOX = 'mt-1 block h-[42px] w-full rounded-md border bg-surface px-3';

export function resolveHostedFieldStyles(context: Pick<CheckoutContext, 'designTokens'>): Record<string, Record<string, string>> {
    const tokens = context.designTokens;
    return {
        'input': {
            'font-size': tokens['fontSize'] || '16px',
            'font-family': tokens['fontFamily'] || 'system-ui, sans-serif',
            'color': tokens['color'] || '#1f2937',
        },
        '::placeholder': { color: tokens['colorMuted'] || '#6b7280' },
        '.invalid': { color: tokens['colorDanger'] || '#dc2626' },
    };
}

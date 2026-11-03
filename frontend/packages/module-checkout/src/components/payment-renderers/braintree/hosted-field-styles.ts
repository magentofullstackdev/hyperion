// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Styles for Braintree Hosted Fields.
 *
 * Hosted Fields are iframes: page CSS and its custom properties cannot reach
 * them, so the live text colour and font are resolved from the host element
 * and passed as literal values. The muted and danger colours come from two
 * hidden probe elements the host renders (`hostedFieldProbes`).
 */
import { html } from 'lit';

const FALLBACK_TEXT_COLOR = '#1f2937';
const FALLBACK_MUTED_COLOR = '#6b7280';
const FALLBACK_DANGER_COLOR = '#dc2626';

/** Shared box styling of a hosted field container, the twin of `<hc-text-input>`. */
export const HOSTED_FIELD_BOX = 'mt-1 block h-[42px] w-full rounded-md border bg-surface px-3';

export function hostedFieldProbes(): unknown {
    return html`
        <span class="hidden text-muted" data-probe="muted"></span>
        <span class="hidden text-danger" data-probe="danger"></span>
    `;
}

export function resolveHostedFieldStyles(host: HTMLElement): Record<string, Record<string, string>> {
    const own = getComputedStyle(host);
    const probe = (name: string, fallback: string): string => {
        const el = host.querySelector(`[data-probe="${name}"]`);
        return (el ? getComputedStyle(el).color : '') || fallback;
    };
    return {
        'input': {
            'font-size': '16px',
            'font-family': own.fontFamily || 'system-ui, sans-serif',
            'color': own.color || FALLBACK_TEXT_COLOR,
        },
        '::placeholder': { color: probe('muted', FALLBACK_MUTED_COLOR) },
        '.invalid': { color: probe('danger', FALLBACK_DANGER_COLOR) },
    };
}

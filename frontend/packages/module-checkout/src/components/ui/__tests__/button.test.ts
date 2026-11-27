// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-button> states and the contrast of the checkout's text on the
 * backgrounds it paints (WCAG 2.2 AA, 4.5:1 for text under 24 px). The
 * colors are read from the shared tokens, so a change of a default that
 * breaks a pair fails here.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import '../button.js';
import type { Button } from '../button.js';

const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/src/tokens/colors.css'),
    'utf8'
);
type Rgb = readonly [number, number, number];
function token(name: string): Rgb {
    const match = css.match(new RegExp(`--color-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
    if (!match) throw new Error(`token --color-${name} not found`);
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function luminance([r, g, b]: Rgb): number {
    const channel = (v: number): number => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
}
/** `bg-<tone>/<alpha>` painted over a surface. */
function tint(rgb: Rgb, alpha: number, over: Rgb): Rgb {
    return rgb.map((c, i) => Math.round(c * alpha + over[i]! * (1 - alpha))) as unknown as Rgb;
}

describe('checkout text contrast', () => {
    const surfaces: Array<[string, Rgb]> = [['surface', token('surface')], ['surface-raised', token('surface-raised')]];

    it.each(surfaces)('alert text (error-strong) reaches 4.5:1 on the bg-danger/5 and /10 tints over %s', (_name, over) => {
        const danger = token('error');
        expect(contrast(token('error-strong'), tint(danger, 0.05, over))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(token('error-strong'), tint(danger, 0.1, over))).toBeGreaterThanOrEqual(4.5);
    });

    it('the plain danger red is not a text color on its own tint', () => {
        expect(contrast(token('error'), tint(token('error'), 0.05, token('surface-raised')))).toBeLessThan(4.5);
    });

    it.each(surfaces)('field errors (danger) and 12 px muted lines reach 4.5:1 on %s', (_name, over) => {
        expect(contrast(token('error'), over)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(token('muted'), over)).toBeGreaterThanOrEqual(4.5);
    });

    it('Place Order reads at 4.5:1 ready, busy and soft disabled', () => {
        expect(contrast(token('on-primary'), token('primary'))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(token('on-primary'), token('muted'))).toBeGreaterThanOrEqual(4.5);
    });
});

describe('<hc-button>', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    async function mount(props: Partial<Pick<Button, 'softDisabled' | 'loading' | 'disabled'>>): Promise<HTMLButtonElement> {
        const el = document.createElement('hc-button') as Button;
        el.label = 'Place Order';
        Object.assign(el, props);
        document.body.appendChild(el);
        await el.updateComplete;
        return el.querySelector('button')!;
    }

    it('soft disabled: aria-disabled, a gray fill at full opacity, still clickable', async () => {
        const button = await mount({ softDisabled: true });
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.disabled).toBe(false);
        expect(button.classList.contains('bg-muted')).toBe(true);
        expect(button.classList.contains('bg-accent')).toBe(false);
        expect(button.className).not.toMatch(/opacity/);
    });

    it('busy: disabled while the order is on its way, but not dimmed', async () => {
        const button = await mount({ softDisabled: true, loading: true });
        expect(button.disabled).toBe(true);
        expect(button.hasAttribute('aria-disabled')).toBe(false);
        expect(button.classList.contains('bg-accent')).toBe(true);
        expect(button.className).not.toMatch(/opacity/);
    });

    it('truly disabled: dimmed (an inactive control is exempt from the contrast minimum)', async () => {
        const button = await mount({ disabled: true });
        expect(button.disabled).toBe(true);
        expect(button.classList.contains('opacity-50')).toBe(true);
    });
});

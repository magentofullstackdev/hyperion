// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Contrast gate of the semantic text tokens (WCAG 2.1 AA, 4.5:1 for text under
// 24px): the tokens are read from the shared colors.css so a rebrand of the
// defaults that fails on white or on the `/10` tint fails here first. The
// `success` token moved to green-700 and the warning, success and error texts
// on their tints got their own tokens (`*-strong`) for this reason: the axe
// gate flagged green-600 at 3.3:1 and amber-600 at 2.86:1 on the "Only N left"
// pill, and the computed check found the page message tones at 4.38 / 4.13:1.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// theme-default/src/js/lib/__tests__ -> packages/shared/src/tokens/colors.css
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/src/tokens/colors.css'), 'utf8');

const token = (name) => {
    const match = css.match(new RegExp(`--color-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
    if (!match) throw new Error(`token --color-${name} not found`);
    return match.slice(1, 4).map(Number);
};
const luminance = ([r, g, b]) => {
    const channel = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
// `bg-<tone>/10` over the white surface, what the pills and the page messages paint.
const tint = (rgb, alpha = 0.1, over = token('surface')) => rgb.map((c, i) => Math.round(c * alpha + over[i] * (1 - alpha)));

describe('semantic text tokens', () => {
    test('warning text (warning-strong) reaches 4.5:1 on white and on the bg-warning/10 tint', () => {
        const ink = token('warning-strong');
        expect(contrast(ink, token('surface'))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, tint(token('warning')))).toBeGreaterThanOrEqual(4.5);
    });

    test('success and error text reach 4.5:1 on white', () => {
        expect(contrast(token('success'), token('surface'))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(token('error'), token('surface'))).toBeGreaterThanOrEqual(4.5);
    });

    // On their own `/10` tints the plain success and error inks measure 4.38:1
    // and 4.13:1, so the page message tones (messages.phtml, hyperion-messages.js)
    // and the gift message pill paint their text with the `-strong` steps.
    test('success text (success-strong) reaches 4.5:1 on white and on the bg-success/10 tint', () => {
        const ink = token('success-strong');
        expect(contrast(ink, token('surface'))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, tint(token('success')))).toBeGreaterThanOrEqual(4.5);
    });

    test('error text (error-strong) reaches 4.5:1 on white and on the bg-error/10 tint', () => {
        const ink = token('error-strong');
        expect(contrast(ink, token('surface'))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, tint(token('error')))).toBeGreaterThanOrEqual(4.5);
    });

    test('the warning tone itself is NOT a text colour on the tint (what the gate used to miss)', () => {
        expect(contrast(token('warning'), tint(token('warning')))).toBeLessThan(4.5);
    });
});

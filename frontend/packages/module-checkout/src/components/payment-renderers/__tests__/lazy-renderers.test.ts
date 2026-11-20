// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { LAZY_RENDERER_CODES, ensureRenderersFor, isRendererPending, renderersVersion } from '../lazy-renderers.js';
import { OFFLINE_RENDERER_CODES } from '../payment-offline.js';
import { SAFE_FOR_GENERIC_CODES, hasPaymentRenderer } from '../registry.js';

describe('lazy gateway renderers', () => {
    it('ignores offline and unknown method codes', async () => {
        const before = renderersVersion.get();
        ensureRenderersFor(['checkmo', 'some_unknown_gateway']);
        await Promise.resolve();
        expect(renderersVersion.get()).toBe(before);
    });

    it('imports a gateway module once and announces it', async () => {
        const before = renderersVersion.get();
        expect(hasPaymentRenderer('braintree')).toBe(false);

        ensureRenderersFor(['braintree']);
        ensureRenderersFor(['braintree']);
        await vi.waitFor(() => expect(hasPaymentRenderer('braintree')).toBe(true));

        expect(renderersVersion.get()).toBe(before + 1);
    });

    it('a method with a module of its own is pending, any other is not', () => {
        expect(isRendererPending('braintree_paypal')).toBe(true);
        expect(isRendererPending('checkmo')).toBe(false);
        expect(isRendererPending('some_unknown_gateway')).toBe(false);
    });

    it('the server rendered skeleton draws a usable row for exactly the methods the bundle can render', () => {
        // The tests run from the package directory, three levels under the repository root.
        const source = readFileSync(
            resolve(process.cwd(), '../../../app/code/Magentofullstackdev/HyperionCheckout/ViewModel/CheckoutSkeleton.php'),
            'utf8'
        );
        const block = /SUPPORTED_PAYMENT_METHODS = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
        const php = Array.from(block.matchAll(/'([a-z0-9_]+)'/g), (match) => match[1]!);
        const bundle = new Set([...OFFLINE_RENDERER_CODES, ...SAFE_FOR_GENERIC_CODES, ...LAZY_RENDERER_CODES]);

        expect([...php].sort()).toEqual([...bundle].sort());
    });
});

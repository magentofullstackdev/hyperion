// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, expect, it, vi } from 'vitest';

import { ensureRenderersFor, renderersVersion } from '../lazy-renderers.js';
import { hasPaymentRenderer } from '../registry.js';

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
});

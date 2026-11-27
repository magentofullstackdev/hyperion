// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutExtensionConfig } from '../../../../extension-api.js';
import { setCheckoutConfig } from '../../../bootstrap-config.js';
import { resetCheckoutContextForTests } from '../../../extension/context.js';
import { resetGatesForTests } from '../../../extension/gates.js';
import { resetFiltersForTests } from '../../../extension/request-filters.js';
import { registeredSlots, resetSlotsForTests } from '../../../extension/slots.js';
import { resetFlowSelectorsForTests } from '../../../store/flow-selectors.js';
import { createStore, setStoreForTests } from '../../../store/index.js';
import type { CheckoutConfig } from '../../../types/config.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The files reachable from `from` through static imports (dynamic `import()` left out). */
function staticClosure(from: readonly string[]): Set<string> {
    const seen = new Set<string>();
    const queue = [...from];
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = readFileSync(file, 'utf8');
        const pattern = /^\s*import\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm;
        for (const match of source.matchAll(pattern)) {
            const target = resolve(dirname(file), match[1]!).replace(/\.js$/, '.ts');
            if (target.endsWith('.ts')) queue.push(target);
        }
    }
    return seen;
}

function entry(name: string, builtin: string): CheckoutExtensionConfig {
    return { name, moduleUrl: null, builtin, apiVersion: '1', required: false, slots: [], options: {}, phrases: {} };
}

describe('first-party builtins and the generic runtime', () => {
    beforeEach(() => {
        setCheckoutConfig({ storeCode: 'default', hyperion: { enabled: true, extensionApi: '1.0-beta' } } as unknown as CheckoutConfig);
        setStoreForTests(createStore());
        resetFlowSelectorsForTests();
        resetCheckoutContextForTests();
        resetGatesForTests();
        resetSlotsForTests();
        resetFiltersForTests();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        resetGatesForTests();
        resetFiltersForTests();
        setStoreForTests(null);
        vi.restoreAllMocks();
    });

    it('resolves both builtin ids once the runtime chunk is loaded', async () => {
        const runtime = await import('../../../extension/runtime.js');
        await runtime.startExtensions([
            entry('hyperion_order_comment', 'order-comment'),
            entry('hyperion_newsletter_optin', 'newsletter-optin'),
        ]);
        expect(console.error).not.toHaveBeenCalled();
        expect(registeredSlots('before-place-order').map((slot) => slot.tag)).toEqual(['hc-order-comment']);
        expect(registeredSlots('after-email').map((slot) => slot.tag)).toEqual(['hc-newsletter-optin']);
        runtime.resetRuntimeForTests();
    });

    it('keeps the builtins and the lazy extension chunks out of the static imports of the boot set', () => {
        const boot = staticClosure([resolve(SRC, 'main.ts'), resolve(SRC, 'components/checkout-app.ts')]);
        expect(boot.has(resolve(SRC, 'components/checkout-shipping.ts'))).toBe(true);
        for (const lazy of [
            'components/extensions/builtins.ts',
            'components/extensions/order-comment.ts',
            'components/extensions/newsletter-optin.ts',
            'components/shipping-extension-host.ts',
            'components/address-fields.ts',
            'extension/runtime.ts',
        ]) {
            expect(boot.has(resolve(SRC, lazy)), lazy).toBe(false);
        }
    });
});

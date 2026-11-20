// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../i18n/en_US.json' with { type: 'json' };
import { bootstrap } from '../bootstrap.js';
import { setActiveCatalogForTests } from '../utils/i18n.js';

describe('bootstrap failure', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        document.body.innerHTML = '<div id="checkout-root"><p>skeleton</p></div>';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('shows one translated line and sends the reason to the console only', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const island = document.createElement('script');
        island.type = 'application/json';
        island.id = 'checkout-config';
        island.textContent = '{"broken": <html>Backend fetch failed</html>';
        document.body.appendChild(island);

        await expect(bootstrap()).rejects.toThrow();

        const root = document.getElementById('checkout-root')!;
        expect(root.querySelector('[role="alert"]')?.textContent).toBe(enUS['Hyperion_Checkout::bootstrap_error']);
        expect(root.textContent).not.toMatch(/JSON|checkout-config|Backend fetch failed|skeleton/);
        expect(logged).toHaveBeenCalledTimes(1);
        expect(String(logged.mock.calls[0]?.[1])).toContain('checkout-config');
    });
});

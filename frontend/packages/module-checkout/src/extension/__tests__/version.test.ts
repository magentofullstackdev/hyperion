// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normaliseCheckoutConfig } from '../../utils/checkout-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import { apiMajor, isSupportedApi } from '../api-version.js';
import { EXTENSION_API } from '../version.js';

const CONFIG_PROVIDER = resolve(
    __dirname,
    '../../../../../../app/code/Magentofullstackdev/HyperionCheckout/Model/ConfigProvider.php'
);

describe('extension API version', () => {
    it('is the version the server emits as hyperion.extensionApi', () => {
        const php = readFileSync(CONFIG_PROVIDER, 'utf8');
        const declared = /public const EXTENSION_API = '([^']+)';/.exec(php)?.[1];
        expect(declared).toBe(EXTENSION_API);
        expect(php).toContain("'extensionApi' => self::EXTENSION_API");
    });

    it('compares majors', () => {
        expect(apiMajor('1.0-beta')).toBe('1');
        expect(apiMajor(1)).toBe('1');
        expect(apiMajor('v1')).toBeNull();
        expect(isSupportedApi('1')).toBe(true);
        expect(isSupportedApi('1.4')).toBe(true);
        expect(isSupportedApi('2')).toBe(false);
        expect(isSupportedApi(undefined)).toBe(false);
    });

    it('fills in the extension keys a page from an older module does not carry', () => {
        const config = normaliseCheckoutConfig({ hyperion: { enabled: true } } as unknown as CheckoutConfig);
        expect(config.hyperion).toMatchObject({
            extensionApi: EXTENSION_API,
            staticOrigins: [],
            debug: { showUnsupportedPayments: false },
            paymentRenderers: [],
            expressButtons: [],
            shippingExtensions: [],
            extensions: [],
            addressFields: [],
        });
        const kept = normaliseCheckoutConfig({
            hyperion: { enabled: true, extensionApi: '1.1', extensions: [{ name: 'x' }], debug: { showUnsupportedPayments: true } },
        } as unknown as CheckoutConfig);
        expect(kept.hyperion.extensionApi).toBe('1.1');
        expect(kept.hyperion.extensions).toEqual([{ name: 'x' }]);
        expect(kept.hyperion.debug).toEqual({ showUnsupportedPayments: true });
    });
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it } from 'vitest';

import { importExtensionModule, resetExtensionLoaderForTests } from '../../../extension/loader.js';
import { NEWSLETTER_OPTIN_BUILTIN, ORDER_COMMENT_BUILTIN, registerCheckoutBuiltins } from '../builtins.js';

describe('first-party builtin extensions', () => {
    beforeEach(() => {
        resetExtensionLoaderForTests(() => 'https://shop.example');
        registerCheckoutBuiltins();
    });

    it('resolves each builtin id to its own module, with the API major and a default export', async () => {
        for (const builtin of [ORDER_COMMENT_BUILTIN, NEWSLETTER_OPTIN_BUILTIN]) {
            const module = await importExtensionModule({ id: builtin, moduleUrl: null, builtin }) as { hyperionApi: string; default: unknown };
            expect(module.hyperionApi).toBe('1');
            expect(typeof module.default).toBe('function');
        }
    });
});

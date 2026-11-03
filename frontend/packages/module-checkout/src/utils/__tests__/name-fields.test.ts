// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig, NameFieldsConfig } from '../../types/config.js';
import { formatFullName, hasRequiredNameFields, missingRequiredNameFields, readNameFieldsConfig } from '../name-fields.js';

function installConfig(nameFields: unknown): void {
    const base = guestFixture as unknown as CheckoutConfig;
    setCheckoutConfig({
        ...base,
        hyperion: { ...base.hyperion, ...(nameFields === undefined ? {} : { nameFields: nameFields as NameFieldsConfig }) },
    });
}

describe('readNameFieldsConfig', () => {
    beforeEach(() => installConfig(undefined));

    it('hides every field when the section is absent', () => {
        expect(readNameFieldsConfig()).toEqual({
            prefix: { show: 'no', options: [] },
            middlename: { show: 'no', options: [] },
            suffix: { show: 'no', options: [] },
        });
    });

    it('keeps the configured visibility and option lists', () => {
        installConfig({
            prefix: { show: 'req', options: ['Mr', 'Mrs', 'Ms'] },
            middlename: { show: 'opt' },
            suffix: { show: 'opt', options: [] },
        });
        expect(readNameFieldsConfig()).toEqual({
            prefix: { show: 'req', options: ['Mr', 'Mrs', 'Ms'] },
            middlename: { show: 'opt', options: [] },
            suffix: { show: 'opt', options: [] },
        });
    });

    it('falls back to hidden on malformed values', () => {
        installConfig({ prefix: { show: 'yes', options: 'Mr;Mrs' }, middlename: null });
        expect(readNameFieldsConfig()).toEqual({
            prefix: { show: 'no', options: [] },
            middlename: { show: 'no', options: [] },
            suffix: { show: 'no', options: [] },
        });
    });
});

describe('missingRequiredNameFields', () => {
    const cfg: NameFieldsConfig = {
        prefix: { show: 'req', options: ['Mr', 'Mrs'] },
        middlename: { show: 'opt' },
        suffix: { show: 'req', options: [] },
    };

    it('lists the required fields that are empty', () => {
        expect(missingRequiredNameFields({ firstname: 'A' }, cfg)).toEqual(['prefix', 'suffix']);
        expect(missingRequiredNameFields({ prefix: 'Mr', suffix: '  ' }, cfg)).toEqual(['suffix']);
        expect(missingRequiredNameFields({ prefix: 'Mr', suffix: 'Jr' }, cfg)).toEqual([]);
        expect(missingRequiredNameFields(null, cfg)).toEqual(['prefix', 'suffix']);
    });

    it('ignores optional and hidden fields', () => {
        expect(missingRequiredNameFields({}, {
            prefix: { show: 'opt' }, middlename: { show: 'opt' }, suffix: { show: 'no' },
        })).toEqual([]);
    });
});

describe('hasRequiredNameFields', () => {
    const cfg: NameFieldsConfig = {
        prefix: { show: 'req', options: ['Mr', 'Mrs'] },
        middlename: { show: 'no' },
        suffix: { show: 'no' },
    };

    it('requires the fields on a new address but accepts a saved one as is', () => {
        expect(hasRequiredNameFields({ firstname: 'A' }, cfg)).toBe(false);
        expect(hasRequiredNameFields({ firstname: 'A', prefix: 'Mr' }, cfg)).toBe(true);
        expect(hasRequiredNameFields({ id: '12', firstname: 'A' }, cfg)).toBe(true);
        expect(hasRequiredNameFields(null, cfg)).toBe(false);
    });
});

describe('formatFullName', () => {
    it('joins the present parts in display order', () => {
        expect(formatFullName({ prefix: 'Dr', firstname: 'Veronica', middlename: 'A.', lastname: 'Costello', suffix: 'PhD' }))
            .toBe('Dr Veronica A. Costello PhD');
        expect(formatFullName({ firstname: 'Veronica', lastname: 'Costello', prefix: null, middlename: ' ' }))
            .toBe('Veronica Costello');
    });
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    t,
    loadLocale,
    resolveLocale,
    resolveCatalogLocale,
    setActiveCatalogForTests,
    getActiveLocale,
} from '../i18n.js';
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import itIT from '../../i18n/it_IT.json' with { type: 'json' };

const PLACE_ORDER = 'Hyperion_Checkout::place_order';
const STREET_LINE = 'Hyperion_Checkout::street_label_additional';
const SHIPPING = 'Hyperion_Checkout::shipping_heading';

describe('i18n', () => {
    afterEach(() => {
        setActiveCatalogForTests({}, 'en_US');
        vi.restoreAllMocks();
    });

    it('returns the translated string for a known key', () => {
        setActiveCatalogForTests({ 'Hyperion_Checkout::hi': 'Hello' }, 'en_US');
        expect(t('Hyperion_Checkout::hi')).toBe('Hello');
    });

    it('interpolates {placeholder} parameters', () => {
        setActiveCatalogForTests({
            'Hyperion_Checkout::greeting': 'Hello {name}, you have {n} messages',
        });
        expect(
            t('Hyperion_Checkout::greeting', { name: 'Vero', n: 3 })
        ).toBe('Hello Vero, you have 3 messages');
    });

    it('falls back to key + warns when missing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setActiveCatalogForTests({}, 'en_US');
        const out = t('Hyperion_Checkout::missing');
        expect(out).toBe('Hyperion_Checkout::missing');
        expect(warn).toHaveBeenCalledOnce();
    });

    it('reports the active locale', () => {
        setActiveCatalogForTests({}, 'it_IT');
        expect(getActiveLocale()).toBe('it_IT');
    });

    describe('runtime translations from Magento', () => {
        it('override the static catalog when keyed by the English source string', async () => {
            await loadLocale({
                locale: 'de_DE',
                storeCode: 'default',
                translations: { [enUS[PLACE_ORDER]]: 'Bestellung aufgeben' },
            });
            expect(t(PLACE_ORDER)).toBe('Bestellung aufgeben');
        });

        it('override the static catalog when keyed by the Hyperion_Checkout key', async () => {
            await loadLocale({
                locale: 'it_IT',
                translations: { [PLACE_ORDER]: 'Concludi l\'ordine' },
            });
            expect(t(PLACE_ORDER)).toBe('Concludi l\'ordine');
        });

        it('fall back to the static catalog for a key the dictionary lacks', async () => {
            await loadLocale({
                locale: 'it_IT',
                translations: { [enUS[PLACE_ORDER]]: 'Effettua ordine' },
            });
            expect(t(PLACE_ORDER)).toBe('Effettua ordine');
            expect(t(SHIPPING)).toBe(itIT[SHIPPING]);
        });

        it('ignore empty strings and keep the static text', async () => {
            await loadLocale({
                locale: 'en_US',
                translations: { [enUS[PLACE_ORDER]]: '' },
            });
            expect(t(PLACE_ORDER)).toBe(enUS[PLACE_ORDER]);
        });

        it('interpolate placeholders of the translated text', async () => {
            await loadLocale({
                locale: 'de_DE',
                translations: { [enUS[STREET_LINE]]: 'Adresszeile {n}' },
            });
            expect(t(STREET_LINE, { n: 3 })).toBe('Adresszeile 3');
        });

        it('are dropped on the next load without a dictionary', async () => {
            await loadLocale({
                locale: 'en_US',
                translations: { [enUS[PLACE_ORDER]]: 'Bestellung aufgeben' },
            });
            await loadLocale({ locale: 'en_US' });
            expect(t(PLACE_ORDER)).toBe(enUS[PLACE_ORDER]);
        });

        it('serve a locale without a static catalog from the dictionary alone, silently', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await loadLocale({
                locale: 'fr_FR',
                translations: { [enUS[PLACE_ORDER]]: 'Passer la commande' },
            });
            expect(getActiveLocale()).toBe('fr_FR');
            expect(t(PLACE_ORDER)).toBe('Passer la commande');
            // Strings the dictionary lacks come from en_US.
            expect(t(STREET_LINE, { n: 1 })).toBe(enUS[STREET_LINE].replace('{n}', '1'));
            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe('locale resolution', () => {
        it('prefers the resolved Magento locale over the store code', () => {
            expect(resolveLocale({ locale: 'de_DE', storeCode: 'it' })).toBe('de_DE');
        });

        it('falls back to the store code when no locale is given', () => {
            expect(resolveLocale({ locale: null, storeCode: 'it' })).toBe('it_IT');
            expect(resolveLocale({ storeCode: 'en' })).toBe('en_US');
            expect(resolveLocale({ storeCode: 'it_IT' })).toBe('it_IT');
        });

        it('resolves en_US when neither value is a locale', () => {
            expect(resolveLocale({ locale: '', storeCode: 'default' })).toBe('en_US');
            expect(resolveLocale({})).toBe('en_US');
        });

        it('normalises BCP 47 and lower case region codes', () => {
            expect(resolveLocale({ locale: 'it-IT' })).toBe('it_IT');
            expect(resolveLocale({ locale: 'de_de' })).toBe('de_DE');
        });

        it('maps a locale to the static catalog of its language', () => {
            expect(resolveCatalogLocale('it_IT')).toBe('it_IT');
            expect(resolveCatalogLocale('it_CH')).toBe('it_IT');
            expect(resolveCatalogLocale('en_GB')).toBe('en_US');
            expect(resolveCatalogLocale('de_DE')).toBeNull();
        });

        it('loads the Italian catalog for the it store code', async () => {
            await loadLocale('it');
            expect(getActiveLocale()).toBe('it_IT');
            expect(t(PLACE_ORDER)).toBe(itIT[PLACE_ORDER]);
        });

        it('warns and keeps en_US for an unknown locale without a dictionary', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await loadLocale({ locale: 'de_DE' });
            expect(getActiveLocale()).toBe('de_DE');
            expect(t(PLACE_ORDER)).toBe(enUS[PLACE_ORDER]);
            expect(warn).toHaveBeenCalledOnce();
        });
    });
});

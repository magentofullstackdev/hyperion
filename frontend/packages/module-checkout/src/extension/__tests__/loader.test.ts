// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import {
    allowedModuleUrl,
    ExtensionImportTimeout,
    IMPORT_TIMEOUT_MS,
    importExtensionModule,
    isAllowedExtensionTag,
    loadExtensionElement,
    registerBuiltinModule,
    resetExtensionLoaderForTests,
    setModuleImporterForTests,
} from '../loader.js';

const ORIGIN = 'https://shop.example';

let tagIndex = 0;
/** A tag no other test defined (the custom element registry lives as long as the file). */
function freshTag(): string {
    tagIndex += 1;
    return `vendor-probe-${tagIndex}`;
}

function defineElement(tag: string, hyperionApi?: unknown): void {
    class Probe extends HTMLElement {}
    if (hyperionApi !== undefined) (Probe as unknown as { hyperionApi: unknown }).hyperionApi = hyperionApi;
    customElements.define(tag, Probe);
}

function configure(hyperion: Record<string, unknown> = {}): void {
    setCheckoutConfig({ hyperion: { extensionApi: '1.0-beta', staticOrigins: [], ...hyperion } } as unknown as CheckoutConfig);
}

describe('extension loader', () => {
    let errors: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetExtensionLoaderForTests(() => ORIGIN);
        configure();
        errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        setModuleImporterForTests(null);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('module origin', () => {
        it('accepts the page origin and refuses another origin, a script URL and a protocol relative URL', () => {
            expect(allowedModuleUrl(`${ORIGIN}/static/Vendor_Psp/js/card.js`)?.href).toBe(`${ORIGIN}/static/Vendor_Psp/js/card.js`);
            expect(allowedModuleUrl('/static/Vendor_Psp/js/card.js')?.origin).toBe(ORIGIN);
            expect(allowedModuleUrl('https://evil.example/card.js')).toBeNull();
            expect(allowedModuleUrl('javascript:alert(1)')).toBeNull();
            expect(allowedModuleUrl('//evil.example/card.js')).toBeNull();
            expect(allowedModuleUrl('')).toBeNull();
        });

        it('accepts an origin the server lists as a static origin', () => {
            configure({ staticOrigins: ['https://static.shop.example'] });
            expect(allowedModuleUrl('https://static.shop.example/card.js')?.href).toBe('https://static.shop.example/card.js');
            expect(allowedModuleUrl('https://other.shop.example/card.js')).toBeNull();
        });

        it('never imports a module from a refused origin', async () => {
            const importer = vi.fn(() => Promise.resolve({}));
            setModuleImporterForTests(importer);
            const result = await loadExtensionElement({ id: 'x', tag: freshTag(), moduleUrl: 'https://evil.example/x.js', builtin: null });
            expect(result.state).toBe('load-failed');
            expect(importer).not.toHaveBeenCalled();
        });
    });

    describe('tags', () => {
        it('accepts a valid custom element name and refuses the prefixes the checkout and the theme own', () => {
            expect(isAllowedExtensionTag('vendor-psp-card')).toBe(true);
            expect(isAllowedExtensionTag('vendorcard')).toBe(false);
            expect(isAllowedExtensionTag('Vendor-Card')).toBe(false);
            for (const tag of ['hyperion-card', 'hc-card', 'checkout-card', 'payment-card', 'shipping-card', 'address-card',
                'order-card', 'summary-card', 'place-card', 'coupon-card', 'loading-card', 'error-card']) {
                expect(isAllowedExtensionTag(tag)).toBe(false);
                expect(isAllowedExtensionTag(tag, true)).toBe(true);
            }
        });
    });

    describe('loading an element', () => {
        it('is ready once the module defined the tag with the major of the checkout', async () => {
            const tag = freshTag();
            setModuleImporterForTests(() => {
                defineElement(tag, '1');
                return Promise.resolve({});
            });
            const result = await loadExtensionElement({ id: 'psp', tag, moduleUrl: `${ORIGIN}/card.js`, builtin: null });
            expect(result.state).toBe('ready');
            expect(result.elementClass).toBe(customElements.get(tag));
        });

        it('is a version mismatch for a class without hyperionApi or with another major', async () => {
            const missing = freshTag();
            const later = freshTag();
            defineElement(missing);
            defineElement(later, '2');
            expect((await loadExtensionElement({ tag: missing, moduleUrl: `${ORIGIN}/a.js`, builtin: null })).state).toBe('version-mismatch');
            expect((await loadExtensionElement({ tag: later, moduleUrl: `${ORIGIN}/b.js`, builtin: null })).state).toBe('version-mismatch');
            expect(String(errors.mock.calls.at(-1)?.[0])).toContain('declared API "2"');
        });

        it('times out when the module never defines its tag', async () => {
            vi.useFakeTimers();
            setModuleImporterForTests(() => Promise.resolve({}));
            const pending = loadExtensionElement({ id: 'slow', tag: freshTag(), moduleUrl: `${ORIGIN}/slow.js`, builtin: null });
            await vi.advanceTimersByTimeAsync(8000);
            const result = await pending;
            expect(result.state).toBe('timeout');
            expect(String(errors.mock.calls[0]?.[0])).toContain('id "slow"');
        });

        it('reports a module that throws as load-failed, with the id, the tag, the URL and both versions', async () => {
            setModuleImporterForTests(() => Promise.reject(new Error('CSP')));
            const tag = freshTag();
            const result = await loadExtensionElement({ id: 'psp', tag, moduleUrl: `${ORIGIN}/card.js`, builtin: null });
            expect(result.state).toBe('load-failed');
            const line = String(errors.mock.calls[0]?.[0]);
            expect(line).toContain('id "psp"');
            expect(line).toContain(`tag "${tag}"`);
            expect(line).toContain(`module "${ORIGIN}/card.js"`);
            expect(line).toContain('checkout API "1.0-beta"');
        });

        it('loads a first-party module through its registered resolver', async () => {
            const tag = freshTag();
            registerBuiltinModule('order-comment', () => {
                defineElement(tag, '1');
                return Promise.resolve({});
            });
            const importer = vi.fn();
            setModuleImporterForTests(importer);
            const result = await loadExtensionElement({ tag, moduleUrl: null, builtin: 'order-comment' });
            expect(result.state).toBe('ready');
            expect(importer).not.toHaveBeenCalled();
        });
    });

    describe('one import per module', () => {
        it('shares one promise between the callers of the same URL', async () => {
            const importer = vi.fn(() => Promise.resolve({ ok: true }));
            setModuleImporterForTests(importer);
            const a = importExtensionModule({ moduleUrl: `${ORIGIN}/same.js`, builtin: null });
            const b = importExtensionModule({ moduleUrl: `${ORIGIN}/same.js`, builtin: null });
            expect(a).toBe(b);
            await a;
            await importExtensionModule({ moduleUrl: `${ORIGIN}/same.js`, builtin: null });
            expect(importer).toHaveBeenCalledTimes(1);
        });

        it('forgets a failed import and retries with a marked URL', async () => {
            const importer = vi.fn()
                .mockRejectedValueOnce(new Error('network'))
                .mockRejectedValueOnce(new Error('network'))
                .mockResolvedValueOnce({});
            setModuleImporterForTests(importer);
            const descriptor = { moduleUrl: `${ORIGIN}/flaky.js?v=3`, builtin: null };
            await expect(importExtensionModule(descriptor)).rejects.toThrow('network');
            await expect(importExtensionModule(descriptor)).rejects.toThrow('network');
            await expect(importExtensionModule(descriptor)).resolves.toEqual({});
            expect(importer.mock.calls.map((call) => call[0])).toEqual([
                `${ORIGIN}/flaky.js?v=3`,
                `${ORIGIN}/flaky.js?v=3&hyperion_retry=1`,
                `${ORIGIN}/flaky.js?v=3&hyperion_retry=2`,
            ]);
        });
    });

    describe('a module that never loads', () => {
        it('gives up after the time limit as a timeout, and a retry imports again with the retry marker', async () => {
            vi.useFakeTimers();
            const urls: string[] = [];
            setModuleImporterForTests((url) => {
                urls.push(url);
                return new Promise(() => undefined);
            });
            const tag = freshTag();
            const moduleUrl = `${ORIGIN}/static/Vendor_Psp/js/stalled.js`;

            const first = loadExtensionElement({ id: 'vendor_stalled', tag, moduleUrl, builtin: null });
            await vi.advanceTimersByTimeAsync(IMPORT_TIMEOUT_MS + 1);
            await expect(first).resolves.toEqual({ state: 'timeout', elementClass: null });

            const second = importExtensionModule({ id: 'vendor_stalled', moduleUrl, builtin: null });
            const settled = expect(second).rejects.toBeInstanceOf(ExtensionImportTimeout);
            await vi.advanceTimersByTimeAsync(IMPORT_TIMEOUT_MS + 1);
            await settled;
            expect(urls).toEqual([moduleUrl, `${moduleUrl}?hyperion_retry=1`]);
            expect(errors).toHaveBeenCalled();
        });

        it('a retry that fails because the late first import defined the tag answers ready', async () => {
            vi.useFakeTimers();
            const tag = freshTag();
            const moduleUrl = `${ORIGIN}/static/Vendor_Psp/js/late.js`;
            let arrive: () => void = () => undefined;
            setModuleImporterForTests((url) => {
                if (!url.includes('hyperion_retry')) {
                    return new Promise((resolve) => {
                        arrive = (): void => {
                            defineElement(tag, '1');
                            resolve({});
                        };
                    });
                }
                // The module evaluated again: its define() throws on the tag the first one defined.
                return new Promise((_, reject) => setTimeout(() => reject(new DOMException('already defined', 'NotSupportedError')), 10));
            });
            const descriptor = { id: 'vendor_late', tag, moduleUrl, builtin: null };

            const first = loadExtensionElement(descriptor);
            await vi.advanceTimersByTimeAsync(IMPORT_TIMEOUT_MS + 1);
            await expect(first).resolves.toMatchObject({ state: 'timeout' });

            const retry = loadExtensionElement(descriptor);
            arrive();
            await vi.advanceTimersByTimeAsync(20);
            await expect(retry).resolves.toMatchObject({ state: 'ready' });
        });

        it('bounds a first-party chunk that never arrives too', async () => {
            vi.useFakeTimers();
            registerBuiltinModule('stalled-builtin', () => new Promise(() => undefined));
            const pending = loadExtensionElement({ id: 'stalled', tag: 'hc-payment-stalled', moduleUrl: null, builtin: 'stalled-builtin', internal: true });
            await vi.advanceTimersByTimeAsync(IMPORT_TIMEOUT_MS + 1);
            await expect(pending).resolves.toMatchObject({ state: 'timeout' });
        });
    });
});

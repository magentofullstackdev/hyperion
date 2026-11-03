// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import '../hyperion-gtag.js';
import { mount } from './helpers.js';

const calls = () => (window.dataLayer || []).map((args) => Array.from(args));
const events = () => calls().filter((c) => c[0] === 'event');
const scripts = () => document.head.querySelectorAll('script[data-hyperion-gtag-script]');
const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const block = (name, payload) => `<span data-hyperion-gtag-event="${name}" data-hyperion-gtag-payload="${escape(JSON.stringify(payload))}" hidden></span>`;

function element(attrs = {}) {
    const el = document.createElement('hyperion-gtag');
    el.setAttribute('measurement-id', 'G-TEST12345');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

describe('<hyperion-gtag>', () => {
    beforeEach(() => {
        delete window.dataLayer;
        delete window.gtag;
        document.cookie = 'user_allowed_save_cookie=; max-age=0; path=/';
    });
    afterEach(() => {
        scripts().forEach((s) => s.remove());
    });

    test('configures the measurement id in the dataLayer without loading gtag.js', async () => {
        await mount(element());
        expect(calls()[0][0]).toBe('js');
        expect(calls()[1]).toEqual(['config', 'G-TEST12345', { anonymize_ip: true }]);
        expect(scripts()).toHaveLength(0);
    });

    test('pushes every event record of the page once', async () => {
        document.body.innerHTML = block('view_item', { currency: 'USD', value: 5, items: [{ item_id: 'A' }] });
        const el = await mount(element());
        expect(events()).toEqual([['event', 'view_item', { currency: 'USD', value: 5, items: [{ item_id: 'A' }] }]]);
        expect(el.processEvents()).toBe(0);
        expect(events()).toHaveLength(1);
    });

    test('loads gtag.js on the first interaction', async () => {
        await mount(element());
        window.dispatchEvent(new Event('pointerdown'));
        expect(scripts()).toHaveLength(1);
        expect(scripts()[0].src).toContain('googletagmanager.com/gtag/js?id=G-TEST12345');
        window.dispatchEvent(new Event('keydown'));
        expect(scripts()).toHaveLength(1);
    });

    test('with the cookie restriction waits for the consent of this website', async () => {
        const el = await mount(element({ 'website-id': '1', 'consent-required': '' }));
        window.dispatchEvent(new Event('pointerdown'));
        expect(scripts()).toHaveLength(0);
        document.cookie = 'user_allowed_save_cookie=' + encodeURIComponent('{"2":1}') + '; path=/';
        expect(el.load()).toBe(false);
        document.cookie = 'user_allowed_save_cookie=' + encodeURIComponent('{"1":1}') + '; path=/';
        document.dispatchEvent(new CustomEvent('hyperion:cookie-consent', { detail: { 1: 1 } }));
        expect(scripts()).toHaveLength(1);
    });

    test('a purchase also sends the Google Ads conversion', async () => {
        document.body.innerHTML = block('purchase', { transaction_id: '100000001', value: 46.81, currency: 'USD', items: [] });
        await mount(element({ 'ads-id': 'AW-123', 'ads-label': 'abcDEF' }));
        expect(calls()).toContainEqual(['config', 'AW-123']);
        expect(events()[0][1]).toBe('purchase');
        expect(events()[1]).toEqual(['event', 'conversion', { send_to: 'AW-123/abcDEF', value: 46.81, currency: 'USD', transaction_id: '100000001' }]);
    });

    test('picks up records swapped in by HTMX', async () => {
        await mount(element());
        const target = document.createElement('div');
        target.id = 'hyperion-gtag-events';
        target.innerHTML = block('add_to_cart', { currency: 'USD', value: 34, items: [{ item_id: '24-MB01', quantity: 1 }] });
        document.body.appendChild(target);
        target.dispatchEvent(new CustomEvent('htmx:oobAfterSwap', { bubbles: true }));
        expect(events().map((e) => e[1])).toEqual(['add_to_cart']);
    });
});

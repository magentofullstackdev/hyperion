// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-recaptcha -- Google's API must never load with the page, only
// once the shopper interacts with the protected form.

import { describe, test, expect, afterEach, vi } from 'vitest';
import '../hyperion-recaptcha.js';
import { mount } from './helpers.js';

const apiScripts = () => [...document.head.querySelectorAll('script[src*="recaptcha/api.js"]')];

function form(siteKey) {
    const el = document.createElement('form');
    el.innerHTML = `
        <input type="email" name="email">
        <hyperion-recaptcha type="v3" site-key="${siteKey}" action="newsletter">
            <input type="hidden" name="g-recaptcha-response" value="" data-hyperion-recaptcha-token>
        </hyperion-recaptcha>
    `;
    return el;
}

describe('hyperion-recaptcha -- lazy API load', () => {
    afterEach(() => { apiScripts().forEach((script) => script.remove()); });

    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-recaptcha')).toBeTypeOf('function');
    });

    test('does not request the Google API when the form is rendered', async () => {
        await mount(form('key-a'));
        expect(apiScripts()).toHaveLength(0);
    });

    test('requests the API once, on the first interaction with the form', async () => {
        const el = await mount(form('key-b'));
        const email = el.querySelector('input[type="email"]');

        email.dispatchEvent(new Event('focusin', { bubbles: true }));
        email.dispatchEvent(new Event('keydown', { bubbles: true }));
        email.dispatchEvent(new Event('focusin', { bubbles: true }));

        expect(apiScripts()).toHaveLength(1);
        expect(apiScripts()[0].src).toContain('render=key-b');
    });
});

describe('hyperion-recaptcha -- reduced motion', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    // The widget highlight scrolls the page on a failed token: an instant
    // jump when the visitor asked for reduced motion.
    test.each([
        [true, 'auto'],
        [false, 'smooth'],
    ])('reduce=%s: the failed-token highlight scrolls with behavior %s', async (reduce, behavior) => {
        vi.stubGlobal('matchMedia', vi.fn((query) => ({
            matches: reduce && query === '(prefers-reduced-motion: reduce)',
            media: query,
        })));
        const el = document.createElement('form');
        el.innerHTML = `
            <hyperion-recaptcha type="v2-invisible" site-key="key-rm">
                <input type="hidden" name="g-recaptcha-response" value="" data-hyperion-recaptcha-token>
                <div data-hyperion-recaptcha-widget></div>
            </hyperion-recaptcha>
        `;
        await mount(el);
        const host = el.querySelector('[data-hyperion-recaptcha-widget]');
        host.scrollIntoView = vi.fn();
        el.querySelector('hyperion-recaptcha')._highlight();
        expect(host.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior });
    });
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-recaptcha -- Google's API must never load with the page, only
// once the shopper interacts with the protected form; and a token that
// cannot be had must not strand the shopper nor loop.

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

describe('hyperion-recaptcha -- no token available', () => {
    const settle = async () => {
        for (let i = 0; i < 3; i += 1) await new Promise((resolve) => { setTimeout(resolve, 0); });
    };
    let scripts;
    let submitEvents;
    let delivered;
    let countSubmit;

    // Holds the Google script elements back from the document, so each test
    // decides whether the script loads or fails.
    function holdScripts() {
        scripts = [];
        const append = document.head.appendChild.bind(document.head);
        vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
            if (node.tagName !== 'SCRIPT') return append(node);
            scripts.push(node);
            return node;
        });
    }

    // Counts the submit events of one attempt (capture phase, before the
    // component) and cuts a runaway re-submission loop after three, so a
    // regression fails the assertions instead of hanging the run.
    function watch(el) {
        delivered = [];
        countSubmit = (event) => {
            submitEvents += 1;
            if (submitEvents > 3) event.stopImmediatePropagation();
        };
        document.addEventListener('submit', countSubmit, true);
        // What the form's own handlers (the browser, htmx) get to see.
        el.addEventListener('submit', (event) => {
            delivered.push(event.defaultPrevented);
            event.preventDefault();
        });
    }

    function submit(el) {
        submitEvents = 0;
        el.requestSubmit();
    }

    async function mountWatched(siteKey) {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        holdScripts();
        const el = await mount(form(siteKey));
        watch(el);
        return el;
    }

    afterEach(() => {
        document.removeEventListener('submit', countSubmit, true);
        delete window.grecaptcha;
        vi.restoreAllMocks();
    });

    test('a blocked Google script ends in exactly one submission without a token', async () => {
        const el = await mountWatched('key-blocked');

        submit(el);
        expect(delivered).toHaveLength(0);
        expect(scripts).toHaveLength(1);
        scripts[0].onerror(new Event('error'));
        await settle();

        expect(submitEvents).toBe(2);
        expect(delivered).toEqual([false]);
        expect(el.querySelector('[data-hyperion-recaptcha-token]').value).toBe('');
    });

    test('the next submission after a failed load requests the Google script again', async () => {
        const el = await mountWatched('key-retry');

        submit(el);
        scripts[0].onerror(new Event('error'));
        await settle();
        expect(delivered).toEqual([false]);

        submit(el);
        expect(scripts).toHaveLength(2);
        expect(delivered).toEqual([false]);

        window.grecaptcha = { ready: (callback) => callback(), execute: vi.fn(() => Promise.resolve('token-1')) };
        scripts[1].onload(new Event('load'));
        await settle();

        expect(window.grecaptcha.execute).toHaveBeenCalledWith('key-retry', { action: 'newsletter' });
        expect(delivered).toEqual([false, false]);
        expect(submitEvents).toBe(2);
    });

    test('a script that loads without the API is not cached either', async () => {
        const el = await mountWatched('key-empty');

        submit(el);
        scripts[0].onload(new Event('load'));
        await settle();
        expect(delivered).toEqual([false]);

        submit(el);
        expect(scripts).toHaveLength(2);
    });

    test('a rejected grecaptcha.execute() ends in exactly one submission too', async () => {
        window.grecaptcha = { ready: (callback) => callback(), execute: vi.fn(() => Promise.reject(new Error('timeout'))) };
        const el = await mountWatched('key-execute');

        submit(el);
        scripts[0].onload(new Event('load'));
        await settle();

        expect(window.grecaptcha.execute).toHaveBeenCalledTimes(1);
        expect(submitEvents).toBe(2);
        expect(delivered).toEqual([false]);

        submit(el);
        await settle();

        expect(scripts).toHaveLength(1);
        expect(window.grecaptcha.execute).toHaveBeenCalledTimes(2);
        expect(submitEvents).toBe(2);
        expect(delivered).toEqual([false, false]);
    });

    test('a form that turned invalid does not keep the bypass for a later submission', async () => {
        const el = await mountWatched('key-invalid');
        const email = el.querySelector('input[type="email"]');
        email.value = 'shopper@example.com';

        submit(el);
        // The shopper empties a required field while the token is pending.
        email.required = true;
        email.value = '';
        scripts[0].onerror(new Event('error'));
        await settle();
        expect(delivered).toHaveLength(0);

        email.value = 'shopper@example.com';
        submit(el);
        expect(delivered).toHaveLength(0);
        expect(scripts).toHaveLength(2);
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

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-messages -- the `mage-messages` cookie is untrusted input.
//
// The allowlist itself is tested in the checkout package
// (src/utils/__tests__/sanitize-message.test.ts, jsdom). happy-dom 14 is not
// a faithful stand-in for the browser here: its DOMParser evaluates scripts
// and its serializer does not escape text, so script evaluation is switched
// off for this file and the assertions read the DOM, not the markup.

import { describe, test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import '../hyperion-messages.js';

function setCookie(messages) {
    document.cookie = `mage-messages=${encodeURIComponent(JSON.stringify(messages))}; path=/`;
}

function mount() {
    const element = document.createElement('hyperion-messages');
    element.scrollIntoView = () => {};
    document.body.appendChild(element);
    return element;
}

// What htmx dispatches when a request is over; `headers` are the response headers the listener may read.
function requestFinished(headers = {}) {
    const xhr = { getResponseHeader: (name) => headers[name] ?? null };
    document.body.dispatchEvent(new CustomEvent('htmx:afterRequest', { bubbles: true, detail: { xhr } }));
}

let evaluation;
beforeAll(() => {
    evaluation = window.happyDOM.settings.disableJavaScriptEvaluation;
    window.happyDOM.settings.disableJavaScriptEvaluation = true;
});
afterAll(() => {
    window.happyDOM.settings.disableJavaScriptEvaluation = evaluation;
});

afterEach(() => {
    document.querySelectorAll('hyperion-messages').forEach((element) => element.remove());
    document.cookie = 'form_key=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'mage-messages=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    delete window.__pwned;
});

describe('<hyperion-messages>', () => {
    test('renders one alert per message and deletes the cookie', () => {
        setCookie([
            { type: 'success', text: 'You added Bag to your <a href="https://shop.example/checkout/cart/">shopping cart</a>.' },
            { type: 'error', text: 'Invalid <strong>login</strong>.' },
            { type: 'error', text: '' },
        ]);
        const alerts = mount().querySelectorAll('[role="alert"]');
        expect(alerts.length).toBe(2);
        expect(alerts[0].getAttribute('data-tone')).toBe('success');
        expect(alerts[0].querySelector('a').getAttribute('href')).toBe('https://shop.example/checkout/cart/');
        expect(alerts[0].textContent).toBe('You added Bag to your shopping cart.');
        expect(alerts[1].querySelector('strong').textContent).toBe('login');
        expect(document.cookie).not.toContain('mage-messages=%5B');
    });

    test('renders a hostile cookie inert', () => {
        window.__pwned = 0;
        setCookie([{
            type: 'error',
            text: 'Hello<img src=x onerror="window.__pwned = 1"><script>window.__pwned = 2</script>'
                + '<a href="javascript:window.__pwned = 3" onclick="window.__pwned = 4">link</a>',
        }]);
        const element = mount();
        const alert = element.querySelector('[role="alert"]');
        expect(alert.textContent).toBe('Hellolink');
        expect(alert.querySelector('a').attributes.length).toBe(0);
        expect(alert.querySelectorAll('*').length).toBe(1);
        expect(element.querySelector('img, script')).toBeNull();
        expect(window.__pwned).toBe(0);
    });

    test('skips a message that holds nothing to show', () => {
        setCookie([{ type: 'error', text: '<script>alert(1)</script>' }]);
        expect(mount().querySelector('[role="alert"]')).toBeNull();
    });

    test('renders a message cookie that arrives after the element connected when the next htmx request finishes', () => {
        const element = mount();
        expect(element.querySelector('[role="alert"]')).toBeNull();
        setCookie([{ type: 'error', text: 'Something went wrong with reCAPTCHA.' }]);
        expect(element.querySelector('[role="alert"]')).toBeNull();
        requestFinished();
        const alerts = element.querySelectorAll('[role="alert"]');
        expect(alerts.length).toBe(1);
        expect(alerts[0].getAttribute('data-tone')).toBe('error');
        expect(alerts[0].textContent).toBe('Something went wrong with reCAPTCHA.');
        expect(document.cookie).not.toContain('mage-messages=%5B');
    });

    test('renders a late message once even when several htmx requests finish', () => {
        const element = mount();
        setCookie([{ type: 'success', text: 'Thank you for your subscription.' }]);
        requestFinished();
        requestFinished();
        requestFinished();
        expect(element.querySelectorAll('[role="alert"]').length).toBe(1);
    });

    test('keeps the messages already on screen when a late one arrives', () => {
        setCookie([{ type: 'success', text: 'First.' }]);
        const element = mount();
        setCookie([{ type: 'error', text: 'Second.' }]);
        requestFinished();
        const texts = [...element.querySelectorAll('[role="alert"]')].map((alert) => alert.textContent);
        expect(texts).toEqual(['First.', 'Second.']);
    });

    test('renders a late message in one element only when the page holds two', () => {
        const first = mount();
        const second = mount();
        setCookie([{ type: 'notice', text: 'Only once.' }]);
        requestFinished();
        expect(first.querySelectorAll('[role="alert"]').length).toBe(1);
        expect(second.querySelectorAll('[role="alert"]').length).toBe(0);
    });

    test('renders nothing and leaves the other cookies alone when no message cookie arrives', () => {
        document.cookie = 'form_key=abc123; path=/';
        const element = mount();
        const before = document.cookie;
        requestFinished();
        requestFinished();
        expect(element.childElementCount).toBe(0);
        expect(document.cookie).toBe(before);
        expect(document.cookie).toContain('form_key=abc123');
    });

    test('leaves the cookie for the next page when the response redirects the browser', () => {
        const element = mount();
        setCookie([{ type: 'error', text: 'Sign in first.' }]);
        requestFinished({ 'HX-Redirect': 'https://shop.example/customer/account/login/' });
        expect(element.querySelector('[role="alert"]')).toBeNull();
        expect(document.cookie).toContain('mage-messages=%5B');
    });

    test('stops reading the cookie once it is removed from the page', () => {
        const element = mount();
        element.remove();
        setCookie([{ type: 'error', text: 'Too late.' }]);
        requestFinished();
        expect(element.querySelector('[role="alert"]')).toBeNull();
        expect(document.cookie).toContain('mage-messages=%5B');
    });
});

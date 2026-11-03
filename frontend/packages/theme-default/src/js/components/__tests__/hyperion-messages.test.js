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

let evaluation;
beforeAll(() => {
    evaluation = window.happyDOM.settings.disableJavaScriptEvaluation;
    window.happyDOM.settings.disableJavaScriptEvaluation = true;
});
afterAll(() => {
    window.happyDOM.settings.disableJavaScriptEvaluation = evaluation;
});

afterEach(() => {
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
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Message allowlist of the shared sanitizer, used by the theme's
// <hyperion-messages> and the PayPal notifier.

import { describe, test, expect, afterEach } from 'vitest';
import { sanitizeMessageHtml, htmlToText } from '@magentofullstackdev/hyperion-shared/html';

declare global {
    interface Window { __pwned?: number }
}

afterEach(() => {
    delete window.__pwned;
});

describe('sanitizeMessageHtml', () => {
    test('keeps the tags core allows in messages', () => {
        const html = '<div><span>a</span> <b>b</b> <strong>c</strong> <i>d</i> <em>e</em> <u>f</u></div>';
        expect(sanitizeMessageHtml(html)).toBe(html);
    });

    test('keeps links to relative and http(s) targets', () => {
        expect(sanitizeMessageHtml('You added Bag to your <a href="/checkout/cart/">shopping cart</a>.'))
            .toBe('You added Bag to your <a href="/checkout/cart/">shopping cart</a>.');
        expect(sanitizeMessageHtml('<a href="https://shop.example/x?a=1&amp;b=2">here</a>'))
            .toContain('href="https://shop.example/x?a=1&amp;b=2"');
        expect(sanitizeMessageHtml('<a href="checkout/cart">cart</a>')).toContain('href="checkout/cart"');
    });

    test('keeps only href on links', () => {
        const out = sanitizeMessageHtml('<a href="/x" onclick="x()" style="top:0" class="c" title="t" target="_blank">x</a>');
        expect(out).toContain('href="/x"');
        expect(out).not.toMatch(/onclick|style|class|title|target/);
    });

    test.each([
        'javascript:alert(1)',
        ' JaVaScRiPt:alert(1)',
        'java\tscript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'mailto:a@b.example',
        'tel:+12025550100',
    ])('drops the href %s', (href) => {
        const link = document.createElement('a');
        link.setAttribute('href', href);
        link.textContent = 'x';
        expect(sanitizeMessageHtml(link.outerHTML)).toBe('<a>x</a>');
    });

    test('drops scripts, styles and embedded content with their content', () => {
        expect(sanitizeMessageHtml('a<script>alert(1)</script><style>*{}</style><iframe src="x"></iframe><svg onload="x()"><a href="/y">y</a></svg>b'))
            .toBe('ab');
    });

    test('unwraps other elements and drops their attributes', () => {
        expect(sanitizeMessageHtml('<p onclick="x()">a<img src="x" onerror="alert(1)"><form action="/x"><input name="q">b</form></p>'))
            .toBe('ab');
        expect(sanitizeMessageHtml('<div onmouseover="x()" style="position:fixed" id="html-body">a</div>'))
            .toBe('<div>a</div>');
    });

    test('text stays text', () => {
        expect(sanitizeMessageHtml('1 &lt; 2 &amp; &lt;script&gt;')).toBe('1 &lt; 2 &amp; &lt;script&gt;');
        expect(sanitizeMessageHtml('')).toBe('');
    });

    test('never runs the markup while parsing', () => {
        window.__pwned = 0;
        sanitizeMessageHtml('<img src="x" onerror="window.__pwned = 1"><script>window.__pwned = 2</script>');
        htmlToText('<img src="x" onerror="window.__pwned = 1"><script>window.__pwned = 2</script>');
        expect(window.__pwned).toBe(0);
    });
});

describe('htmlToText', () => {
    test('returns the text without markup or script content', () => {
        expect(htmlToText('Payment <b>declined</b><script>alert(1)</script>.')).toBe('Payment declined.');
    });
});

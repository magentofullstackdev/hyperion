// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect } from 'vitest';
import { htmlToText, sanitiseHtml } from '../sanitize-html.js';

describe('sanitiseHtml', () => {
    it('preserves allowed inline formatting tags', () => {
        expect(sanitiseHtml('<p>Pay via <strong>check</strong>.</p>'))
            .toBe('<p>Pay via <strong>check</strong>.</p>');
    });

    it('strips disallowed tags but keeps inner text', () => {
        const out = sanitiseHtml('<p>Hi <font color="red">you</font> there</p>');
        expect(out).toBe('<p>Hi you there</p>');
    });

    it('drops scripts and styles with their content', () => {
        const out = sanitiseHtml('<p>Hi <script>alert(1)</script><style>p{}</style>there</p>');
        expect(out).toBe('<p>Hi there</p>');
    });

    it('drops event handlers and images', () => {
        const out = sanitiseHtml('<p onclick="x()">a<img src="x" onerror="alert(1)">b</p>');
        expect(out).toBe('<p>ab</p>');
    });

    it('strips iframes entirely', () => {
        expect(sanitiseHtml('<p>a<iframe src="x"></iframe>b</p>'))
            .toBe('<p>ab</p>');
    });

    it('drops attributes except href/title/rel/target on <a>', () => {
        const out = sanitiseHtml(
            '<a href="/foo" onclick="x" data-trap="y" title="go">go</a>'
        );
        expect(out).toContain('href="/foo"');
        expect(out).toContain('title="go"');
        expect(out).not.toContain('onclick');
        expect(out).not.toContain('data-trap');
    });

    it('enforces rel=noopener on external links', () => {
        const out = sanitiseHtml('<a href="https://evil.example/">click</a>');
        expect(out).toContain('rel="noopener noreferrer"');
    });

    it('strips javascript: hrefs', () => {
        const out = sanitiseHtml('<a href="javascript:alert(1)">click</a>');
        expect(out).not.toContain('javascript:');
        expect(out).not.toContain('href');
    });

    it('strips data: hrefs', () => {
        const out = sanitiseHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
        expect(out).not.toContain('data:');
    });

    it('strips vbscript: hrefs', () => {
        const out = sanitiseHtml('<a href="vbscript:msgbox(1)">x</a>');
        expect(out).not.toContain('vbscript:');
        expect(out).not.toContain('href');
    });

    it('preserves same-origin relative hrefs', () => {
        expect(sanitiseHtml('<a href="/relative/path">x</a>'))
            .toContain('href="/relative/path"');
    });

    it('preserves mailto and tel hrefs', () => {
        expect(sanitiseHtml('<a href="mailto:a@b.com">x</a>'))
            .toContain('href="mailto:a@b.com"');
        expect(sanitiseHtml('<a href="tel:+12025550100">x</a>'))
            .toContain('href="tel:+12025550100"');
    });

    it('drops target attributes other than _blank', () => {
        const out = sanitiseHtml('<a href="/x" target="popup_window">y</a>');
        expect(out).not.toContain('target=');
    });

    it('forces rel=noopener noreferrer on target=_blank', () => {
        const out = sanitiseHtml('<a href="/x" target="_blank">y</a>');
        expect(out).toContain('target="_blank"');
        expect(out).toContain('rel="noopener noreferrer"');
    });
});

describe('htmlToText', () => {
    it('joins list values that core separates with line breaks', () => {
        expect(htmlToText('Episode 1<br />\nEpisode 3')).toBe('Episode 1, Episode 3');
    });

    it('drops markup and decodes entities', () => {
        expect(htmlToText('1 x Tom &amp; Jerry <span class="price">\u20ac5.00</span>'))
            .toBe('1 x Tom & Jerry \u20ac5.00');
    });

    it('keeps plain text untouched', () => {
        expect(htmlToText('XS')).toBe('XS');
    });
});

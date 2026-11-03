// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-coupon-form -- translated labels from attributes, the server
// rendered children (the coupon_code reCAPTCHA) moved into the form, and the
// `remove` flag sent only when a coupon is applied.

import { describe, test, expect, afterEach, vi } from 'vitest';
import '../hyperion-coupon-form.js';
import { mount } from './helpers.js';

const CHILDREN = `
    <hyperion-recaptcha class="block" type="v3" site-key="key-coupon" action="coupon_code">
        <input type="hidden" name="g-recaptcha-response" value="" data-hyperion-recaptcha-token>
        <div data-hyperion-recaptcha-widget class="empty:hidden"></div>
        <p class="text-xs" data-hyperion-recaptcha-legal>Protected by reCAPTCHA</p>
    </hyperion-recaptcha>
`;

function shell({ attributes = '', children = null, applied = '' } = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <hyperion-coupon-form id="hyperion-coupon-form" class="block"
                              applied-coupon="${applied}"
                              action-url="/checkout/cart/couponPost/"
                              form-key="fk123"
                              ${attributes}>
            ${children === null ? '' : `<template data-hyperion-coupon-children>${children}</template>`}
            <noscript><form method="post" action="/checkout/cart/couponPost/"></form></noscript>
        </hyperion-coupon-form>
    `;
    return wrapper.firstElementChild;
}

const form = (el) => el.querySelector('form[data-hyperion-coupon-form]');
const slot = (el) => el.querySelector('form [data-coupon-extra-slot]');

describe('hyperion-coupon-form -- labels', () => {
    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-coupon-form')).toBeTypeOf('function');
    });

    test('renders the English copy when no label attribute is given', async () => {
        const el = await mount(shell());
        expect(el.querySelector('summary').textContent.trim()).toBe('Apply Discount Code');
        expect(el.querySelector('section').getAttribute('aria-label')).toBe('Apply Discount Code');
        expect(el.querySelector('input[name="coupon_code"]').getAttribute('placeholder')).toBe('Enter discount code');
        expect(el.querySelector('input[name="coupon_code"]').getAttribute('aria-label')).toBe('Discount code');
        expect(el.querySelector('button[type="submit"]').textContent.trim()).toBe('Apply Discount');
    });

    test('renders the translated copy handed in as attributes', async () => {
        const el = await mount(shell({
            attributes: 'heading-label="Codice sconto" placeholder-label="Inserisci il codice" apply-label="Applica" cancel-label="Annulla" input-label="Codice"',
        }));
        expect(el.querySelector('summary').textContent.trim()).toBe('Codice sconto');
        expect(el.querySelector('section').getAttribute('aria-label')).toBe('Codice sconto');
        expect(el.querySelector('input[name="coupon_code"]').getAttribute('placeholder')).toBe('Inserisci il codice');
        expect(el.querySelector('input[name="coupon_code"]').getAttribute('aria-label')).toBe('Codice');
        expect(el.querySelector('button[type="submit"]').textContent.trim()).toBe('Applica');
    });

    test('uses the cancel label and a readonly input while a coupon is applied', async () => {
        const el = await mount(shell({ applied: 'H20', attributes: 'cancel-label="Annulla"' }));
        expect(el.querySelector('button[type="submit"]').textContent.trim()).toBe('Annulla');
        expect(el.querySelector('input[name="coupon_code"]').hasAttribute('readonly')).toBe(true);
        expect(el.querySelector('details').hasAttribute('open')).toBe(true);
    });
});

describe('hyperion-coupon-form -- remove flag', () => {
    test('an apply request carries no remove parameter (the reCAPTCHA observer skips the check when it is present)', async () => {
        const el = await mount(shell());
        expect(form(el).querySelector('input[name="remove"]')).toBeNull();
        expect(form(el).querySelector('input[name="form_key"]').value).toBe('fk123');
    });

    test('a cancel request carries remove=1', async () => {
        const el = await mount(shell({ applied: 'H20' }));
        expect(form(el).querySelector('input[name="remove"]').value).toBe('1');
    });
});

describe('hyperion-coupon-form -- server rendered children', () => {
    afterEach(() => { delete window.htmx; });

    test('moves the template content into the slot inside the form', async () => {
        const el = await mount(shell({ children: CHILDREN }));
        const recaptcha = form(el).querySelector('hyperion-recaptcha');
        expect(recaptcha).not.toBeNull();
        expect(recaptcha.closest('form')).toBe(form(el));
        expect(form(el).querySelector('input[name="g-recaptcha-response"]')).not.toBeNull();
        expect(slot(el).contains(recaptcha)).toBe(true);
        expect(form(el).querySelector('[data-hyperion-recaptcha-legal]').textContent).toContain('Protected by reCAPTCHA');
    });

    test('drops the inert template and keeps the noscript fallback', async () => {
        const el = await mount(shell({ children: CHILDREN }));
        expect(el.querySelector(':scope > template')).toBeNull();
        expect(el.querySelector(':scope > noscript')).not.toBeNull();
        expect(el.querySelectorAll('hyperion-recaptcha')).toHaveLength(1);
    });

    test('renders an empty slot and no error without a template', async () => {
        const el = await mount(shell());
        expect(slot(el)).not.toBeNull();
        expect(slot(el).childNodes).toHaveLength(0);
    });

    test('an empty template injects nothing', async () => {
        const el = await mount(shell({ children: '   ' }));
        expect(slot(el).children).toHaveLength(0);
        expect(el.querySelector(':scope > template')).toBeNull();
    });

    test('a re-render leaves the injected children in place, once', async () => {
        const el = await mount(shell({ children: CHILDREN }));
        const recaptcha = form(el).querySelector('hyperion-recaptcha');
        el._loading = true;
        await el.updateComplete;
        el._loading = false;
        await el.updateComplete;
        expect(el.querySelectorAll('hyperion-recaptcha')).toHaveLength(1);
        expect(form(el).querySelector('hyperion-recaptcha')).toBe(recaptcha);
        expect(form(el).querySelectorAll('input[name="g-recaptcha-response"]')).toHaveLength(1);
    });

    test('a second connection (DOM move) does not duplicate the children', async () => {
        const el = await mount(shell({ children: CHILDREN }));
        const holder = document.createElement('div');
        document.body.appendChild(holder);
        holder.appendChild(el);
        await el.updateComplete;
        expect(el.querySelectorAll('hyperion-recaptcha')).toHaveLength(1);
        expect(el.querySelectorAll('input[name="g-recaptcha-response"]')).toHaveLength(1);
        expect(form(el).querySelector('hyperion-recaptcha')).not.toBeNull();
    });

    test('a fresh shell (what an HTMX swap inserts) injects its own children again', async () => {
        const first = await mount(shell({ children: CHILDREN }));
        first.replaceWith(shell({ children: CHILDREN, applied: 'H20' }));
        const second = document.querySelector('hyperion-coupon-form');
        await second.updateComplete;
        expect(second).not.toBe(first);
        expect(form(second).querySelector('hyperion-recaptcha')).not.toBeNull();
        expect(form(second).querySelector('input[name="remove"]').value).toBe('1');
        expect(document.querySelectorAll('hyperion-recaptcha')).toHaveLength(1);
    });

    test('asks HTMX to process the rendered form once it exists', async () => {
        window.htmx = { process: vi.fn() };
        const el = await mount(shell({ children: CHILDREN }));
        expect(window.htmx.process).toHaveBeenCalledTimes(1);
        expect(window.htmx.process.mock.calls[0][0]).toBe(form(el));
        expect(form(el).getAttribute('hx-post')).toBe('/checkout/cart/couponPost/');
        expect(form(el).getAttribute('hx-target')).toBe('#hyperion-coupon-form');
    });
});

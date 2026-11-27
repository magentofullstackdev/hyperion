// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-coupon-form -- translated labels from attributes, the server
// rendered skeleton (same boxes as the rendered form, taken over and removed
// at the upgrade), the server rendered children (the coupon_code reCAPTCHA)
// moved into the form, the `remove` flag sent only when a coupon is applied,
// and the state of a refused code.

import { describe, test, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-coupon-form.js';
import { mount } from './helpers.js';

const TEMPLATE_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../../../app/design/frontend/Magentofullstackdev/hyperion/Magento_Checkout/templates/cart/coupon.phtml',
);

const CHILDREN = `
    <hyperion-recaptcha class="block" type="v3" site-key="key-coupon" action="coupon_code">
        <input type="hidden" name="g-recaptcha-response" value="" data-hyperion-recaptcha-token>
        <div data-hyperion-recaptcha-widget class="empty:hidden"></div>
        <p class="text-xs" data-hyperion-recaptcha-legal>Protected by reCAPTCHA</p>
    </hyperion-recaptcha>
`;

/** A shell whose skeleton holds the given children (see skeletonShell). */
function shell({ attributes = '', children = null, applied = '' } = {}) {
    return skeletonShell({ attributes, applied, children: children ?? '' });
}

/** The shell cart/coupon.phtml prints: the skeleton form holds the children. */
function skeletonShell({ attributes = '', children = '', applied = '', code = '', open = false } = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <hyperion-coupon-form id="hyperion-coupon-form" class="block"
                              applied-coupon="${applied}"
                              action-url="/checkout/cart/couponPost/"
                              form-key="fk123"
                              ${attributes}>
            <section class="bg-surface rounded-xl border border-subtle p-4" data-hyperion-coupon-skeleton>
                <details class="group"${open ? ' open' : ''}>
                    <summary>Apply Discount Code</summary>
                    <form method="post" action="/checkout/cart/couponPost/" class="mt-3 flex flex-col gap-2">
                        <input type="hidden" name="form_key" value="fk123">
                        <div class="flex items-stretch gap-2 min-w-0">
                            <input type="text" name="coupon_code" value="${applied || code}"${applied ? ' readonly' : ''}>
                            <button type="submit">Apply Discount</button>
                        </div>
                        <div data-coupon-extra-slot class="empty:hidden">${children}</div>
                    </form>
                </details>
            </section>
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

describe('hyperion-coupon-form -- refused code', () => {
    const FAILED = 'attempted-code="NOTACODE42" error-message="The coupon code &quot;NOTACODE42&quot; is not valid."';
    const code = (el) => form(el).querySelector('input[name="coupon_code"]');

    test('renders open with the code in the field, marked invalid and described by the message', async () => {
        const el = await mount(shell({ attributes: FAILED }));
        expect(el.querySelector('details').hasAttribute('open')).toBe(true);
        expect(code(el).value).toBe('NOTACODE42');
        expect(code(el).hasAttribute('readonly')).toBe(false);
        expect(code(el).getAttribute('aria-invalid')).toBe('true');
        const message = el.querySelector('[data-hyperion-coupon-error]');
        expect(message.textContent).toBe('The coupon code "NOTACODE42" is not valid.');
        expect(code(el).getAttribute('aria-describedby')).toBe(message.id);
        expect(form(el).contains(message)).toBe(true);
        expect(el.querySelector('button[type="submit"]').textContent.trim()).toBe('Apply Discount');
        expect(form(el).querySelector('input[name="remove"]')).toBeNull();
    });

    test('puts the focus on the field without scrolling the page', async () => {
        const focus = vi.spyOn(HTMLElement.prototype, 'focus');
        try {
            const el = await mount(shell({ attributes: FAILED }));
            expect(document.activeElement).toBe(code(el));
            expect(focus).toHaveBeenCalledWith({ preventScroll: true });
        } finally {
            focus.mockRestore();
        }
    });

    test('the first edit of the field ends the error state and keeps what was typed', async () => {
        const el = await mount(shell({ attributes: FAILED }));
        code(el).value = 'NOTACODE4';
        code(el).dispatchEvent(new Event('input', { bubbles: true }));
        await el.updateComplete;
        expect(code(el).hasAttribute('aria-invalid')).toBe(false);
        expect(code(el).hasAttribute('aria-describedby')).toBe(false);
        expect(el.querySelector('[data-hyperion-coupon-error]')).toBeNull();
        expect(code(el).value).toBe('NOTACODE4');
        expect(el.querySelector('details').hasAttribute('open')).toBe(true);
    });

    test('a refused code without a message is still given back to the field', async () => {
        const el = await mount(shell({ attributes: 'attempted-code="ABC"' }));
        expect(code(el).value).toBe('ABC');
        expect(code(el).getAttribute('aria-invalid')).toBe('true');
        expect(code(el).hasAttribute('aria-describedby')).toBe(false);
        expect(el.querySelector('[data-hyperion-coupon-error]')).toBeNull();
    });

    test('an applied coupon wins over a stale attempt', async () => {
        const el = await mount(shell({ applied: 'H20', attributes: FAILED }));
        expect(code(el).value).toBe('H20');
        expect(code(el).hasAttribute('aria-invalid')).toBe(false);
        expect(el.querySelector('[data-hyperion-coupon-error]')).toBeNull();
    });

    test('without an attempt the form is closed, valid and takes no focus', async () => {
        const el = await mount(shell());
        expect(el.querySelector('details').hasAttribute('open')).toBe(false);
        expect(code(el).hasAttribute('aria-invalid')).toBe(false);
        expect(document.activeElement).not.toBe(code(el));
    });

    test('the children keep their place under the message', async () => {
        const el = await mount(shell({ attributes: FAILED, children: CHILDREN }));
        const message = el.querySelector('[data-hyperion-coupon-error]');
        expect(message.nextElementSibling).toBe(slot(el));
        expect(slot(el).querySelector('hyperion-recaptcha')).not.toBeNull();
    });
});

describe('hyperion-coupon-form -- server rendered children', () => {
    afterEach(() => { delete window.htmx; });

    test('moves the skeleton children into the slot inside the form', async () => {
        const el = await mount(shell({ children: CHILDREN }));
        const recaptcha = form(el).querySelector('hyperion-recaptcha');
        expect(recaptcha).not.toBeNull();
        expect(recaptcha.closest('form')).toBe(form(el));
        expect(form(el).querySelector('input[name="g-recaptcha-response"]')).not.toBeNull();
        expect(slot(el).contains(recaptcha)).toBe(true);
        expect(form(el).querySelector('[data-hyperion-recaptcha-legal]').textContent).toContain('Protected by reCAPTCHA');
    });

    test('drops the skeleton and keeps one copy of the children', async () => {
        const el = await mount(shell({ children: CHILDREN }));
        expect(el.querySelector('[data-hyperion-coupon-skeleton]')).toBeNull();
        expect(el.querySelectorAll('hyperion-recaptcha')).toHaveLength(1);
    });

    test('renders an empty slot and no error without children', async () => {
        const el = await mount(shell());
        expect(slot(el)).not.toBeNull();
        expect(slot(el).childNodes).toHaveLength(0);
    });

    test('a skeleton slot holding only white space injects nothing', async () => {
        const el = await mount(shell({ children: '   ' }));
        expect(slot(el).children).toHaveLength(0);
        expect(slot(el).childNodes).toHaveLength(0);
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

describe('hyperion-coupon-form -- server rendered skeleton', () => {
    const code = (el) => form(el).querySelector('input[name="coupon_code"]');

    test('removes the skeleton before the first render and moves its children into the form', async () => {
        const el = await mount(skeletonShell({ children: CHILDREN }));
        expect(el.querySelector('[data-hyperion-coupon-skeleton]')).toBeNull();
        expect(el.querySelectorAll('form')).toHaveLength(1);
        expect(el.querySelectorAll('input[name="coupon_code"]')).toHaveLength(1);
        expect(el.querySelectorAll('hyperion-recaptcha')).toHaveLength(1);
        expect(slot(el).querySelector('hyperion-recaptcha')).not.toBeNull();
    });

    test('an empty children slot injects nothing', async () => {
        const el = await mount(skeletonShell());
        expect(slot(el).childNodes).toHaveLength(0);
    });

    test('keeps the disclosure the shopper opened before the upgrade', async () => {
        const el = skeletonShell();
        el.querySelector('details').open = true;
        await mount(el);
        expect(el.querySelector('details').open).toBe(true);
    });

    test('keeps a code typed before the upgrade', async () => {
        const el = skeletonShell();
        el.querySelector('input[name="coupon_code"]').value = 'SPRING10';
        await mount(el);
        expect(code(el).value).toBe('SPRING10');
        expect(code(el).hasAttribute('aria-invalid')).toBe(false);
    });

    test('gives the focus back to the field when the skeleton field had it', async () => {
        const el = skeletonShell({ open: true });
        const field = el.querySelector('input[name="coupon_code"]');
        const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(field);
        const focus = vi.spyOn(HTMLElement.prototype, 'focus');
        try {
            await mount(el);
            expect(focus).toHaveBeenCalledWith({ preventScroll: true });
            expect(focus.mock.contexts.at(-1)).toBe(code(el));
        } finally {
            active.mockRestore();
            focus.mockRestore();
        }
    });

    test('takes no focus when the skeleton field did not have it', async () => {
        const focus = vi.spyOn(HTMLElement.prototype, 'focus');
        try {
            await mount(skeletonShell({ open: true }));
            expect(focus).not.toHaveBeenCalled();
        } finally {
            focus.mockRestore();
        }
    });

    test('a code edited in the skeleton after a refusal ends the error state', async () => {
        const el = skeletonShell({ code: 'NOTACODE42', open: true, attributes: 'attempted-code="NOTACODE42" error-message="Not valid."' });
        el.querySelector('input[name="coupon_code"]').value = 'NOTACODE4';
        await mount(el);
        expect(code(el).value).toBe('NOTACODE4');
        expect(code(el).hasAttribute('aria-invalid')).toBe(false);
        expect(el.querySelector('[data-hyperion-coupon-error]')).toBeNull();
    });

    test('an untouched refused skeleton keeps the error state', async () => {
        const el = await mount(skeletonShell({ code: 'NOTACODE42', open: true, attributes: 'attempted-code="NOTACODE42" error-message="Not valid."' }));
        expect(code(el).value).toBe('NOTACODE42');
        expect(code(el).getAttribute('aria-invalid')).toBe('true');
        expect(el.querySelector('[data-hyperion-coupon-error]').textContent).toBe('Not valid.');
    });

    test('the skeleton of cart/coupon.phtml carries the classes of every rendered box', async () => {
        const source = readFileSync(TEMPLATE_PATH, 'utf8');
        const start = source.indexOf('data-hyperion-coupon-skeleton');
        const end = source.indexOf('</section>', start);
        expect(start).toBeGreaterThan(0);
        const norm = (value) => (value || '').split(/\s+/).filter(Boolean).sort().join(' ');
        const sectionClass = /class="([^"]*)"/.exec(source.slice(source.lastIndexOf('<section', start), start))?.[1];
        const skeletonClasses = new Set(
            [sectionClass, ...Array.from(source.slice(start, end).matchAll(/class="([^"]*)"/g), (m) => m[1])].map(norm),
        );
        const states = [
            '',
            'applied-coupon="H20"',
            'attempted-code="NOTACODE42" error-message="Not valid."',
        ];
        for (const attributes of states) {
            document.body.innerHTML = '';
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `<hyperion-coupon-form ${attributes}></hyperion-coupon-form>`;
            const el = await mount(wrapper.firstElementChild);
            const boxes = [
                el.querySelector('section'),
                el.querySelector('details'),
                el.querySelector('summary'),
                el.querySelector('summary > span'),
                el.querySelector('summary > svg'),
                form(el),
                code(el).parentElement,
                code(el),
                el.querySelector('button[type="submit"]'),
                el.querySelector('[data-hyperion-coupon-message]'),
                slot(el),
            ].filter(Boolean);
            for (const box of boxes) {
                expect(skeletonClasses.has(norm(box.getAttribute('class'))), `${attributes || 'closed'}: ${box.tagName} ${box.getAttribute('class')}`).toBe(true);
            }
        }
    });

    test('the message line is always rendered, so a message arriving or going moves nothing', async () => {
        const el = await mount(shell({ attributes: 'attempted-code="NOTACODE42" error-message="Not valid."' }));
        const line = () => el.querySelectorAll('[data-hyperion-coupon-message]');
        expect(line()).toHaveLength(1);
        expect(line()[0].hasAttribute('data-hyperion-coupon-error')).toBe(true);
        expect(line()[0].className).toContain('min-h-10');
        expect(line()[0].className).toContain('sm:min-h-5');
        code(el).value = 'NOTACODE4';
        code(el).dispatchEvent(new Event('input', { bubbles: true }));
        await el.updateComplete;
        expect(line()).toHaveLength(1);
        expect(line()[0].textContent).toBe('');
        expect(line()[0].hasAttribute('data-hyperion-coupon-error')).toBe(false);
        expect(line()[0].hasAttribute('id')).toBe(false);
        expect(line()[0].nextElementSibling).toBe(slot(el));
    });

    test('the skeleton prints the message line in every state, the component renders it too', async () => {
        const source = readFileSync(TEMPLATE_PATH, 'utf8');
        const lines = source.match(/<p [^>]*data-hyperion-coupon-message/g) ?? [];
        // One for the refused state, one empty for the others.
        expect(lines).toHaveLength(2);
        for (const attributes of ['', 'applied-coupon="H20"']) {
            document.body.innerHTML = '';
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `<hyperion-coupon-form ${attributes}></hyperion-coupon-form>`;
            const el = await mount(wrapper.firstElementChild);
            expect(el.querySelectorAll('[data-hyperion-coupon-message]')).toHaveLength(1);
        }
    });

    test('the answer to the form\'s own request (expanded) renders it open, a cancel included', async () => {
        const el = await mount(shell({ attributes: 'expanded' }));
        expect(el.querySelector('details').open).toBe(true);
        expect(code(el).hasAttribute('aria-invalid')).toBe(false);
        expect(el.querySelector('button[type="submit"]').textContent.trim()).toBe('Apply Discount');
    });

    test('without expanded, a shell with no coupon and no attempt (a quantity change re-render) stays closed', async () => {
        const el = await mount(shell());
        expect(el.querySelector('details').open).toBe(false);
    });

    test('cart/coupon.phtml prints expanded only for the answer to the coupon post', () => {
        const source = readFileSync(TEMPLATE_PATH, 'utf8');
        expect(source).toMatch(/strtolower\(\$request->getFullActionName\(\)\) === 'checkout_cart_couponpost'/);
        expect(source).toMatch(/<\?php if \(\$isCouponAnswer\): \?>expanded<\?php endif; \?>/);
    });

    test('a running request keeps the width of the button: the label stays, transparent, under the spinner', async () => {
        const el = await mount(shell());
        const button = () => el.querySelector('button[type="submit"]');
        el.dispatchEvent(new CustomEvent('htmx:beforeRequest'));
        await el.updateComplete;
        expect(button().disabled).toBe(true);
        expect(button().textContent.trim()).toBe('Apply Discount');
        expect(button().querySelector('span.opacity-0')).not.toBeNull();
        expect(button().getAttribute('aria-busy')).toBe('true');
        expect(button().querySelector('span.animate-spin.absolute')).not.toBeNull();
        el.dispatchEvent(new CustomEvent('htmx:afterRequest'));
        await el.updateComplete;
        expect(button().disabled).toBe(false);
        expect(button().querySelector('span.opacity-0')).toBeNull();
        expect(button().hasAttribute('aria-busy')).toBe(false);
        expect(button().querySelector('.animate-spin')).toBeNull();
    });

    test('the skeleton buttons print the label in a span, like the rendered button', () => {
        const source = readFileSync(TEMPLATE_PATH, 'utf8');
        const start = source.indexOf('data-hyperion-coupon-skeleton');
        const skeleton = source.slice(start, source.indexOf('</section>', start));
        const buttons = skeleton.match(/<button[\s\S]*?<\/button>/g) ?? [];
        expect(buttons).toHaveLength(2);
        for (const button of buttons) {
            expect(button).toMatch(/class="relative /);
            expect(button).toMatch(/>\s*<span><\?= \$escaper->escapeHtml\(__\('(Cancel Coupon|Apply Discount)'\)\) \?><\/span>\s*<\/button>/);
        }
    });
});

describe('hyperion-coupon-form -- one source of truth for the disclosure', () => {
    const details = (el) => el.querySelector('details');
    // What the browser does on a click of the summary: flips `open`, then fires `toggle`.
    const shopperToggles = async (el, open) => {
        details(el).open = open;
        details(el).dispatchEvent(new Event('toggle'));
        await el.updateComplete;
    };

    test('a form the shopper opened stays open through unrelated re-renders', async () => {
        const el = await mount(shell());
        await shopperToggles(el, true);
        el.dispatchEvent(new CustomEvent('htmx:beforeRequest'));
        await el.updateComplete;
        el.dispatchEvent(new CustomEvent('htmx:afterRequest'));
        await el.updateComplete;
        el.headingLabel = 'Codice sconto';
        el.errorMessage = 'Not valid.';
        await el.updateComplete;
        expect(details(el).open).toBe(true);
    });

    test('expanded removed after the first render does not close a form the shopper opened', async () => {
        const el = await mount(shell({ attributes: 'expanded' }));
        expect(details(el).open).toBe(true);
        await shopperToggles(el, true);
        el.removeAttribute('expanded');
        await el.updateComplete;
        expect(details(el).open).toBe(true);
    });

    test('a refused code that goes away (an applied coupon, then a cancel) does not close the form', async () => {
        const el = await mount(shell({ attributes: 'attempted-code="ABC" error-message="Not valid."' }));
        expect(details(el).open).toBe(true);
        el.removeAttribute('attempted-code');
        el.setAttribute('applied-coupon', 'H20');
        await el.updateComplete;
        el.setAttribute('applied-coupon', '');
        await el.updateComplete;
        expect(details(el).open).toBe(true);
    });

    test('a form the shopper closed stays closed through a re-render', async () => {
        const el = await mount(shell({ applied: 'H20' }));
        expect(details(el).open).toBe(true);
        await shopperToggles(el, false);
        el.dispatchEvent(new CustomEvent('htmx:beforeRequest'));
        await el.updateComplete;
        expect(details(el).open).toBe(false);
    });

    test('a state the server renders open opens a closed form once', async () => {
        const el = await mount(shell());
        expect(details(el).open).toBe(false);
        el.setAttribute('expanded', '');
        await el.updateComplete;
        expect(details(el).open).toBe(true);
    });

    test('the rendered section carries no id: the host is the only #hyperion-coupon-form', async () => {
        const el = await mount(shell());
        expect(document.querySelectorAll('#hyperion-coupon-form')).toHaveLength(1);
        expect(document.querySelector('#hyperion-coupon-form')).toBe(el);
    });
});


// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-paypal-review -- Place Order only with a shipping method, one
// submission, failed shipping updates reload the page.

import { describe, test, expect, vi, afterEach } from 'vitest';
import '../hyperion-paypal-review.js';
import { mount } from './helpers.js';

function fixture({ selected = '', noRates = false } = {}) {
    const el = document.createElement('hyperion-paypal-review');
    el.innerHTML = `
        ${noRates ? '<p data-review-no-rates>No quotes</p>' : `
        <form data-review-shipping-form>
            <select name="shipping_method" data-review-shipping>
                <option value="">Please select</option>
                <option value="flatrate_flatrate" ${selected === 'flatrate_flatrate' ? 'selected' : ''}>Fixed</option>
            </select>
            <p data-review-updating hidden>Updating</p>
        </form>`}
        <div id="hyperion-paypal-review-items"></div>
        <form data-review-form action="/paypal/express/placeOrder">
            <button type="submit" data-review-submit>Place Order</button>
            <p data-review-submitting hidden>Submitting</p>
            <p data-review-hint>Select a method</p>
        </form>
    `;
    return el;
}

const htmxEvent = (name, source, detail = {}) => new CustomEvent(name, {
    bubbles: true,
    cancelable: true,
    detail: { elt: source, ...detail },
});

describe('hyperion-paypal-review', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-paypal-review')).toBeTypeOf('function');
    });

    test('Place Order is disabled until a shipping method is chosen', async () => {
        const el = await mount(fixture());
        expect(el.querySelector('[data-review-submit]').disabled).toBe(true);
        expect(el.querySelector('[data-review-hint]').hidden).toBe(false);

        const ready = await mount(fixture({ selected: 'flatrate_flatrate' }));
        expect(ready.querySelector('[data-review-submit]').disabled).toBe(false);
        expect(ready.querySelector('[data-review-hint]').hidden).toBe(true);
    });

    test('Place Order stays disabled when no rate is available, enabled for virtual carts', async () => {
        const blocked = await mount(fixture({ noRates: true }));
        expect(blocked.querySelector('[data-review-submit]').disabled).toBe(true);

        const virtual = fixture({ noRates: true });
        virtual.querySelector('[data-review-no-rates]').remove();
        await mount(virtual);
        expect(virtual.querySelector('[data-review-submit]').disabled).toBe(false);
    });

    test('is disabled while the totals are refreshed and enabled afterwards', async () => {
        const el = await mount(fixture());
        const form = el.querySelector('[data-review-shipping-form]');
        const select = el.querySelector('[data-review-shipping]');
        select.value = 'flatrate_flatrate';

        form.dispatchEvent(htmxEvent('htmx:beforeRequest', form));
        expect(el.querySelector('[data-review-submit]').disabled).toBe(true);
        expect(el.querySelector('[data-review-updating]').hidden).toBe(false);

        form.dispatchEvent(htmxEvent('htmx:afterRequest', form));
        expect(el.querySelector('[data-review-submit]').disabled).toBe(false);
        expect(el.querySelector('[data-review-updating]').hidden).toBe(true);
    });

    test('a failed shipping update cancels the swap and reloads the page', async () => {
        const reload = vi.fn();
        vi.spyOn(window, 'location', 'get').mockReturnValue({ reload });
        const el = await mount(fixture());
        const form = el.querySelector('[data-review-shipping-form]');
        const target = el.querySelector('#hyperion-paypal-review-items');

        const ok = htmxEvent('htmx:beforeSwap', target, {
            requestConfig: { elt: form },
            xhr: { responseText: '<div id="hyperion-paypal-review-items"></div>' },
            shouldSwap: true,
        });
        target.dispatchEvent(ok);
        expect(ok.detail.shouldSwap).toBe(true);
        expect(reload).not.toHaveBeenCalled();

        const failed = htmxEvent('htmx:beforeSwap', target, {
            requestConfig: { elt: form },
            xhr: { responseText: '<script>window.location.href = https://shop.test/review;</script>' },
            shouldSwap: true,
        });
        target.dispatchEvent(failed);
        expect(failed.detail.shouldSwap).toBe(false);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    test('blocks a submission without a shipping method and a second submission', async () => {
        const el = await mount(fixture());
        const form = el.querySelector('[data-review-form]');
        const blocked = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(blocked);
        expect(blocked.defaultPrevented).toBe(true);

        el.querySelector('[data-review-shipping]').value = 'flatrate_flatrate';
        const first = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(first);
        expect(first.defaultPrevented).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(el.querySelector('[data-review-submit]').disabled).toBe(true);
        expect(el.querySelector('[data-review-submitting]').hidden).toBe(false);

        const second = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(second);
        expect(second.defaultPrevented).toBe(true);
    });
});

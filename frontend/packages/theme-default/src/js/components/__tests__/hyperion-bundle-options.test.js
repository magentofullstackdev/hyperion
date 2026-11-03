// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach } from 'vitest';
import '../hyperion-bundle-options.js';
import { mount } from './helpers.js';

function fixture() {
    const el = document.createElement('hyperion-bundle-options');
    el.setAttribute('data-base-price', '0');
    el.setAttribute('data-currency', 'USD');
    el.setAttribute('data-locale', 'en-US');
    el.innerHTML = `
        <fieldset data-hyperion-bundle-option="1" data-hyperion-bundle-can-change-qty="1">
            <label><input type="radio" name="bundle_option[1]" value="10" data-price="34" data-qty="1" checked><span>Joust Duffle Bag</span></label>
            <label><input type="radio" name="bundle_option[1]" value="11" data-price="59" data-qty="1"><span>Fusion Backpack</span></label>
            <input type="number" name="bundle_option_qty[1]" value="1" data-hyperion-bundle-qty="1">
        </fieldset>
        <fieldset data-hyperion-bundle-option="2" data-hyperion-bundle-can-change-qty="0">
            <label><input type="checkbox" name="bundle_option[2][]" value="20" data-price="7" data-qty="1" checked><span>Water Bottle</span></label>
            <label><input type="checkbox" name="bundle_option[2][]" value="21" data-price="5" data-qty="1"><span>Yoga Strap</span></label>
            <input type="number" name="bundle_option_qty[2]" value="3" data-hyperion-bundle-qty="2">
        </fieldset>
        <ul data-hyperion-bundle-summary-list></ul>
        <strong data-hyperion-bundle-total></strong>`;
    return el;
}
const total = (el) => el.querySelector('[data-hyperion-bundle-total]').textContent;
const lines = (el) => Array.from(el.querySelectorAll('[data-hyperion-bundle-summary-list] li')).map((li) => li.textContent.replace(/\s+/g, ' ').trim());

describe('<hyperion-bundle-options>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('renders the configured total and the summary lines on connect', async () => {
        const el = await mount(fixture());
        expect(total(el)).toBe('$41.00');
        expect(lines(el)).toEqual(['1 x Joust Duffle Bag$34.00', '1 x Water Bottle$7.00']);
    });

    test('server rendered summary lines are rewritten with the same content (no layout change on upgrade)', async () => {
        const el = fixture();
        const list = el.querySelector('[data-hyperion-bundle-summary-list]');
        list.innerHTML = '<li class="flex items-center justify-between gap-3"><span>1 x Joust Duffle Bag</span><span class="text-muted">$34.00</span></li>'
            + '<li class="flex items-center justify-between gap-3"><span>1 x Water Bottle</span><span class="text-muted">$7.00</span></li>';
        const before = Array.from(list.children).map((li) => [li.className, li.textContent]);
        await mount(el);
        expect(Array.from(list.children).map((li) => [li.className, li.textContent])).toEqual(before);
        expect(list.querySelectorAll('li > span.text-muted').length).toBe(2);
    });

    test('a selection is named by data-name, not by its label text that carries the price', async () => {
        const el = fixture();
        el.insertAdjacentHTML('afterbegin', `
            <fieldset data-hyperion-bundle-option="3" data-hyperion-bundle-can-change-qty="0">
                <label><input type="radio" name="bundle_option[3]" value="30" data-price="12" data-qty="2" data-name="Yoga Mat" checked><span>Yoga Mat</span><span class="text-muted">+ $12.00</span></label>
            </fieldset>`);
        await mount(el);
        expect(lines(el)[0]).toBe('2 x Yoga Mat$12.00');
    });

    test('follows selections and quantities, ignoring the qty of a fixed-quantity option', async () => {
        const el = await mount(fixture());
        el.querySelector('input[value="11"]').click();
        el.querySelector('input[value="21"]').click();
        el.querySelector('[data-hyperion-bundle-qty="1"]').value = '2';
        el.querySelector('[data-hyperion-bundle-qty="1"]').dispatchEvent(new Event('input', { bubbles: true }));
        expect(total(el)).toBe('$130.00');
        expect(lines(el)).toEqual(['2 x Fusion Backpack$118.00', '1 x Water Bottle$7.00', '1 x Yoga Strap$5.00']);
    });
});

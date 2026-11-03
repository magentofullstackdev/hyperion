// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-region-select -- swaps the State/Province select and text input
// with the chosen country and keeps only the active control named.

import { describe, test, expect } from 'vitest';
import '../hyperion-region-select.js';
import { mount } from './helpers.js';

const REGIONS = {
    US: { 12: { code: 'CA', name: 'California' }, 1: { code: 'AL', name: 'Alabama' } },
    DE: { 80: { code: 'BAY', name: 'Bayern' } },
};

function fixture(attrs = {}, { scriptMap = false, country = 'US' } = {}) {
    const el = document.createElement('hyperion-region-select');
    if (!scriptMap) el.setAttribute('regions', JSON.stringify(REGIONS));
    el.setAttribute('required-countries', '["US"]');
    el.setAttribute('optional-zip-countries', '["IE"]');
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.innerHTML = `
        ${scriptMap ? `<script type="application/json" data-regions>${JSON.stringify(REGIONS)}</script>` : ''}
        <select name="country_id" data-country-select>
            ${['US', 'DE', 'GB', 'IE'].map((c) => `<option value="${c}" ${c === country ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <div data-region-field>
            <label data-region-label for="region_id">State</label>
            <select name="region_id" id="region_id" data-region-select></select>
            <input type="text" name="region" id="region" data-region-input hidden>
        </div>
        <input type="text" name="postcode" data-postcode-input>
    `;
    // happy-dom 20+ mis-parses a `selected` option that is not the second one
    // (selectedIndex lands on 1), so the initial country is set explicitly.
    el.querySelector('[data-country-select]').value = country;
    const pick = (country) => {
        el.querySelector('[data-country-select]').value = country;
        el.querySelector('[data-country-select]').dispatchEvent(new Event('change', { bubbles: true }));
    };
    return {
        el,
        pick,
        select: () => el.querySelector('[data-region-select]'),
        input: () => el.querySelector('[data-region-input]'),
        field: () => el.querySelector('[data-region-field]'),
        label: () => el.querySelector('[data-region-label]'),
        postcode: () => el.querySelector('[data-postcode-input]'),
    };
}

describe('hyperion-region-select', () => {
    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-region-select')).toBeTypeOf('function');
    });

    test('renders into the light DOM and keeps the server markup', async () => {
        const { el } = fixture();
        await mount(el);
        expect(el.shadowRoot).toBeNull();
        expect(el.querySelector('[data-country-select]')).not.toBeNull();
    });

    test('a country with regions shows a required select sorted by name', async () => {
        const { el, select, input, label } = fixture();
        await mount(el);
        expect(select().hidden).toBe(false);
        expect(select().name).toBe('region_id');
        expect(select().required).toBe(true);
        expect([...select().options].map((o) => o.textContent)).toEqual([
            'Please select a region, state or province.', 'Alabama', 'California',
        ]);
        expect(input().hidden).toBe(true);
        expect(input().name).toBe('');
        expect(label().htmlFor).toBe('region_id');
    });

    test('restores region-id for a country with regions', async () => {
        const { el, select } = fixture({ 'region-id': '12', region: 'Somerset' });
        await mount(el);
        expect(select().value).toBe('12');
        expect(select().querySelector('option[value="12"]').defaultSelected).toBe(true);
    });

    test('restores the free-text region for a country without regions', async () => {
        const { el, input, select } = fixture({ 'region-id': '', region: 'Somerset' }, { country: 'GB' });
        await mount(el);
        expect(input().value).toBe('Somerset');
        expect(input().name).toBe('region');
        expect(select().name).toBe('');
    });

    test('a country without regions shows the text input and drops the select name', async () => {
        const { el, pick, select, input, label } = fixture();
        await mount(el);
        pick('GB');
        expect(input().hidden).toBe(false);
        expect(input().name).toBe('region');
        expect(input().required).toBe(false);
        expect(select().hidden).toBe(true);
        expect(select().name).toBe('');
        expect(select().required).toBe(false);
        expect(label().htmlFor).toBe('region');
    });

    test('an optional region is shown only with optional-allowed', async () => {
        const plain = fixture();
        await mount(plain.el);
        plain.pick('DE');
        expect(plain.field().hidden).toBe(true);
        expect(plain.select().required).toBe(false);

        const allowed = fixture({ 'optional-allowed': '' });
        await mount(allowed.el);
        allowed.pick('DE');
        expect(allowed.field().hidden).toBe(false);
        expect(allowed.select().required).toBe(false);
        expect([...allowed.select().options].map((o) => o.value)).toEqual(['', '80']);
    });

    test('reads the map from a JSON script child and toggles the postcode requirement', async () => {
        const { el, pick, select, postcode } = fixture({}, { scriptMap: true });
        await mount(el);
        expect(select().options.length).toBe(3);
        expect(postcode().required).toBe(true);
        pick('IE');
        expect(postcode().required).toBe(false);
    });

    test('emits hyperion-region-change with the country facts', async () => {
        const { el, pick } = fixture();
        const events = [];
        el.addEventListener('hyperion-region-change', (e) => events.push(e.detail));
        await mount(el);
        pick('GB');
        expect(events).toEqual([
            { countryId: 'US', hasRegions: true, required: true },
            { countryId: 'GB', hasRegions: false, required: false },
        ]);
    });
});

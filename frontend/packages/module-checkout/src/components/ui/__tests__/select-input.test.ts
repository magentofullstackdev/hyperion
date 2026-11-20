// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import '../select-input.js';
import type { SelectInput } from '../select-input.js';

const OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: '', label: '----------', separator: true },
    { value: 'DE', label: 'Germany' },
    { value: 'US', label: 'United States' },
];

async function mount(props: Partial<SelectInput> = {}): Promise<{ el: SelectInput; select: HTMLSelectElement }> {
    const el = document.createElement('hc-select-input');
    Object.assign(el, { label: 'Country', name: 'country_id', options: OPTIONS, ...props });
    document.body.appendChild(el);
    await el.updateComplete;
    return { el, select: el.querySelector('select')! };
}

describe('<hc-select-input>', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('always renders the error line, with an id the control points at when there is an error', async () => {
        const { el, select } = await mount({ value: 'DE' });
        const message = el.querySelector('.hc-field-message')!;
        expect(message.id).toBe(`${select.id}-msg`);
        expect(message.textContent).toBe('');
        expect(select.hasAttribute('aria-describedby')).toBe(false);

        el.error = 'Required';
        await el.updateComplete;
        expect(el.querySelectorAll('.hc-field-message').length).toBe(1);
        expect(message.textContent).toBe('Required');
        expect(select.getAttribute('aria-describedby')).toBe(message.id);
        expect(select.getAttribute('aria-invalid')).toBe('true');
    });

    it('uses the id prefix, and prints autocomplete only when it is set', async () => {
        const bare = await mount();
        expect(bare.select.hasAttribute('autocomplete')).toBe(false);
        const full = await mount({ idPrefix: 'hc-shipping', autocomplete: 'shipping country' });
        expect(full.select.id).toBe('hc-shipping-country_id');
        expect(full.el.querySelector('label')?.getAttribute('for')).toBe('hc-shipping-country_id');
        expect(full.select.getAttribute('autocomplete')).toBe('shipping country');
    });

    it('selects only the first option of a value that is listed twice and disables the divider', async () => {
        const { select } = await mount({ value: 'US' });
        expect(select.selectedIndex).toBe(0);
        expect(select.options[1]?.disabled).toBe(true);
        expect(Array.from(select.options).filter((o) => o.hasAttribute('selected')).length).toBe(1);
    });

    it('follows a value set from outside, and falls back to the placeholder for an unknown one', async () => {
        const { el, select } = await mount({ value: 'US', placeholder: 'Select' });
        el.value = 'DE';
        await el.updateComplete;
        expect(select.value).toBe('DE');
        el.value = 'XX';
        await el.updateComplete;
        expect(select.selectedIndex).toBe(0);
        expect(select.value).toBe('');
    });

    it('emits value-change for a new value only, and value-blur', async () => {
        const { el, select } = await mount({ value: 'US' });
        const changes: string[] = [];
        const blurs: string[] = [];
        el.addEventListener('value-change', (e) => changes.push((e as CustomEvent<{ value: string }>).detail.value));
        el.addEventListener('value-blur', (e) => blurs.push((e as CustomEvent<{ name: string }>).detail.name));

        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(changes).toEqual([]);

        select.value = 'DE';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(changes).toEqual(['DE']);

        select.dispatchEvent(new Event('blur'));
        expect(blurs).toEqual(['country_id']);
    });
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import '../text-input.js';
import type { TextInput } from '../text-input.js';

async function mount(props: Partial<TextInput> = {}): Promise<{ el: TextInput; input: HTMLInputElement; changes: string[]; blurs: string[] }> {
    const el = document.createElement('hc-text-input');
    Object.assign(el, { label: 'City', name: 'city', ...props });
    const changes: string[] = [];
    const blurs: string[] = [];
    el.addEventListener('value-change', (e) => changes.push((e as CustomEvent<{ value: string }>).detail.value));
    el.addEventListener('value-blur', (e) => blurs.push((e as CustomEvent<{ value: string }>).detail.value));
    document.body.appendChild(el);
    await el.updateComplete;
    return { el, input: el.querySelector('input')!, changes, blurs };
}

describe('<hc-text-input>', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('always renders the message line and describes the control only when it has a text', async () => {
        const { el, input } = await mount();
        const message = el.querySelector('.hc-field-message')!;
        expect(message.id).toBe(`${input.id}-msg`);
        expect(message.textContent).toBe('');
        expect(input.hasAttribute('aria-describedby')).toBe(false);
        expect(input.getAttribute('aria-invalid')).toBe('false');

        el.hint = 'Checking';
        await el.updateComplete;
        expect(el.querySelectorAll('.hc-field-message').length).toBe(1);
        expect(message.textContent).toBe('Checking');
        expect(message.getAttribute('data-tone')).toBe('hint');
        expect(input.getAttribute('aria-describedby')).toBe(message.id);
        expect(input.getAttribute('aria-invalid')).toBe('false');

        el.warning = 'Looks unusual';
        await el.updateComplete;
        expect(message.textContent).toBe('Looks unusual');
        expect(message.getAttribute('data-tone')).toBe('warning');
        expect(input.getAttribute('aria-invalid')).toBe('false');

        el.error = 'Required';
        await el.updateComplete;
        expect(message.textContent).toBe('Required');
        expect(message.getAttribute('data-tone')).toBe('error');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(el.querySelectorAll('.hc-field-message').length).toBe(1);
    });

    it('builds the id from the prefix and the name, and a per-element one without a prefix', async () => {
        const prefixed = await mount({ idPrefix: 'hc-billing' });
        expect(prefixed.input.id).toBe('hc-billing-city');
        expect(prefixed.el.querySelector('label')?.getAttribute('for')).toBe('hc-billing-city');

        const first = await mount();
        const second = await mount();
        expect(first.input.id).not.toBe(second.input.id);
        const before = first.input.id;
        first.el.error = 'Required';
        await first.el.updateComplete;
        expect(first.input.id).toBe(before);
    });

    it('omits the optional attributes that are empty and prints the ones that are set', async () => {
        const bare = await mount();
        for (const name of ['placeholder', 'autocomplete', 'inputmode', 'autocapitalize', 'spellcheck', 'enterkeyhint']) {
            expect(bare.input.hasAttribute(name)).toBe(false);
        }
        const full = await mount({
            placeholder: 'Town', autocomplete: 'shipping address-level2', inputmode: 'text',
            capitalize: 'words', noSpellcheck: true, enterHint: 'next',
        });
        expect(full.input.getAttribute('placeholder')).toBe('Town');
        expect(full.input.getAttribute('autocomplete')).toBe('shipping address-level2');
        expect(full.input.getAttribute('inputmode')).toBe('text');
        expect(full.input.getAttribute('autocapitalize')).toBe('words');
        expect(full.input.getAttribute('spellcheck')).toBe('false');
        expect(full.input.getAttribute('enterkeyhint')).toBe('next');
    });

    it('takes a value that arrives with a change event only', async () => {
        const { el, input, changes } = await mount({ value: 'Typed City' });
        input.value = 'Manager City';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        expect(changes).toEqual(['Manager City']);
        expect(el.value).toBe('Manager City');
    });

    it('announces a value once when input and change both carry it', async () => {
        const { input, changes } = await mount();
        input.value = 'Austin';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur'));
        expect(changes).toEqual(['Austin']);
    });

    it('takes a value that was set without any event when the field loses the focus', async () => {
        const { input, changes, blurs } = await mount();
        input.value = 'Filled';
        input.dispatchEvent(new Event('blur'));
        expect(changes).toEqual(['Filled']);
        expect(blurs).toEqual(['Filled']);
    });

    it('announces nothing and writes nothing back while a character is composed', async () => {
        const { el, input, changes } = await mount();
        let writes = 0;
        let live = '';
        Object.defineProperty(input, 'value', {
            configurable: true,
            get: () => live,
            set: (next: string) => { writes += 1; live = next; },
        });
        const typeComposing = (text: string): void => {
            live = text;
            input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
        };

        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        typeComposing('n');
        typeComposing('ni');
        typeComposing('に');
        await el.updateComplete;
        expect(changes).toEqual([]);
        expect(writes).toBe(0);
        expect(el.value).toBe('');

        live = '日本';
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
        input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
        await el.updateComplete;
        expect(changes).toEqual(['日本']);
        expect(el.value).toBe('日本');
    });
});

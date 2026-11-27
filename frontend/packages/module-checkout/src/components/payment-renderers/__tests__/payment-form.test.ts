// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentFormField } from '../../../../extension-api.js';
import '../payment-form.js';
import type { PaymentForm } from '../payment-form.js';
import { createMockContext, mountPaymentElement } from './mock-context.js';

const PO_FIELD: PaymentFormField = {
    name: 'po_number',
    label: 'Purchase Order Number',
    type: 'text',
    required: true,
    pattern: null,
    options: [],
    target: 'po_number',
};

const DOB_FIELD: PaymentFormField = {
    name: 'dob',
    label: 'Date of birth',
    type: 'text',
    required: true,
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    options: [],
    target: 'additional_data',
};

const DATE_FIELD: PaymentFormField = { ...DOB_FIELD, name: 'issued', label: 'Issued on', type: 'date', pattern: null };

const TITLE_FIELD: PaymentFormField = {
    name: 'title',
    label: 'Title',
    type: 'select',
    required: false,
    pattern: null,
    options: [{ value: 'mr', label: 'Mr' }, { value: 'ms', label: 'Ms' }],
    target: 'additional_data',
};

async function settle(el: Element): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
        await Promise.all(
            [el, ...Array.from(el.querySelectorAll('hc-text-input, hc-select-input'))]
                .map((node) => (node as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve())
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function mount(fields: PaymentFormField[]): Promise<{ el: PaymentForm; events: Array<{ type: string; detail: unknown }> }> {
    const mock = createMockContext();
    const { element, events } = mountPaymentElement<PaymentForm>('hc-payment-form', {
        context: mock.context,
        method: { code: 'vendor_invoice', title: 'Invoice' },
        options: { fields },
    });
    await settle(element);
    return { el: element, events };
}

function type(el: Element, name: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('<hc-payment-form>', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the entry fields with the checkout controls and their translated labels', async () => {
        const { el } = await mount([PO_FIELD, DATE_FIELD, TITLE_FIELD]);
        expect(el.querySelector('hc-text-input[name="po_number"]')?.getAttribute('label')).toBe('Purchase Order Number');
        expect(el.querySelector('input[name="issued"]')?.getAttribute('type')).toBe('date');
        expect(el.querySelectorAll('hc-select-input[name="title"] option').length).toBeGreaterThanOrEqual(2);
    });

    it('reports ready, then invalid while a required field is empty, valid once it is filled', async () => {
        const { el, events } = await mount([PO_FIELD]);
        expect(events.map((event) => event.type)).toEqual(['ready', 'invalid']);
        expect(events[1]?.detail).toEqual({ message: 'Enter the purchase order number.' });

        type(el, 'po_number', '   ');
        expect(events).toHaveLength(2);
        type(el, 'po_number', 'HYP-PO-1');
        expect(events[events.length - 1]?.type).toBe('valid');
    });

    it('a value that does not match the pattern is invalid', async () => {
        const { el, events } = await mount([DOB_FIELD]);
        type(el, 'dob', '01/02/1990');
        expect(events[events.length - 1]).toEqual({ type: 'invalid', detail: { message: 'Enter a valid Date of birth.' } });
        type(el, 'dob', '1990-02-01');
        expect(events[events.length - 1]?.type).toBe('valid');
    });

    it('matches a pattern against the whole value, and a pattern the browser cannot compile keeps the field invalid', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { el, events } = await mount([
            { ...PO_FIELD, pattern: 'PO-[0-9]+' },
            { ...DOB_FIELD, required: false, pattern: '(?<=x' },
        ]);
        type(el, 'po_number', 'PO-12');
        expect(events[events.length - 1]?.type).toBe('valid');
        type(el, 'po_number', 'xPO-12x');
        expect(events[events.length - 1]?.type).toBe('invalid');
        type(el, 'po_number', 'PO-12');
        type(el, 'dob', 'anything');
        expect(events[events.length - 1]).toEqual({ type: 'invalid', detail: { message: 'Enter a valid Date of birth.' } });
        errors.mockRestore();
    });

    it('shows why a field is required after a blur, and not before', async () => {
        const { el } = await mount([PO_FIELD]);
        const input = el.querySelector<HTMLInputElement>('input[name="po_number"]')!;
        expect(input.getAttribute('aria-invalid')).toBe('false');

        input.dispatchEvent(new Event('blur'));
        await settle(el);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(el.textContent).toContain('Enter the purchase order number.');

        type(el, 'po_number', 'HYP-PO-3');
        await settle(el);
        expect(input.getAttribute('aria-invalid')).toBe('false');
    });

    it('validate() shows every error, moves the focus to the first invalid field and answers false', async () => {
        const { el } = await mount([PO_FIELD, DOB_FIELD]);
        expect(await el.validate()).toBe(false);
        await settle(el);
        const po = el.querySelector<HTMLInputElement>('input[name="po_number"]')!;
        expect(po.getAttribute('aria-invalid')).toBe('true');
        expect(el.querySelector('input[name="dob"]')?.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(po);
    });

    it('hands over trimmed values: the purchase order number at the top level, the rest in additional_data', async () => {
        const { el } = await mount([PO_FIELD, DOB_FIELD, TITLE_FIELD]);
        type(el, 'po_number', '  HYP-PO-2  ');
        type(el, 'dob', ' 1990-02-01 ');
        expect(el.getPaymentData()).toEqual({ po_number: 'HYP-PO-2', additional_data: { dob: '1990-02-01' } });
        expect(await el.validate()).toBe(true);
    });

    it('refuses to hand over data while a field is not valid', async () => {
        const { el } = await mount([PO_FIELD]);
        expect(() => el.getPaymentData()).toThrow('Enter the purchase order number.');
    });

    it('keeps what was typed when it is taken off the page and put back', async () => {
        const { el } = await mount([PO_FIELD]);
        type(el, 'po_number', 'HYP-PO-9');
        el.remove();
        document.body.appendChild(el);
        await settle(el);
        expect(el.querySelector<HTMLInputElement>('input[name="po_number"]')?.value).toBe('HYP-PO-9');
        expect(el.getPaymentData()).toEqual({ po_number: 'HYP-PO-9' });
    });
});

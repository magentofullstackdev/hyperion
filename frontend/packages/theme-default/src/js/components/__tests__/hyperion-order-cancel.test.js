// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-order-cancel tests.
//
// The component is a trigger + native <dialog> around an HTMX form. The
// tests cover the contract the PHP side relies on (hidden fields, reason
// options, hx attributes), the open / close behaviour and the theming rules.

import { describe, test, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-order-cancel.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-order-cancel.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

const REASONS = ['The item(s) are no longer needed', 'Found a better price elsewhere', 'Other'];

async function createElement(attributes = {}) {
    const el = document.createElement('hyperion-order-cancel');
    const defaults = {
        action: 'https://shop.test/hyperion/order/cancel/',
        'order-id': '3',
        'order-number': '000000003',
        'form-key': 'abc123',
        context: 'view',
        reasons: JSON.stringify(REASONS),
        'trigger-label': 'Cancel Order',
        'title-label': 'Cancel order #000000003',
        'keep-label': 'Keep Order',
        'confirm-label': 'Cancel Order',
    };
    for (const [name, value] of Object.entries({ ...defaults, ...attributes })) {
        el.setAttribute(name, value);
    }
    await mount(el);
    return el;
}

describe('hyperion-order-cancel -- rendering contract', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('renders without any network request', async () => {
        const fetchSpy = spyFetch();
        await createElement();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('form posts to the action with form key, order id, context and every reason', async () => {
        const el = await createElement();
        const form = el.querySelector('form');
        expect(form.getAttribute('action')).toBe('https://shop.test/hyperion/order/cancel/');
        expect(form.getAttribute('hx-post')).toBe('https://shop.test/hyperion/order/cancel/');
        expect(form.getAttribute('hx-swap')).toBe('none');
        expect(form.querySelector('input[name="form_key"]').value).toBe('abc123');
        expect(form.querySelector('input[name="order_id"]').value).toBe('3');
        expect(form.querySelector('input[name="context"]').value).toBe('view');
        const options = [...form.querySelectorAll('select[name="reason"] option')].map((o) => o.value);
        expect(options).toEqual(REASONS);
    });

    test('list context is forwarded as the hidden context field', async () => {
        const el = await createElement({ context: 'list', variant: 'icon' });
        expect(el.querySelector('input[name="context"]').value).toBe('list');
        const trigger = el.querySelector('[data-hyperion-order-cancel-trigger]');
        expect(trigger.getAttribute('aria-label')).toBe('Cancel Order');
        expect(trigger.textContent.trim()).toBe('');
    });

    test('button variant shows the trigger label as text', async () => {
        const el = await createElement({ variant: 'button' });
        expect(el.querySelector('[data-hyperion-order-cancel-trigger]').textContent).toContain('Cancel Order');
    });
});

describe('hyperion-order-cancel -- dialog lifecycle', () => {
    test('trigger opens the dialog, keep closes it', async () => {
        const el = await createElement();
        expect(el.isOpen).toBe(false);
        el.open();
        expect(el.isOpen).toBe(true);
        expect(el.querySelector('h3').textContent.trim()).toBe('Cancel order #000000003');
        el.querySelector('[data-hyperion-order-cancel-keep]').click();
        expect(el.isOpen).toBe(false);
    });

    test('an HTMX request disables the confirm button and its completion closes the dialog', async () => {
        const el = await createElement();
        el.open();
        el.querySelector('form').dispatchEvent(new Event('htmx:beforeRequest', { bubbles: true }));
        await el.updateComplete;
        expect(el.querySelector('[data-hyperion-order-cancel-confirm]').disabled).toBe(true);
        el.querySelector('form').dispatchEvent(new Event('htmx:afterRequest', { bubbles: true }));
        await el.updateComplete;
        expect(el.querySelector('[data-hyperion-order-cancel-confirm]').disabled).toBe(false);
        expect(el.isOpen).toBe(false);
    });

    test('hands the rendered form to HTMX when it is present', async () => {
        const process = vi.fn();
        window.htmx = { process };
        try {
            const el = await createElement();
            expect(process).toHaveBeenCalledWith(el);
        } finally {
            delete window.htmx;
        }
    });
});

describe('hyperion-order-cancel -- theming protocol', () => {
    test('uses semantic colour tokens only', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });

    test('renders in light DOM', async () => {
        const el = await createElement();
        expect(el.shadowRoot).toBeNull();
        expect(el.querySelector('dialog')).not.toBeNull();
    });
});

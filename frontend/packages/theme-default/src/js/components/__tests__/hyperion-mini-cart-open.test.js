// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import '../hyperion-mini-cart.js';
import '../hyperion-notification.js';
import { mount } from './helpers.js';
import { resetScrollLock } from '../../lib/scroll-lock.js';

describe('<hyperion-mini-cart> opening', () => {
    beforeEach(() => {
        resetScrollLock();
        document.body.innerHTML = '';
        document.body.style.overflow = '';
    });

    test('dismisses a visible toast, locks the body scroll and is 32rem wide', async () => {
        const toast = document.createElement('hyperion-notification');
        toast.setAttribute('auto-close', '0');
        toast.textContent = 'Added to cart';
        document.body.appendChild(toast);
        const el = document.createElement('hyperion-mini-cart');
        el.innerHTML = '<a slot="trigger" href="/checkout/cart/">Cart</a>';
        await mount(el);
        expect(toast.hasAttribute('hidden')).toBe(false);
        await el.openPanel();
        await el.updateComplete;
        expect(toast.hasAttribute('hidden')).toBe(true);
        expect(document.body.style.overflow).toBe('hidden');
        expect(el.hasAttribute('open')).toBe(true);
        el.close();
        await el.updateComplete;
        expect(document.body.style.overflow).toBe('');
        const source = readFileSync(path.join(process.cwd(), 'src/js/components/hyperion-mini-cart.js'), 'utf8');
        expect(source).toMatch(/--panel-width:\s*32rem/);
        expect(source).not.toMatch(/--panel-width:\s*24rem/);
    });
});

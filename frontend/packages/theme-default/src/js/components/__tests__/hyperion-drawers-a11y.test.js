// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Keyboard model of the modal drawers: closed panels are inert, open
// panels keep Tab inside, Escape closes and the opener gets the focus back.
import { describe, test, expect, beforeEach } from 'vitest';
import '../hyperion-dropdown.js';
import '../hyperion-mini-cart.js';
import '../hyperion-carousel.js';
import { mount } from './helpers.js';
import { deepActiveElement } from '../../lib/focus-trap.js';

const key = (name, init = {}) => new KeyboardEvent('keydown', { key: name, bubbles: true, composed: true, cancelable: true, ...init });
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

function drawer() {
    const el = document.createElement('hyperion-dropdown');
    el.setAttribute('placement', 'drawer');
    el.setAttribute('menu-label', 'Mobile navigation');
    el.innerHTML = '<button slot="trigger" id="opener" type="button">Menu</button><nav><a id="l1" href="/a">A</a><a id="l2" href="/b">B</a></nav>';
    return el;
}

describe('<hyperion-dropdown placement="drawer"> keyboard model', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('closed: the panel is inert and hidden from assistive technology', async () => {
        const el = await mount(drawer());
        const panel = el.shadowRoot.querySelector('[part="panel"]');
        expect(panel.hasAttribute('inert')).toBe(true);
        expect(panel.getAttribute('aria-hidden')).toBe('true');
        expect(el.querySelector('#opener').getAttribute('aria-expanded')).toBe('false');
    });

    test('open: inert lifted, focus moves inside, Tab wraps, Escape closes and refocuses the opener', async () => {
        const el = await mount(drawer());
        const opener = el.querySelector('#opener');
        opener.focus();
        // happy-dom does not route a light-DOM click through the slot's
        // listener; the internal trigger shares the same toggle handler.
        el.shadowRoot.querySelector('[part="trigger"]').click();
        await el.updateComplete;
        await nextFrame();
        const panel = el.shadowRoot.querySelector('[part="panel"]');
        expect(panel.hasAttribute('inert')).toBe(false);
        expect(panel.getAttribute('aria-hidden')).toBe('false');
        expect(opener.getAttribute('aria-expanded')).toBe('true');
        expect(deepActiveElement().id).toBe('l1');
        el.querySelector('#l2').focus();
        const tab = key('Tab');
        panel.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(true);
        expect(deepActiveElement().id).toBe('l1');
        panel.dispatchEvent(key('Escape'));
        await el.updateComplete;
        expect(panel.hasAttribute('inert')).toBe(true);
        expect(deepActiveElement()).toBe(opener);
    });
});

describe('<hyperion-mini-cart> keyboard model', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('closed panel is inert; open panel traps Tab and Escape returns to the trigger', async () => {
        const el = document.createElement('hyperion-mini-cart');
        el.setAttribute('trigger-label', 'Shopping cart');
        el.setAttribute('close-label', 'Close shopping cart');
        el.innerHTML = '<a slot="trigger" href="/checkout/cart/">Cart</a><h2 slot="title">Cart</h2>';
        await mount(el);
        const panel = el.shadowRoot.querySelector('[part="panel"]');
        expect(panel.hasAttribute('inert')).toBe(true);
        await el.openPanel();
        await el.updateComplete;
        await nextFrame();
        expect(panel.hasAttribute('inert')).toBe(false);
        const closeButton = panel.querySelector('header button');
        expect(deepActiveElement()).toBe(closeButton);
        const back = key('Tab', { shiftKey: true });
        el.dispatchEvent(back);
        expect(back.defaultPrevented).toBe(true);
        el.dispatchEvent(key('Escape'));
        await el.updateComplete;
        expect(panel.hasAttribute('inert')).toBe(true);
        expect(deepActiveElement()).toBe(el.shadowRoot.querySelector('[part="trigger"]'));
    });
});

describe('<hyperion-carousel> arrow names', () => {
    test('arrows are named even when the template passes no label', async () => {
        const el = document.createElement('hyperion-carousel');
        el.innerHTML = '<div>1</div><div>2</div><div>3</div><div>4</div><div>5</div><div>6</div>';
        await mount(el);
        await el.updateComplete;
        const prev = el.shadowRoot.querySelector('[part="prev-button"]');
        const next = el.shadowRoot.querySelector('[part="next-button"]');
        if (prev && next) {
            expect(prev.getAttribute('aria-label')).toBe('Previous slide');
            expect(next.getAttribute('aria-label')).toBe('Next slide');
        } else {
            expect(el.prevLabel).toBe('Previous slide');
            expect(el.nextLabel).toBe('Next slide');
        }
    });
});

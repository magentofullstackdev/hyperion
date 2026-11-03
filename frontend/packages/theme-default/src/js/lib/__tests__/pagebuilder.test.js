// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// PageBuilder storefront behaviour: tabs, hover overlay color, maps.

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { initPageBuilder } from '../pagebuilder.js';

const TABS = `
    <div data-content-type="tabs" data-active-tab="1" class="tab-align-left">
        <ul role="tablist" class="tabs-navigation" data-element="navigation">
            <li role="tab" class="tab-header" data-element="headers"><a href="#T1" class="tab-title"><span>One</span></a></li>
            <li role="tab" class="tab-header" data-element="headers"><a href="#T2" class="tab-title"><span>Two</span></a></li>
            <li role="tab" class="tab-header" data-element="headers"><a href="#T3" class="tab-title"><span>Three</span></a></li>
        </ul>
        <div class="tabs-content" data-element="content">
            <div data-content-type="tab-item" id="T1">one</div>
            <div data-content-type="tab-item" id="T2">two</div>
            <div data-content-type="tab-item" id="T3">three</div>
        </div>
    </div>`;

function observerStub() {
    const instances = [];
    globalThis.IntersectionObserver = class {
        constructor(callback) {
            this.callback = callback;
            instances.push(this);
        }
        observe() {}
        disconnect() {}
    };
    return instances;
}

describe('pagebuilder tabs', () => {
    beforeEach(() => {
        document.body.innerHTML = TABS;
        window.location.hash = '';
        initPageBuilder();
    });

    const headers = () => [...document.querySelectorAll('.tab-header')];
    const hiddenPanels = () => [...document.querySelectorAll('[data-content-type="tab-item"]')].map((p) => p.hidden);

    test('opens the tab configured in data-active-tab', () => {
        expect(hiddenPanels()).toEqual([true, false, true]);
        expect(headers().map((h) => h.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    });

    test('wires the ARIA relationships', () => {
        const panel = document.getElementById('T2');
        expect(headers()[1].getAttribute('aria-controls')).toBe('T2');
        expect(panel.getAttribute('role')).toBe('tabpanel');
        expect(panel.getAttribute('aria-labelledby')).toBe(headers()[1].id);
    });

    test('click and arrow keys switch tabs', () => {
        headers()[2].click();
        expect(hiddenPanels()).toEqual([true, true, false]);
        headers()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(hiddenPanels()).toEqual([false, true, true]);
        expect(headers()[0].getAttribute('tabindex')).toBe('0');
    });

    test('running again does not double-bind', () => {
        initPageBuilder();
        headers()[0].click();
        expect(hiddenPanels()).toEqual([false, true, true]);
    });
});

describe('pagebuilder hover overlay', () => {
    test('exposes data-overlay-color as a custom property', () => {
        document.body.innerHTML = '<div class="pagebuilder-overlay" data-overlay-color="rgba(0, 0, 0, 0.5)"></div>'
            + '<div class="pagebuilder-overlay" data-overlay-color=""></div>';
        initPageBuilder();
        const [colored, empty] = document.querySelectorAll('.pagebuilder-overlay');
        expect(colored.style.getPropertyValue('--pb-overlay')).toBe('rgba(0, 0, 0, 0.5)');
        expect(empty.style.getPropertyValue('--pb-overlay')).toBe('');
    });
});

describe('pagebuilder map', () => {
    const LOCATIONS = JSON.stringify([{ location_name: 'HQ', position: { latitude: '45.07', longitude: '7.68' } }]);

    test('a map without locations is hidden', () => {
        observerStub();
        document.body.innerHTML = '<div data-content-type="map" data-locations="[]"></div>';
        initPageBuilder();
        expect(document.querySelector('[data-content-type="map"]').style.display).toBe('none');
    });

    test('without an API key the visible map falls back to a keyless embed, and only once visible', () => {
        const observers = observerStub();
        document.body.innerHTML = '<div data-content-type="map"></div>';
        const map = document.querySelector('[data-content-type="map"]');
        map.dataset.locations = LOCATIONS;
        const append = vi.spyOn(document.head, 'append');
        initPageBuilder();
        expect(map.querySelector('iframe')).toBeNull();
        observers[0].callback([{ isIntersecting: true }]);
        expect(map.querySelector('iframe').src).toContain('q=45.07,7.68');
        expect(append).not.toHaveBeenCalled();
    });
});

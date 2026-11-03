// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
    COMPARED_KEY, HISTORY_EVENT, MAX_ITEMS, VIEWED_KEY,
    getHistory, record, recordCompared, recordComparedFromElement, recordCurrentProductView, recordViewed,
} from '../product-history.js';

const meta = (id, extra = {}) => ({ id, sku: 'SKU-' + id, name: 'Product ' + id, url: '/p' + id + '.html', image: '/i' + id + '.jpg', price: 10, price_formatted: '$10.00', currency: 'USD', scope: 'default-USD', saleable: true, buy_from_list: true, ...extra });

describe('product-history', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });

    test('records newest first, deduplicated by id, capped at MAX_ITEMS', () => {
        for (let i = 1; i <= MAX_ITEMS + 3; i++) recordViewed(meta(i));
        recordViewed(meta(5));
        const items = getHistory(VIEWED_KEY, 'default-USD');
        expect(items).toHaveLength(MAX_ITEMS);
        expect(items[0].id).toBe(5);
        expect(items.filter((i) => i.id === 5)).toHaveLength(1);
        expect(items[1].id).toBe(MAX_ITEMS + 3);
    });

    test('keeps scopes apart and excludes a product on read', () => {
        recordViewed(meta(1));
        recordViewed(meta(2, { scope: 'default-EUR' }));
        expect(getHistory(VIEWED_KEY, 'default-USD').map((i) => i.id)).toEqual([1]);
        expect(getHistory(VIEWED_KEY, 'default-EUR').map((i) => i.id)).toEqual([2]);
        expect(getHistory(VIEWED_KEY, 'default-USD', { exclude: 1 })).toEqual([]);
        recordViewed(meta(3));
        expect(getHistory(VIEWED_KEY, 'default-USD', { limit: 1 }).map((i) => i.id)).toEqual([3]);
    });

    test('ignores records without an id and malformed storage', () => {
        expect(record(VIEWED_KEY, { name: 'x' })).toBe(false);
        localStorage.setItem(COMPARED_KEY, 'not json');
        expect(getHistory(COMPARED_KEY, 'default-USD')).toEqual([]);
        expect(recordCompared(meta(9))).toBe(true);
        expect(getHistory(COMPARED_KEY, 'default-USD').map((i) => i.id)).toEqual([9]);
    });

    test('records the product page view from the DOM and announces it', () => {
        const listener = vi.fn();
        document.addEventListener(HISTORY_EVENT, listener);
        document.body.innerHTML = `<section data-hyperion-product-view data-hyperion-product-meta='${JSON.stringify(meta(42))}'></section>`;
        expect(recordCurrentProductView()).toBe(true);
        expect(getHistory(VIEWED_KEY, 'default-USD')[0].id).toBe(42);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0].detail).toEqual({ key: VIEWED_KEY, scope: 'default-USD' });
        document.removeEventListener(HISTORY_EVENT, listener);
        document.body.innerHTML = '<div></div>';
        expect(recordCurrentProductView()).toBe(false);
    });

    test('records a compare from the enclosing tile record', () => {
        document.body.innerHTML = `<article data-hyperion-product-meta='${JSON.stringify(meta(7))}'><button id="b"></button></article>`;
        expect(recordComparedFromElement(document.getElementById('b'))).toBe(true);
        expect(getHistory(COMPARED_KEY, 'default-USD')[0].name).toBe('Product 7');
    });
});

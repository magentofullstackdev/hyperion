// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Recently viewed / recently compared product history in localStorage.
//
// Core keeps this history in `recently_viewed_product` /
// `recently_compared_product` through its RequireJS storage service and
// renders the widgets with Knockout. Hyperion records the same thing from
// the `data-hyperion-product-meta` JSON record product pages and tiles
// carry (HyperionCore\ViewModel\Catalog\ProductSummary: id, sku, name, url,
// image, price, price_formatted, currency, scope, saleable, buy_from_list):
// the product page records a view on load, the compare toggle records a
// compare on success. Entries are kept per `scope` (store code + display
// currency), newest first, capped at MAX_ITEMS, and
// `<hyperion-recently-viewed>` renders them. A `hyperion:product-history`
// event on `document` announces every write.

export const VIEWED_KEY = 'hyperion_recently_viewed';
export const COMPARED_KEY = 'hyperion_recently_compared';
export const MAX_ITEMS = 20;
export const META_ATTRIBUTE = 'data-hyperion-product-meta';
export const VIEW_SELECTOR = '[data-hyperion-product-view][' + META_ATTRIBUTE + ']';
export const HISTORY_EVENT = 'hyperion:product-history';

function storage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readAll(key) {
    const store = storage();
    if (!store) return {};
    try {
        const parsed = JSON.parse(store.getItem(key) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(key, data) {
    const store = storage();
    if (!store) return false;
    try {
        store.setItem(key, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

export function parseMeta(element) {
    const raw = element?.getAttribute?.(META_ATTRIBUTE);
    if (!raw) return null;
    try {
        const meta = JSON.parse(raw);
        return meta && typeof meta === 'object' && Number(meta.id) > 0 ? meta : null;
    } catch {
        return null;
    }
}

/**
 * The stored entries of one scope, newest first.
 * @param {string} key VIEWED_KEY or COMPARED_KEY
 * @param {string} scope
 * @param {{ limit?: number, exclude?: number }} [options]
 */
export function getHistory(key, scope, options = {}) {
    const list = readAll(key)[scope];
    if (!Array.isArray(list)) return [];
    const exclude = Number(options.exclude) || 0;
    const items = list.filter((item) => item && Number(item.id) > 0 && Number(item.id) !== exclude);
    const limit = Number(options.limit) || 0;
    return limit > 0 ? items.slice(0, limit) : items;
}

/**
 * Put a product record at the top of a history (deduplicated by id).
 * @returns {boolean} whether the write happened
 */
export function record(key, meta) {
    if (!meta || !(Number(meta.id) > 0)) return false;
    const scope = String(meta.scope || 'default');
    const all = readAll(key);
    const current = Array.isArray(all[scope]) ? all[scope] : [];
    const next = [{ ...meta, at: Date.now() }]
        .concat(current.filter((item) => item && Number(item.id) !== Number(meta.id)))
        .slice(0, MAX_ITEMS);
    all[scope] = next;
    if (!writeAll(key, all)) return false;
    document.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: { key, scope } }));
    return true;
}

export const recordViewed = (meta) => record(VIEWED_KEY, meta);
export const recordCompared = (meta) => record(COMPARED_KEY, meta);

/** The product of the current product page, when the page is one. */
export function currentProductMeta(root = document) {
    return parseMeta(root.querySelector?.(VIEW_SELECTOR));
}

/** Record the product page view; called by entry.js on load. */
export function recordCurrentProductView(root = document) {
    const meta = currentProductMeta(root);
    return meta ? recordViewed(meta) : false;
}

/** Record a compare of the product whose record encloses `element`. */
export function recordComparedFromElement(element) {
    const meta = parseMeta(element?.closest?.('[' + META_ATTRIBUTE + ']'));
    return meta ? recordCompared(meta) : false;
}

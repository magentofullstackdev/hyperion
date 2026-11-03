// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Wishlist / compare membership state, read from the header counters.
 *
 * Product pages and listings are edge-cached, so they cannot render
 * "already in your wishlist" server-side. The private header fragments
 * (delivered by `/hyperion/header/state`) can: they
 * carry `data-hyperion-wishlist-items` (a `{productId: wishlistItemId}`
 * map) and `data-hyperion-compare-ids` (a comma list), plus the item
 * records the sidebars render (`data-hyperion-wishlist-summary`,
 * `data-hyperion-compare-items`). Every add / remove
 * response re-ships the same anchors out-of-band, so those two attributes
 * are always current and are the single source of truth for the
 * `<hyperion-list-toggle>` buttons.
 *
 * This module watches HTMX swaps that touch the anchors and notifies
 * subscribers with the parsed state.
 */

const WISHLIST_SELECTOR = '#hyperion-wishlist-count';
const COMPARE_SELECTOR = '#hyperion-compare-count';

/**
 * @type {{ wishlist: Map<number, number>, compare: Set<number>, wishlistItems: object[], compareItems: object[] }}
 * `wishlistItems` are the newest wishlist entries as product records
 * (`data-hyperion-wishlist-summary`, with `item` = wishlist item id and
 * `qty`), `compareItems` the compared products as `{id, name, url}`
 * (`data-hyperion-compare-items`); both feed the sidebars.
 */
const state = { wishlist: new Map(), compare: new Set(), wishlistItems: [], compareItems: [] };
const subscribers = new Set();
let wired = false;

function parseWishlist(anchor) {
    const map = new Map();
    const raw = anchor?.getAttribute('data-hyperion-wishlist-items');
    if (!raw) return map;
    try {
        const parsed = JSON.parse(raw);
        for (const [productId, itemId] of Object.entries(parsed || {})) {
            const pid = Number(productId);
            const iid = Number(itemId);
            if (Number.isFinite(pid) && pid > 0) map.set(pid, Number.isFinite(iid) ? iid : 0);
        }
    } catch (_e) {
        // Malformed attribute: treat as empty rather than throwing during a swap.
    }
    return map;
}

function parseCompare(anchor) {
    const set = new Set();
    const raw = anchor?.getAttribute('data-hyperion-compare-ids');
    if (!raw) return set;
    for (const piece of raw.split(',')) {
        const id = Number(piece.trim());
        if (Number.isFinite(id) && id > 0) set.add(id);
    }
    return set;
}

function parseItems(anchor, attribute) {
    const raw = anchor?.getAttribute(attribute);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item) => item && Number(item.id) > 0) : [];
    } catch (_e) {
        return [];
    }
}

function readFromDom() {
    const wishlistAnchor = document.querySelector(WISHLIST_SELECTOR);
    const compareAnchor = document.querySelector(COMPARE_SELECTOR);
    state.wishlist = parseWishlist(wishlistAnchor);
    state.compare = parseCompare(compareAnchor);
    state.wishlistItems = parseItems(wishlistAnchor, 'data-hyperion-wishlist-summary');
    state.compareItems = parseItems(compareAnchor, 'data-hyperion-compare-items');
}

function notify() {
    for (const fn of subscribers) {
        try {
            fn(state);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[hyperion] list-state subscriber failed', err);
        }
    }
}

function touchesAnchor(target) {
    if (!target || typeof target.matches !== 'function') return false;
    return (
        target.matches(WISHLIST_SELECTOR) ||
        target.matches(COMPARE_SELECTOR) ||
        (typeof target.querySelector === 'function' &&
            (target.querySelector(WISHLIST_SELECTOR) || target.querySelector(COMPARE_SELECTOR)))
    );
}

function onSwap(event) {
    // `htmx:afterSwap` fires on the swap target; `htmx:oobAfterSwap` on the
    // element that received the out-of-band content. Either may be the
    // anchor itself or an ancestor of it.
    if (!touchesAnchor(event.target) && !touchesAnchor(event.detail?.target)) return;
    readFromDom();
    notify();
}

function wire() {
    if (wired) return;
    wired = true;
    document.body.addEventListener('htmx:afterSwap', onSwap);
    document.body.addEventListener('htmx:oobAfterSwap', onSwap);
    readFromDom();
}

/**
 * Register a listener; it is called immediately with the current state
 * and again after every change. Returns an unsubscribe function.
 */
export function subscribe(fn) {
    if (document.body) {
        wire();
    } else {
        document.addEventListener('DOMContentLoaded', wire, { once: true });
    }
    subscribers.add(fn);
    fn(state);
    return () => subscribers.delete(fn);
}

export function getListState() {
    return state;
}

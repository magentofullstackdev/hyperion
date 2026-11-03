// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The layered navigation across a grid fragment swap.
//
// A filter, sort or page change requests the grid fragment, whose response
// carries the layered navigation (`#hyperion-layered-nav`: filter lists with
// links for the new state, active filter chips, Clear all) out of band, so a
// second filter adds to the first. The swap replaces the whole block: this
// carries three things over it, delegated on the document (the listing may be
// swapped later):
//
//   * the open filter cards: each `<details data-hyperion-filter>` of the new
//     block takes the open state of the card with the same request variable
//     on the page (cards new to the page stay closed), so the shopper's
//     expanded group does not snap back to the server default. The accordion
//     is exclusive and an applied filter leaves the list, so often NO open
//     card of the page survives: then the card of the filter just applied or
//     removed opens, else the server defaults stay (the first card open);
//   * the keyboard focus: when it was inside the block (a filter option or a
//     chip was activated by keyboard) it moves to the chip of that filter,
//     else to that filter's card, else to the first chip or card;
//   * the robots directive: the fragment response answers with an
//     `HX-Trigger` header (`hyperion:listing-robots`, the value the full
//     page of the pushed URL renders: `NOINDEX,NOFOLLOW` from two filters on,
//     the store default otherwise), and `<meta name="robots">` of the page,
//     outside every swap target, follows it.

const NAV = '#hyperion-layered-nav';
const CARD = 'details[data-hyperion-filter]';
const CHIPS = '#hyperion-active-filters';
const ROBOTS_EVENT = 'hyperion:listing-robots';
const ROBOTS_VALUE = /^[A-Z]+(,\s*[A-Z]+)*$/i;

const escapeKey = (key) => (globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&'));

export function installListingFilters(root = document) {
    let focusKey = null;
    let restoreFocus = false;

    const onBeforeSwap = (event) => {
        const { target, fragment } = event.detail ?? {};
        if (!(target instanceof Element) || !target.matches(NAV) || !fragment?.querySelectorAll) return;

        const active = root.activeElement;
        const activeKey = active && target.contains(active)
            ? (active.closest('[data-hyperion-filter]')?.dataset.hyperionFilter ?? null)
            : null;
        restoreFocus = !!(active && target.contains(active));
        focusKey = restoreFocus ? activeKey : null;

        const open = new Map();
        for (const card of target.querySelectorAll(CARD)) open.set(card.dataset.hyperionFilter, card.open);
        const cards = Array.from(fragment.querySelectorAll(CARD));
        if (!open.size || !cards.length) return;

        const defaults = cards.map((card) => card.open);
        let survived = false;
        for (const card of cards) {
            card.open = open.get(card.dataset.hyperionFilter) === true;
            survived ||= card.open;
        }
        if (survived) return;
        // The only open card was the one just used and it is gone (its filter
        // is applied), or a chip brought a card back: the applied / removed
        // filter's card opens when it is in the new block, else the server
        // defaults stand.
        const applied = activeKey ? cards.find((card) => card.dataset.hyperionFilter === activeKey) : null;
        if (applied) {
            applied.open = true;
        } else {
            cards.forEach((card, index) => { card.open = defaults[index]; });
        }
    };

    const onAfterSwap = () => {
        if (!restoreFocus) return;
        restoreFocus = false;
        const nav = root.querySelector(NAV);
        if (!nav) return;
        const key = focusKey ? escapeKey(focusKey) : null;
        const next = (key && nav.querySelector(`${CHIPS} a[data-hyperion-filter="${key}"]`))
            || (key && nav.querySelector(`${CARD.replace(']', `="${key}"]`)} > summary`))
            || nav.querySelector(`${CHIPS} a`)
            || nav.querySelector('summary');
        next?.focus({ preventScroll: true });
    };

    const onRobots = (event) => {
        const value = event.detail?.robots;
        if (typeof value !== 'string' || !ROBOTS_VALUE.test(value.trim())) return;
        let meta = root.querySelector('meta[name="robots"]');
        if (!meta) {
            const head = root.head ?? root.querySelector('head');
            if (!head) return;
            meta = root.createElement ? root.createElement('meta') : document.createElement('meta');
            meta.setAttribute('name', 'robots');
            head.appendChild(meta);
        }
        meta.setAttribute('content', value.trim());
    };

    root.addEventListener('htmx:oobBeforeSwap', onBeforeSwap);
    root.addEventListener('htmx:oobAfterSwap', onAfterSwap);
    root.addEventListener(ROBOTS_EVENT, onRobots);

    return () => {
        root.removeEventListener('htmx:oobBeforeSwap', onBeforeSwap);
        root.removeEventListener('htmx:oobAfterSwap', onAfterSwap);
        root.removeEventListener(ROBOTS_EVENT, onRobots);
    };
}

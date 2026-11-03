// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Keyboard focus for the infinite loading of the listings.
//
// The "Load more" link appends the next page's tiles and is itself replaced
// out of band by the next link (or by the final status line). A pointer user
// notices nothing; a keyboard user who activated the link would lose the
// focus to the body. When the request was started by the focused link, the
// focus moves to the new link, or to the status line once every page is on
// the page. Requests started by the viewport (automatic mode) leave the
// focus alone. Delegated on the document: the listing may be swapped later.

const CONTAINER = '[data-hyperion-load-more]';
const BUTTON = '[data-hyperion-load-more-button]';
const STATUS = '[data-hyperion-load-more-status]';

export function installLoadMoreFocus(root = document) {
    let restore = false;

    const onBeforeRequest = (event) => {
        const elt = event.detail?.elt;
        restore = !!(elt && elt.matches?.(BUTTON) && root.activeElement === elt);
    };

    const onAfterSettle = () => {
        if (!restore) return;
        restore = false;
        const container = root.querySelector(CONTAINER);
        const target = container?.querySelector(BUTTON) || container?.querySelector(STATUS);
        target?.focus({ preventScroll: true });
    };

    root.addEventListener('htmx:beforeRequest', onBeforeRequest);
    root.addEventListener('htmx:afterSettle', onAfterSettle);

    return () => {
        root.removeEventListener('htmx:beforeRequest', onBeforeRequest);
        root.removeEventListener('htmx:afterSettle', onAfterSettle);
    };
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Busy state of the "Proceed to Checkout" links.
//
// The checkout page takes a moment to answer, and a plain link gives no sign
// that the click was taken. A plain primary click on a checkout link (the
// cart summary card `data-hyperion-checkout-link`, the phone bar
// `data-hyperion-checkout-bar-link`, the mini-cart drawer) marks it
// `aria-busy="true"`; `_checkout-link.css` draws a spinner over the label and
// dims the link, without changing its box. The navigation itself is left
// alone: nothing delays or prevents the first click.
//
// While the link is busy a further plain click is prevented, so a double click
// does not cancel and restart the navigation (a modified click still opens a
// new tab). The busy state never outlives the
// navigation it stands for: it ends after BUSY_MS (a navigation that never
// happens: offline, stopped by the shopper) and on `pageshow` (Back from the
// checkout restores the page from the back/forward cache with its DOM as it
// was left). It is not cleared on `pagehide`: the leaving page stays on
// screen until the checkout paints, and the label would come back for that
// moment.
//
// One listener on the document. The mini-cart renders its fragment inside its
// own shadow root, where the target of a click seen from the document is the
// host element: the link is found on `composedPath()`. Links rendered later
// (a swapped cart section, a refetched drawer) are covered by the same
// listener, and the busy links are held by reference because a document query
// does not reach into a shadow root.

const LINK = '[data-hyperion-checkout-link], [data-hyperion-checkout-bar-link]';
const BUSY_MS = 10000;

function linkOf(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
        if (node instanceof Element && node.matches(LINK)) return node;
    }
    return event.target instanceof Element ? event.target.closest(LINK) : null;
}

// A click the browser turns into a navigation of this tab: the primary
// button without a modifier (those open a new tab or window, or download),
// on a live link that targets this browsing context.
function isPlainNavigation(event, link) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    if (link.getAttribute('aria-disabled') === 'true' || !link.hasAttribute('href') || link.hasAttribute('download')) return false;
    const target = (link.getAttribute('target') || '').trim().toLowerCase();
    return target === '' || target === '_self';
}

export function installCheckoutLinkBusy(root = document) {
    const view = root.defaultView || window;
    const busy = new Map();

    const release = (link) => {
        clearTimeout(busy.get(link));
        busy.delete(link);
        link.removeAttribute('aria-busy');
    };
    const releaseAll = () => {
        for (const link of [...busy.keys()]) release(link);
    };

    const onClick = (event) => {
        const link = linkOf(event);
        if (!link || event.defaultPrevented || !isPlainNavigation(event, link)) return;
        if (busy.has(link) && link.getAttribute('aria-busy') === 'true') {
            event.preventDefault();
            return;
        }
        link.setAttribute('aria-busy', 'true');
        busy.set(link, setTimeout(() => release(link), BUSY_MS));
    };

    root.addEventListener('click', onClick);
    view.addEventListener('pageshow', releaseAll);

    return () => {
        releaseAll();
        root.removeEventListener('click', onClick);
        view.removeEventListener('pageshow', releaseAll);
    };
}

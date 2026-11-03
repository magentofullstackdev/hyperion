// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-account-nav -- HTMX-enhanced customer account navigation.
 *
 * Wraps the server-rendered list of <a> links in the account sidebar.
 * Its only job is to tag each link with HTMX attributes so a click
 * swaps only the `#hyperion-account-content` subtree instead of a
 * full-page reload, then reflect the active state on the clicked
 * link without a round-trip.
 *
 * We use hx-boost semantics manually (explicit hx-get + hx-target +
 * hx-select) instead of `hx-boost="true"` so:
 *   * The target is pinned to `#hyperion-account-content` (hx-boost
 *     swaps the whole <body>, which would blow away the sidebar).
 *   * The response body can still be a full page -- HTMX extracts the
 *     content subtree via hx-select, so every server controller
 *     continues to render its normal layout chrome without any
 *     fragment/no-fragment branching.
 *
 * Light DOM only (no Shadow DOM): the links are fully visible to
 * page CSS and assistive tech, and the server can ship them in a
 * `<ul>` that stays usable before the bundle upgrades. Per Hyperion's
 * SRP memory rule: navigation behavior lives in its own dedicated
 * component, not inside `hyperion-dropdown` or a catch-all helper.
 */

const TAG = 'hyperion-account-nav';
const TARGET_ID = 'hyperion-account-content';
const TARGET_SELECTOR = `#${TARGET_ID}`;

class HyperionAccountNav extends HTMLElement {
    connectedCallback() {
        if (this._wired) return;
        this._wired = true;

        this._enhanceLinks();
        this.addEventListener('click', this._onClick);

        // When the browser restores a history entry via back/forward, HTMX
        // fires `htmx:historyRestore` -- re-run enhancement so any freshly
        // paged-in links pick up the HTMX attributes.
        document.body.addEventListener('htmx:historyRestore', this._onHistoryRestore);

        // Whenever a nav-driven swap lands, recompute the active link.
        document.body.addEventListener('htmx:afterSettle', this._onAfterSettle);
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._onClick);
        document.body.removeEventListener('htmx:historyRestore', this._onHistoryRestore);
        document.body.removeEventListener('htmx:afterSettle', this._onAfterSettle);
    }

    _enhanceLinks() {
        const links = this.querySelectorAll('a[href]');
        for (const a of links) {
            if (a.dataset.hyperionNavEnhanced === 'true') continue;
            if (a.hasAttribute('data-hyperion-nav-skip')) continue;
            const href = a.getAttribute('href') || '';
            // Only enhance same-origin account routes -- leave Sign Out, mailto,
            // external, and absolute cross-origin links to do a normal navigation.
            if (!this._isInternalAccountLink(href)) continue;

            a.setAttribute('hx-get', href);
            a.setAttribute('hx-target', TARGET_SELECTOR);
            a.setAttribute('hx-swap', 'outerHTML show:window:top');
            a.setAttribute('hx-select', TARGET_SELECTOR);
            // Also swap the page heading out-of-band so route changes
            // (e.g. "My Account" -> "Account Information") reflect in the
            // shell header without a full-page reload.
            a.setAttribute('hx-select-oob', '#hyperion-account-heading');
            a.setAttribute('hx-push-url', 'true');
            a.dataset.hyperionNavEnhanced = 'true';
        }

        // Ask HTMX to re-process newly attributed elements.
        if (window.htmx && typeof window.htmx.process === 'function') {
            window.htmx.process(this);
        }
    }

    _isInternalAccountLink(href) {
        if (!href) return false;
        if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
        if (href.startsWith('#')) return false;
        try {
            const url = new URL(href, window.location.origin);
            if (url.origin !== window.location.origin) return false;
            // Scope to account-ish paths so non-account links (e.g. "Sign Out"
            // that logs out and redirects to the homepage) fall through.
            return /(?:customer|sales|downloadable|wishlist|review|newsletter|vault|paypal-billing-agreement)/i
                .test(url.pathname);
        } catch (_e) {
            return false;
        }
    }

    _onClick = (event) => {
        const a = event.target.closest('a[href]');
        if (!a || !this.contains(a)) return;
        if (a.dataset.hyperionNavEnhanced !== 'true') return;
        // HTMX handles the network + swap via its delegated click listener.
        // We only update the optimistic active state so the user sees
        // immediate feedback before the swap settles.
        this._markActive(a);
    };

    _onHistoryRestore = () => {
        // history navigation may have rewritten the nav container; reprocess.
        this._enhanceLinks();
        this._syncActiveFromUrl();
    };

    _onAfterSettle = (event) => {
        const target = event?.detail?.target;
        if (!target || target.id !== TARGET_ID) return;
        this._syncActiveFromUrl();
    };

    _markActive(activeLink) {
        for (const a of this.querySelectorAll('a[href]')) {
            const isActive = a === activeLink;
            a.classList.toggle('is-active', isActive);
            if (isActive) {
                a.setAttribute('aria-current', 'page');
            } else {
                a.removeAttribute('aria-current');
            }
        }
    }

    _syncActiveFromUrl() {
        const here = window.location.pathname.replace(/\/+$/, '');
        let best = null;
        let bestLen = -1;
        for (const a of this.querySelectorAll('a[href]')) {
            if (a.dataset.hyperionNavEnhanced !== 'true') continue;
            try {
                const there = new URL(a.href, window.location.origin).pathname.replace(/\/+$/, '');
                if (here === there || here.startsWith(there + '/')) {
                    if (there.length > bestLen) {
                        best = a;
                        bestLen = there.length;
                    }
                }
            } catch (_e) { /* ignore */ }
        }
        if (best) this._markActive(best);
    }
}

if (!customElements.get(TAG)) {
    customElements.define(TAG, HyperionAccountNav);
}

export { HyperionAccountNav };

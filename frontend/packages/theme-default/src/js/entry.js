// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Hyperion theme entry bundle.
//
// Responsibilities:
//   1. Attach a global HTMX response-error listener so that network or 4xx/5xx
//      responses surface a user-visible notification instead of leaving the
//      page in a broken state.
//   2. Provide a single initialization hook -- Lit components are loaded on
//      demand as separate chunks, not from this entry bundle, so pages that
//      do not use a component pay no cost for it.
//
// HTMX itself is loaded from a versioned CDN <script> tag in the default
// Layout XML handle and is therefore NOT imported here.

import '../css/source/entry.css';

import { installMegaHover } from './lib/mega-hover.js';
import { installLoadMoreFocus } from './lib/listing-load-more.js';
import { installListingFilters } from './lib/listing-filters.js';
import { installCollapsibleNav } from './lib/collapsible-nav.js';
import { whenThemeStylesheetReady } from './lib/theme-stylesheet.js';
// The confirmation dialog answers `hx-confirm` from the first htmx event on,
// so it is the one component the entry carries itself.
import { HyperionConfirm } from './components/hyperion-confirm.js';

// Lit components.
//
// Every component is a separate input in vite.config.ts, so Vite emits one
// chunk per component and the entry fetches them here. Net result: ~40 KB of
// compressed JS on any Hyperion page, every hyperion-* element upgrades once
// its chunk is in. The fetch starts when the theme stylesheet applies
// (lib/theme-stylesheet.js): on the page types that paint their fold from
// an inline critical sheet the stylesheet loads without blocking, and
// chunks requested at module time would share the connection with the
// images of the fold and upgrade elements before their styles are in. A
// page that links the stylesheet synchronously starts them at once, as a
// static import would.
//
// This is the canonical place to add or remove components from the runtime.
const COMPONENTS = [
    () => import('./components/hyperion-dropdown.js'),
    () => import('./components/hyperion-mini-cart.js'),
    () => import('./components/hyperion-slider.js'),
    () => import('./components/hyperion-carousel.js'),
    () => import('./components/hyperion-image-zoom.js'),
    () => import('./components/hyperion-gallery.js'),
    () => import('./components/hyperion-tabs.js'),
    () => import('./components/hyperion-accordion.js'),
    () => import('./components/hyperion-rating.js'),
    () => import('./components/hyperion-swatches.js'),
    () => import('./components/hyperion-checkout.js'),
    () => import('./components/hyperion-filter-accordion.js'),
    () => import('./components/hyperion-coupon-form.js'),
    () => import('./components/hyperion-notification.js'),
    () => import('./components/hyperion-account-nav.js'),
    () => import('./components/hyperion-address-card.js'),
    () => import('./components/hyperion-list-toggle.js'),
    () => import('./components/hyperion-recaptcha.js'),
    () => import('./components/hyperion-messages.js'),
    () => import('./components/hyperion-order-cancel.js'),
    () => import('./components/hyperion-bundle-options.js'),
    () => import('./components/hyperion-custom-options.js'),
    () => import('./components/hyperion-region-select.js'),
    () => import('./components/hyperion-msrp-popup.js'),
];
const styled = whenThemeStylesheetReady();
styled.then(() => COMPONENTS.forEach((load) => load()));

// Form-key provider, `data-post` controls and the cookie notice live in
// `lib/`, so they can be unit tested; see the header of each file for
// the background (Varnish strips Set-Cookie, Luma's form-key-provider
// and mage/dataPost widgets, Magento_Cookie/js/notices.js).
import { ensureFormKey, getCachedFormKey, parseDataPost, submitDataPost } from './lib/form-key.js';
import { initCookieNotice } from './lib/cookie-notice.js';
import { recordCurrentProductView } from './lib/product-history.js';
import { initSearchHistory } from './lib/search-history.js';

const NOTIFICATION_SELECTOR = '[data-hyperion-notification]';

function onHtmxBeforeRequest() {
    // A fresh swap may have inserted markup carrying a stale form_key
    // (e.g. the mini-cart fragment). Re-sync before every outgoing
    // request so the serialized form always reflects the current cookie.
    ensureFormKey();
}

function onHtmxConfigRequest(event) {
    const params = event?.detail?.parameters;
    if (!params || !Object.prototype.hasOwnProperty.call(params, 'form_key')) return;
    // Belt-and-braces: even if the DOM input still holds a stale value
    // for any reason, replace the outgoing parameter with the live cookie.
    params.form_key = getCachedFormKey() || ensureFormKey();
}

function onHtmxAfterSwap(event) {
    ensureFormKey();
    autoSubmitForms(event?.detail?.elt);
}

// Core `data-post` controls (order history reorder, wishlist
// `data-post-remove`, ...) post a form built from their JSON payload;
// `confirmation` payloads ask through <hyperion-confirm>.
function onDataPostClick(event) {
    const control = event.target.closest('[data-post], [data-post-remove]');
    if (!control) return;
    const params = parseDataPost(control.getAttribute('data-post') || control.getAttribute('data-post-remove'));
    if (!params) return;
    event.preventDefault();
    submitDataPost(params, (message) => HyperionConfirm.ask(message));
}

// Pages whose only purpose is a POST (product alert unsubscribe from an
// email link) render a form with `data-hyperion-autosubmit`; core submits
// them from a RequireJS widget.
function autoSubmitForms(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll('form[data-hyperion-autosubmit]').forEach((form) => {
        if (form.hasAttribute('data-hyperion-autosubmitted')) return;
        form.setAttribute('data-hyperion-autosubmitted', '');
        form.submit();
    });
}

function showErrorNotification(message) {
    const target = document.querySelector(NOTIFICATION_SELECTOR);
    if (!target) {
        // No notification region rendered on this page -- fail silently rather
        // than throwing, since shell pages may legitimately lack one.
        return;
    }
    target.setAttribute('role', 'alert');
    // Paint with the error tone so _components.css applies the red
    // fill + on-error text. Also give the host its positioning
    // classes since the persistent placeholder renders without them.
    target.setAttribute('data-tone', 'error');
    target.textContent = message;
    target.hidden = false;
}

function onHtmxResponseError(event) {
    const xhr = event?.detail?.xhr;
    const status = xhr ? xhr.status : 0;
    const message = status
        ? `Request failed (${status}). Please try again.`
        : 'Network error. Please check your connection and try again.';
    showErrorNotification(message);
}

function onHtmxSendError() {
    showErrorNotification('Network error. Please check your connection and try again.');
}

// Full-page response guard.
//
// Defense-in-depth against HTMX silently swapping an entire PDP / error page
// into a fragment target. The normal failure mode is: an afterExecute plugin
// doesn't intercept (stale DI cache, upstream throw), Magento returns a 302
// _goBack(), HTMX follows the redirect and receives a full HTML document. If
// the swap target lacks `hx-select`, the whole <!doctype html>...</html> body
// ends up inside it -- reproducing the page inside itself.
//
// `hx-select="#hyperion-notification"` already narrows the add-to-cart /
// wishlist / compare flows, but any future HTMX target added without it would
// be exposed again. This listener cancels the swap whenever the response body
// looks like a standalone HTML document and surfaces a generic error toast.
const FULL_PAGE_RESPONSE_PATTERN = /^\s*(?:<!doctype\s+html|<html[\s>])/i;
const NOTIFICATION_MARKER = 'data-hyperion-notification';

function onHtmxBeforeSwap(event) {
    const xhr = event?.detail?.xhr;
    const body = xhr?.responseText;

    // Validation failures (missing swatch selection, out-of-stock qty, ...)
    // come back as 422 with a red toast in the body. HTMX refuses to swap
    // 4xx responses by default and would only raise the generic
    // "Request failed (422)" via htmx:responseError, so opt this one in
    // and clear the error flag.
    if (xhr && xhr.status === 422 && typeof body === 'string' && body.includes(NOTIFICATION_MARKER)) {
        event.detail.shouldSwap = true;
        event.detail.isError = false;
        return;
    }

    if (!body || !FULL_PAGE_RESPONSE_PATTERN.test(body)) return;

    // hx-select is the explicit "extract a fragment from this full page"
    // signal. If the requesting element opted in (e.g. the account-nav
    // links enhanced by hyperion-account-nav.js, which set
    // hx-select="#hyperion-account-content"), the response is *expected*
    // to be a full HTML document -- HTMX will narrow it to the selected
    // fragment before swapping. Canceling here would surface a bogus
    // error toast on every such call.
    //
    // Note: at htmx:beforeSwap, `event.detail.elt` is the swap *target*
    // (the element being replaced), not the requesting element. The
    // original requester lives at `event.detail.requestConfig.elt`.
    // `event.detail.select` is HTMX's resolved select string for this
    // swap (set when hx-select is present, or via the hx-reselect /
    // selectOverride pathway). Either signal is enough to skip the guard.
    const requester = event?.detail?.requestConfig?.elt;
    const resolvedSelect = event?.detail?.select;
    if (resolvedSelect || (requester && typeof requester.getAttribute === 'function' && requester.getAttribute('hx-select'))) {
        return;
    }

    event.preventDefault();
    const url = xhr.responseURL || event?.detail?.requestConfig?.path || 'unknown';
    console.warn(
        `[hyperion] Blocked full-page HTMX swap from ${url} (status ${xhr.status}). ` +
        'The server returned an HTML document instead of a fragment -- check that ' +
        'the intercepting plugin fired (HX-Request header) and cache tags are fresh.'
    );
    showErrorNotification('Something went wrong. Please try again.');
}

// Site-styled confirmation for plain POST forms (`data-hyperion-confirm`):
// the stored card delete, the compare "Clear All". The form submits only
// after the <hyperion-confirm> dialog answered yes; the attribute set on
// the way through lets the re-submission pass.
function onConfirmedFormSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const question = form.getAttribute('data-hyperion-confirm');
    if (!question || form.hasAttribute('data-hyperion-confirmed')) return;
    event.preventDefault();
    HyperionConfirm.ask(question).then((ok) => {
        if (!ok) return;
        form.setAttribute('data-hyperion-confirmed', '');
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
    });
}

// Site-styled confirmation for `hx-confirm`.
//
// HTMX fires `htmx:confirm` before every request; when the element carries
// `hx-confirm`, `detail.question` holds the text and HTMX would call
// `window.confirm()`. Cancel that, ask through <hyperion-confirm> and
// resume with `issueRequest(true)` (true = skip the built-in confirm).
function onHtmxConfirm(event) {
    const detail = event?.detail;
    if (!detail || !detail.question || typeof detail.issueRequest !== 'function') return;
    event.preventDefault();
    HyperionConfirm.ask(detail.question).then((ok) => {
        if (ok) detail.issueRequest(true);
    });
}

// Mobile Topmenu submenu toggle.
//
// The server-rendered navigation tree (Hyperion\Navigation\Block\Topmenu)
// emits a <button data-hyperion-submenu-toggle> next to every <a> that has
// a sibling <ul data-hyperion-submenu>. Desktop (md:+) shows submenus via
// pure CSS :hover; this handler drives the mobile tap-to-expand accordion.
function onSubmenuToggleClick(event) {
    const btn = event.target.closest('[data-hyperion-submenu-toggle]');
    if (!btn) return;
    const row = btn.parentElement;
    const submenu = row?.nextElementSibling;
    if (!submenu || !submenu.matches('[data-hyperion-submenu]')) return;

    event.preventDefault();
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
    submenu.classList.toggle('hidden', wasOpen);
    const icon = btn.querySelector('svg');
    if (icon) icon.classList.toggle('rotate-180', !wasOpen);
}

// Header search toggle.
//
// The header template renders a magnifier button with
// [data-hyperion-search-toggle] and a hidden full-width panel with
// [data-hyperion-search-panel]. Clicking the button flips the panel's
// `hidden` attribute, focuses the input, and flips the button's
// aria-expanded. The panel closes on ESC, on a click outside, and when
// another search-toggle fires.
function toggleSearchPanel(forceOpen) {
    const btn = document.querySelector('[data-hyperion-search-toggle]');
    const panel = document.querySelector('[data-hyperion-search-panel]');
    if (!btn || !panel) return;

    const isOpen = !panel.hasAttribute('hidden');
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;

    if (shouldOpen) {
        panel.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        // The panel hangs off the sticky header: preventScroll, or Chrome
        // scrolls the page towards the header's in-flow position.
        requestAnimationFrame(() => {
            panel.querySelector('input[type=search]')?.focus({ preventScroll: true });
        });
    } else {
        panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
    }
}

function onSearchToggleClick(event) {
    const btn = event.target.closest('[data-hyperion-search-toggle]');
    if (!btn) return;
    event.preventDefault();
    toggleSearchPanel();
}

function onSearchPanelOutsideClick(event) {
    const panel = document.querySelector('[data-hyperion-search-panel]');
    if (!panel || panel.hasAttribute('hidden')) return;
    if (panel.contains(event.target)) return;
    if (event.target.closest('[data-hyperion-search-toggle]')) return;
    toggleSearchPanel(false);
}

function onDocumentKeydown(event) {
    // Ctrl+K / Cmd+K opens search.
    const isModifier = event.metaKey || event.ctrlKey;
    if (isModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleSearchPanel(true);
        return;
    }
    if (event.key === 'Escape') {
        // Escape inside the panel gives the focus back to the control that
        // opened it; a keyboard user would otherwise restart from the body.
        const panel = document.querySelector('[data-hyperion-search-panel]');
        const wasInside = !!panel && !panel.hasAttribute('hidden') && panel.contains(document.activeElement);
        toggleSearchPanel(false);
        if (wasInside) document.querySelector('[data-hyperion-search-toggle]')?.focus({ preventScroll: true });
    }
}

// PageBuilder behavior (tabs, hover overlays, video backgrounds, maps) is a
// separate chunk, requested only by pages that hold PageBuilder content.
function bootPageBuilder(event) {
    const root = event?.detail?.elt ?? document;
    if (!document.querySelector('[data-content-type]')) return;
    styled.then(() => import('./lib/pagebuilder.js')).then((module) => module.bootPageBuilder(root.isConnected ? root : document));
}

// The Email a Friend form (recipient rows) is a chunk only that page requests.
function bootSendFriend() {
    if (!document.querySelector('[data-hyperion-sendfriend]')) return;
    styled.then(() => import('./lib/sendfriend.js')).then((module) => module.installSendFriend(document));
}

// Components requested only by pages (or swapped fragments, the mini-cart
// drawer) that contain one of their elements: a store without PayPal, a
// page without a sidebar or a history widget, a store without GA4 never
// downloads them. Custom elements upgrade when defined later. Like the
// components above they wait for the theme stylesheet.
const LAZY_COMPONENTS = {
    'hyperion-paypal-buttons': () => import('./components/hyperion-paypal-buttons.js'),
    'hyperion-paypal-message': () => import('./components/hyperion-paypal-message.js'),
    'hyperion-paypal-review': () => import('./components/hyperion-paypal-review.js'),
    'hyperion-wishlist-sidebar': () => import('./components/hyperion-wishlist-sidebar.js'),
    'hyperion-compare-sidebar': () => import('./components/hyperion-compare-sidebar.js'),
    'hyperion-recently-viewed': () => import('./components/hyperion-recently-viewed.js'),
    'hyperion-gtag': () => import('./components/hyperion-gtag.js'),
};

function bootLazyComponents(event) {
    const swapped = event?.detail?.elt;
    for (const [tag, load] of Object.entries(LAZY_COMPONENTS)) {
        if (customElements.get(tag)) continue;
        if (document.querySelector(tag) || swapped?.querySelector?.(tag) || swapped?.matches?.(tag)) {
            styled.then(load);
        }
    }
}

function init() {
    ensureFormKey();
    initCookieNotice();
    autoSubmitForms();
    bootPageBuilder();
    bootSendFriend();
    bootLazyComponents();
    // The history write parses the product record and touches localStorage:
    // nothing the first paint or the first interaction needs, so it runs in an
    // idle slot instead of adding to the long task of the page's own scripts.
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 1)))(() => recordCurrentProductView());
    initSearchHistory();
    document.body.addEventListener('htmx:responseError', onHtmxResponseError);
    document.body.addEventListener('htmx:sendError', onHtmxSendError);
    document.body.addEventListener('htmx:timeout', onHtmxSendError);
    document.body.addEventListener('htmx:beforeSwap', onHtmxBeforeSwap);
    document.body.addEventListener('htmx:beforeRequest', onHtmxBeforeRequest);
    document.body.addEventListener('htmx:configRequest', onHtmxConfigRequest);
    document.body.addEventListener('htmx:confirm', onHtmxConfirm);
    document.body.addEventListener('submit', onConfirmedFormSubmit);
    document.body.addEventListener('htmx:afterSwap', onHtmxAfterSwap);
    document.body.addEventListener('htmx:afterSettle', bootPageBuilder);
    document.body.addEventListener('htmx:afterSettle', bootLazyComponents);
    document.body.addEventListener('click', onDataPostClick);
    document.body.addEventListener('click', onSubmenuToggleClick);
    installMegaHover(document);
    installLoadMoreFocus(document);
    installListingFilters(document);
    installCollapsibleNav(document);
    document.body.addEventListener('click', onSearchToggleClick);
    document.addEventListener('click', onSearchPanelOutsideClick);
    document.addEventListener('keydown', onDocumentKeydown);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}

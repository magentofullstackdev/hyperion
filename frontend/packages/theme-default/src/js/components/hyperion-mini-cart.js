// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css } from 'lit';
import { trapTabKey } from '../lib/focus-trap.js';
import { lockBodyScroll, unlockBodyScroll } from '../lib/scroll-lock.js';
import { dismissAllNotifications } from './hyperion-notification.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { HyperionConfirm } from './hyperion-confirm.js';

const REMOVE_SELECTOR = '[data-hyperion-minicart-remove]';
const QTY_STEP_SELECTOR = '[data-hyperion-minicart-qty-step]';
const QTY_INPUT_SELECTOR = '[data-hyperion-minicart-qty]';
const ITEM_SELECTOR = '[data-hyperion-minicart-item]';
const UPDATE_URL_SELECTOR = '[data-hyperion-minicart-update-url]';
const CART_ITEMS_TARGET = '#hyperion-cart-items';
// Quiet time after the last step or typed value of a line before its
// quantity is posted: a burst of taps becomes one request.
const QTY_QUIET_MS = 250;

// The quantity rules of a line, read from its number input. The stepper
// moves by a numeric `step` (1 while it is absent or `any`); a decimal or
// `any` step makes the line a decimal one, parsed as a float. `min` falls
// back to 1 for whole quantities and to "above zero" for decimal ones.
function qtyRulesOf(input) {
    const stepAttribute = input.getAttribute('step');
    const stepNumber = stepAttribute === null || stepAttribute === '' ? NaN : Number(stepAttribute);
    const hasNumericStep = Number.isFinite(stepNumber) && stepNumber > 0;
    const decimal = stepAttribute === 'any' || (hasNumericStep && !Number.isInteger(stepNumber));
    const parse = (raw) => {
        const value = decimal ? parseFloat(raw) : parseInt(raw, 10);
        // Float steps (0.1 + 0.2) are rounded to the four decimals a quantity keeps.
        return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : NaN;
    };
    const min = parse(input.getAttribute('min'));
    const max = parse(input.getAttribute('max'));
    return {
        parse,
        step: hasNumericStep ? stepNumber : 1,
        min: Number.isFinite(min) ? min : (decimal ? 0 : 1),
        // Without a `min` a decimal quantity only has to be above zero.
        minExclusive: !Number.isFinite(min) && decimal,
        max: Number.isFinite(max) ? max : Infinity,
    };
}

function isQtyAllowed(rules, qty) {
    if (!Number.isFinite(qty)) return false;
    return rules.minExclusive ? qty > rules.min : qty >= rules.min;
}
// Attributes a slotted trigger link gives up while the component is upgraded
// (see _neutralizeTriggerLink), each kept in a data attribute for the restore.
const TRIGGER_LINK_ATTRIBUTES = [
    ['href', 'data-hyperion-href'],
    ['aria-label', 'data-hyperion-aria-label'],
];

// The light child slotted as the trigger, when it is a link.
function triggerLinkOf(host) {
    for (const child of host.children) {
        if (child.tagName === 'A' && child.getAttribute('slot') === 'trigger') return child;
    }
    return null;
}

function readFormKeyCookie() {
    for (const piece of document.cookie.split(';')) {
        const trimmed = piece.trim();
        if (trimmed.indexOf('form_key=') === 0) return trimmed.substring('form_key='.length);
    }
    return '';
}

// Mini-cart renders as a fixed off-canvas drawer from the right edge.
// - Trigger stays in the host slot / document flow.
// - Backdrop + panel are fixed to the viewport (escape the header stacking
//   context) with a slide-in transform and a dark overlay behind.
// - Full-width on mobile (< md), capped to 24rem on desktop.
// - Styling hooks are exposed via CSS custom properties and ::part().
//
// The drawer body is the HTML returned by `/hyperion/minicart/fragment` --
// a Tailwind-styled section using utility classes (flex, text-muted,
// bg-surface-raised, ...). Those classes only resolve if the page's main
// Tailwind stylesheet is ALSO present inside the shadow root, so we
// fetch it once and adopt it into every instance's shadow root via
// `adoptedStyleSheets`. Without this the drawer renders as raw Luma-
// looking unstyled markup (bullets, blue underlined links, ...).
//
// The sheet is 100 KB and `replaceSync` parses it on the main thread; it is
// adopted at upgrade (a later adoption moves the header for a frame, see
// connectedCallback) and the parsed sheet is cached module wide, so a second
// instance or the open never fetches it again.
let _sharedTailwindPromise = null;
async function _loadSharedTailwindSheet() {
    if (_sharedTailwindPromise) return _sharedTailwindPromise;
    _sharedTailwindPromise = (async () => {
        // The theme marks its Tailwind stylesheet with `data-hyperion-theme-css`
        // (HyperionCore::head/scripts.phtml; a child theme that links its own
        // build sets the same attribute). The href pattern is a fallback for
        // markup rendered before that attribute existed.
        const link = document.querySelector('link[rel="stylesheet"][data-hyperion-theme-css]')
            || document.querySelector('link[rel="stylesheet"][href*="/assets/entry."]');
        if (!link) return null;
        try {
            const res = await fetch(link.href, { credentials: 'same-origin' });
            if (!res.ok) return null;
            const css = await res.text();
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(css);
            return sheet;
        } catch (_e) {
            return null;
        }
    })();
    return _sharedTailwindPromise;
}

export class HyperionMiniCart extends LitElement {
    static properties = {
        count: { type: Number, reflect: true },
        triggerLabel: { type: String, attribute: 'trigger-label' },
        emptyMessage: { type: String, attribute: 'empty-message' },
        closeLabel: { type: String, attribute: 'close-label' },
        fragmentUrl: { type: String, attribute: 'fragment-url' },
        triggerUrl: { type: String, attribute: 'trigger-url' },
        removeConfirm: { type: String, attribute: 'remove-confirm' },
        _open: { state: true },
        _loading: { state: true },
        _bodyHtml: { state: true },
    };

    static styles = css`
        :host {
            --panel-width: 32rem;
            --panel-background: rgb(var(--color-surface));
            --panel-header-background: rgb(var(--color-surface-raised));
            --panel-text-color: rgb(var(--color-secondary));
            --panel-focus-ring: rgb(var(--color-primary));
            --panel-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
            --backdrop-color: rgba(0, 0, 0, 0.5);
            --transition-duration: 0.3s;
            display: inline-block;
        }

        [part="trigger"] {
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--panel-text-color);
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.5rem;
        }

        [part="trigger"]:focus-visible {
            outline: 2px solid var(--panel-focus-ring);
            outline-offset: 2px;
        }

        [part="backdrop"] {
            position: fixed;
            inset: 0;
            background: var(--backdrop-color);
            opacity: 0;
            visibility: hidden;
            transition: opacity var(--transition-duration) ease, visibility var(--transition-duration) ease;
            z-index: 9998;
        }

        :host([open]) [part="backdrop"] {
            opacity: 1;
            visibility: visible;
        }

        [part="panel"] {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            /* 100% of the viewport minus the scrollbar: a viewport unit
               includes the scrollbar and, with the root's stable gutter,
               overflows the page by its width. */
            width: 100%;
            max-width: var(--panel-width);
            background: var(--panel-background);
            box-shadow: var(--panel-shadow);
            display: flex;
            flex-direction: column;
            transform: translateX(100%);
            /* Hidden while closed: the panel sits just past the right edge and
               its 40px shadow would otherwise shade the page along that edge.
               visibility flips at the end of the closing slide (this rule's
               transition) and at once when opening (the open rule's 0s
               transition), so the focus can move into the panel in the same
               frame. */
            visibility: hidden;
            transition: transform var(--transition-duration) ease, visibility var(--transition-duration) ease;
            z-index: 9999;
        }

        :host([open]) [part="panel"] {
            transform: translateX(0);
            visibility: visible;
            transition: transform var(--transition-duration) ease, visibility 0s;
        }

        header[part="header"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--panel-header-background);
            padding: 1rem;
            border-bottom: 1px solid rgb(var(--color-subtle));
            flex-shrink: 0;
        }

        header[part="header"] button {
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--panel-text-color);
            font-size: 1.25rem;
            line-height: 1;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
        }

        header[part="header"] button:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        header[part="header"] button:focus-visible {
            outline: 2px solid var(--panel-focus-ring);
            outline-offset: 2px;
        }

        [part="item-list"] {
            flex: 1 1 auto;
            overflow-y: auto;
            padding: 0;
        }

        /* The fragment markup uses <ul role="list"> -- browsers still show
           disc bullets on those unless we explicitly strip them inside the
           component's scope. Same for the implicit left padding. */
        [part="item-list"] ul {
            list-style: none;
            margin: 0;
            padding: 0;
        }

        footer[part="footer"] {
            padding: 1rem;
            border-top: 1px solid rgb(var(--color-subtle));
            flex-shrink: 0;
        }

        @media (prefers-reduced-motion: reduce) {
            [part="panel"], [part="backdrop"] { transition: none; }
        }
    `;

    constructor() {
        super();
        this.count        = 0;
        this.triggerLabel = '';
        this.emptyMessage = '';
        this.closeLabel   = '';
        this.fragmentUrl  = '';
        this.triggerUrl   = '';
        this.removeConfirm = '';
        this._open        = false;
        this._loading     = false;
        this._bodyHtml    = '';
        this._stale       = true;
        this._onKeyDown   = this._onKeyDown.bind(this);
        this._onCartChanged = () => this._markStale();
        this._onShadowClick = this._onShadowClick.bind(this);
        this._onShadowChange = this._onShadowChange.bind(this);
        this._onTriggerSlotChange = () => this._neutralizeTriggerLink();
        // The control to focus again once the drawer body is re-rendered
        // after a quantity change: { itemId, selector }.
        this._pendingFocus = null;
        // Quantity changes being collected or sent, by item id:
        // { url, pending, sent, confirmed, timer }. `pending` is the value
        // the shopper sees, `sent` the one in flight (null when none),
        // `confirmed` the last one the server holds.
        this._qtyLines = new Map();
    }

    // The light DOM trigger is a link to the cart page (header.phtml), the
    // no-JS fallback. Once upgraded it is slotted INSIDE the shadow
    // `<button part="trigger">`, which is the one interactive control (its
    // aria-label, aria-haspopup, aria-expanded and aria-controls describe the
    // drawer): a link nested in a button is a second tab stop with a second
    // name (axe `nested-interactive`). The link keeps its classes, its icon
    // and the count badge, so the footprint of the header does not change;
    // only `href` and `aria-label` go (kept in data attributes and restored
    // when the element leaves the document, e.g. a swap of the header).
    _neutralizeTriggerLink() {
        const link = triggerLinkOf(this);
        if (!link || !link.hasAttribute('href')) return;
        for (const [name, store] of TRIGGER_LINK_ATTRIBUTES) {
            if (!link.hasAttribute(name)) continue;
            link.setAttribute(store, link.getAttribute(name));
            link.removeAttribute(name);
        }
        link.setAttribute('role', 'presentation');
        link.setAttribute('tabindex', '-1');
    }

    _restoreTriggerLink() {
        const link = triggerLinkOf(this);
        if (!link || !link.hasAttribute('data-hyperion-href')) return;
        for (const [name, store] of TRIGGER_LINK_ATTRIBUTES) {
            if (!link.hasAttribute(store)) continue;
            link.setAttribute(name, link.getAttribute(store));
            link.removeAttribute(store);
        }
        link.removeAttribute('role');
        link.removeAttribute('tabindex');
    }

    updated(changed) {
        if (changed.has('_open')) {
            if (this._open) {
                this.setAttribute('open', '');
                lockBodyScroll();
            } else {
                this.removeAttribute('open');
                unlockBodyScroll();
            }
        }
    }

    // Cart-change detection.
    //
    // The visible badge is the slotted light-DOM `#hyperion-mini-cart-count`
    // (it carries the styling and is what HTMX swaps); the component does
    // NOT render its own count next to it, or two numbers show up.
    //
    // Nothing sets `count` from the outside: the header badge
    // (`#hyperion-mini-cart-count`, slotted in light DOM) is what the
    // add-to-cart / cart-update responses refresh out-of-band, and what
    // `/hyperion/header/state` fills on page load. Watch it and derive
    // `count` from its text. Any change marks the cached drawer body
    // stale: refetch right away if the drawer is open, or on the next
    // open. Before this, the body was fetched once and reused forever, so
    // a drawer opened before the first add kept showing "empty".
    _observeBadge() {
        if (this._badgeObserver) return;
        this._badgeObserver = new MutationObserver(() => this._syncCountFromBadge());
        this._badgeObserver.observe(this, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        this._syncCountFromBadge();
    }

    _syncCountFromBadge() {
        const badge = this.querySelector('#hyperion-mini-cart-count');
        if (!badge) return;
        const next = parseInt((badge.textContent || '').trim(), 10) || 0;
        if (next === this.count) return;
        this.count = next;
        this._markStale();
    }

    // A controlled update (quantity change, remove) refetches once itself
    // when its work settled (`_post`, `_settleQty`): the badge observer and
    // the cart-changed event fire during that work too, and their refetch is
    // folded into that one. Two fetches back to back would re-render the body
    // twice and the second render would drop the focus `_restorePendingFocus`
    // had just put back; a refetch while a line still collects steps would
    // show a quantity the shopper has already moved past.
    _markStale() {
        this._stale = true;
        if (this._open && !this._updating && this._qtyLines.size === 0) {
            this._fetchFragment();
        }
    }

    /** Public hook: force the next open (or the open drawer) to refetch. */
    refresh() {
        this._markStale();
    }

    // Item removal from the drawer.
    //
    // The fragment's remove buttons sit inside the shadow root, where HTMX
    // does not scan for hx-* attributes, so the click is handled here and
    // the POST goes through `htmx.ajax`. The response of the delete plugin
    // carries the header badge and the toast out-of-band (processed even
    // with swap "none"), and the full cart body; when the cart page is
    // open its `#hyperion-cart-items` section is swapped too, otherwise
    // that part is dropped. The badge change then re-fetches the drawer
    // through the observer above.
    _onShadowClick(event) {
        const step = event.target.closest(QTY_STEP_SELECTOR);
        if (step) {
            event.preventDefault();
            this._stepQty(step);
            return;
        }
        const button = event.target.closest(REMOVE_SELECTOR);
        if (!button) return;
        event.preventDefault();
        const url = button.getAttribute('data-remove-url');
        if (!url) return;
        const question = this.removeConfirm;
        const proceed = question ? HyperionConfirm.ask(question) : Promise.resolve(true);
        proceed.then((ok) => {
            if (ok) this._removeItem(url, button);
        });
    }

    // Quantity change from the drawer.
    //
    // Each line carries a stepper (minus, number input, plus) and the list
    // the URL of core's checkout/cart/updatePost, the cart page's "Update
    // Cart" action: `cart[<item>][qty]` with `update_cart_action=update_qty`,
    // answered for HTMX by HyperionCore's UpdatePostPlugin exactly like the
    // delete (cart body, badge and toast out of band). A quantity the stock
    // refuses is SAVED by core's UpdatePost all the same (it catches the
    // validation exception and saves the cart, Luma validates client side):
    // the plugin answers with the item's error as the toast and the refetched
    // line prints the same message under the stepper.
    //
    // Steps accumulate: the input shows the new value at once, and one
    // request carries the final quantity once the line has been quiet for
    // QTY_QUIET_MS. The stepper stays enabled while that request runs; steps
    // made meanwhile only move the pending value, and a follow-up request
    // goes out after the answer when the two differ.
    _onShadowChange(event) {
        const input = event.target.closest(QTY_INPUT_SELECTOR);
        if (!input) return;
        const rules = qtyRulesOf(input);
        this._queueQty(input, rules, rules.parse(input.value), QTY_INPUT_SELECTOR);
    }

    _stepQty(button) {
        const item = button.closest(ITEM_SELECTOR);
        const input = item?.querySelector(QTY_INPUT_SELECTOR);
        if (!input) return;
        const direction = Math.sign(parseInt(button.getAttribute('data-hyperion-minicart-qty-step'), 10) || 0);
        if (direction === 0) return;
        const rules = qtyRulesOf(input);
        const current = this._qtyLines.get(this._itemIdOf(input))?.pending ?? rules.parse(input.value);
        const next = Math.round(((Number.isFinite(current) ? current : 0) + direction * rules.step) * 10000) / 10000;
        if (!isQtyAllowed(rules, next) || next > rules.max) return;
        this._queueQty(input, rules, next, `${QTY_STEP_SELECTOR.slice(0, -1)}="${button.getAttribute('data-hyperion-minicart-qty-step')}"]`);
    }

    _itemIdOf(control) {
        return control.closest(ITEM_SELECTOR)?.getAttribute('data-item-id') || '';
    }

    _queueQty(input, rules, qty, focusSelector) {
        const item = input.closest(ITEM_SELECTOR);
        const url = input.closest(UPDATE_URL_SELECTOR)?.getAttribute('data-hyperion-minicart-update-url');
        const itemId = this._itemIdOf(input);
        let line = this._qtyLines.get(itemId);
        if (!item || !url || !itemId || !isQtyAllowed(rules, qty)) {
            // Not a quantity (empty, 0, negative): nothing is sent and the
            // input goes back to the value it stood for.
            input.value = String(line ? line.pending : (input.getAttribute('value') || '1'));
            return;
        }
        if (!line) {
            line = { url, pending: qty, sent: null, confirmed: rules.parse(input.getAttribute('value')), timer: null };
            this._qtyLines.set(itemId, line);
        }
        line.pending = qty;
        this._pendingFocus = { itemId, selector: focusSelector };
        this._paintQty(item, qty);
        clearTimeout(line.timer);
        line.timer = setTimeout(() => {
            line.timer = null;
            // A request of the line is in flight: its answer decides.
            if (line.sent === null) this._flushQty(itemId);
        }, QTY_QUIET_MS);
    }

    // The optimistic state of a line: the pending value in the input, minus
    // disabled at the minimum and plus at the maximum.
    _paintQty(item, qty) {
        const input = item.querySelector(QTY_INPUT_SELECTOR);
        if (!input) return;
        const rules = qtyRulesOf(input);
        input.value = String(qty);
        for (const button of item.querySelectorAll(QTY_STEP_SELECTOR)) {
            const direction = Math.sign(parseInt(button.getAttribute('data-hyperion-minicart-qty-step'), 10) || 0);
            const next = Math.round((qty + direction * rules.step) * 10000) / 10000;
            button.disabled = !isQtyAllowed(rules, next) || next > rules.max;
        }
    }

    _itemOf(itemId) {
        return this.shadowRoot?.querySelector(`${ITEM_SELECTOR}[data-item-id="${itemId}"]`) || null;
    }

    // Send the pending quantity of a quiet line, or settle the line when the
    // server already holds it.
    _flushQty(itemId) {
        const line = this._qtyLines.get(itemId);
        if (!line || line.sent !== null || line.timer !== null) return;
        if (line.pending === line.confirmed) {
            this._settleQty(itemId);
            return;
        }
        const values = { update_cart_action: 'update_qty', [`cart[${itemId}][qty]`]: line.pending };
        const htmx = window.htmx;
        if (!htmx || typeof htmx.ajax !== 'function') {
            this._qtyLines.delete(itemId);
            this._post(line.url, values, []);
            return;
        }
        line.sent = line.pending;
        // Removing the line while its quantity is being saved would race the save.
        const remove = this._itemOf(itemId)?.querySelector(REMOVE_SELECTOR);
        if (remove) remove.disabled = true;
        const cartBody = document.querySelector(CART_ITEMS_TARGET);
        htmx.ajax('POST', line.url, {
            source: this,
            target: cartBody ? CART_ITEMS_TARGET : this,
            swap: cartBody ? 'outerHTML' : 'none',
            values: { ...values, form_key: readFormKeyCookie() },
        }).finally(() => {
            if (this._qtyLines.get(itemId) !== line) return;
            line.confirmed = line.sent;
            line.sent = null;
            // Steps still arriving: the quiet timer sends the follow-up.
            this._flushQty(itemId);
        });
    }

    // The line is in step with the server: one refetch re-renders the drawer
    // (totals, messages, the Remove button) once no line has work left.
    _settleQty(itemId) {
        this._qtyLines.delete(itemId);
        if (this._qtyLines.size === 0) this._markStale();
    }

    // A re-render that lands while a line still collects steps would show
    // the server value again: put the pending values back.
    _repaintPendingQty() {
        for (const [itemId, line] of this._qtyLines) {
            const item = this._itemOf(itemId);
            if (item) this._paintQty(item, line.pending);
        }
    }

    _removeItem(url, button) {
        // A quantity still waiting for its quiet time goes with the line.
        const itemId = this._itemIdOf(button);
        clearTimeout(this._qtyLines.get(itemId)?.timer);
        this._qtyLines.delete(itemId);
        this._post(url, {}, [button]);
    }

    // POST through htmx.ajax (the drawer is a shadow root, HTMX does not scan
    // it). The response of the cart mutation plugins carries the header badge
    // and the toast out of band (processed even with swap "none") and the full
    // cart body; when the cart page is open its `#hyperion-cart-items` section
    // is swapped too, otherwise that part is dropped. The badge change
    // re-fetches the drawer through the observer; the refetch in `finally`
    // covers an unchanged badge (an error toast came back).
    _post(url, values, controls) {
        const htmx = window.htmx;
        if (!htmx || typeof htmx.ajax !== 'function') {
            // No HTMX (should not happen on a Hyperion page): fall back to a
            // classic form POST so the change still happens.
            const form = document.createElement('form');
            form.method = 'post';
            form.action = url;
            for (const [name, value] of Object.entries({ ...values, form_key: readFormKeyCookie() })) {
                const field = document.createElement('input');
                field.type = 'hidden';
                field.name = name;
                field.value = String(value);
                form.appendChild(field);
            }
            document.body.appendChild(form);
            form.submit();
            return;
        }
        controls.forEach((control) => { control.disabled = true; });
        this._updating = true;
        const cartBody = document.querySelector(CART_ITEMS_TARGET);
        htmx.ajax('POST', url, {
            source: this,
            target: cartBody ? CART_ITEMS_TARGET : this,
            swap: cartBody ? 'outerHTML' : 'none',
            values: { ...values, form_key: readFormKeyCookie() },
        }).finally(() => {
            controls.forEach((control) => { control.disabled = false; });
            this._updating = false;
            this._markStale();
        });
    }

    // After a quantity change the body is re-rendered from the fragment:
    // put the keyboard focus back on the control that was used (a disabled
    // minus at the minimum quantity falls back to the input of the line).
    _restorePendingFocus() {
        const pending = this._pendingFocus;
        if (!pending) return;
        this._pendingFocus = null;
        const item = this.shadowRoot?.querySelector(`${ITEM_SELECTOR}[data-item-id="${pending.itemId}"]`);
        if (!item) return;
        const control = item.querySelector(pending.selector);
        const target = control && !control.disabled ? control : item.querySelector(QTY_INPUT_SELECTOR);
        target?.focus();
    }

    // One request at a time: a refetch asked for while one is in flight runs
    // once after it (the change may have landed after that request was sent),
    // never beside it, and the pending focus is restored after the LAST
    // render of the sequence.
    _fetchFragment() {
        if (!this.fragmentUrl) return Promise.resolve();
        if (this._fetching) {
            this._refetchQueued = true;
            return this._fetching;
        }
        this._fetching = this._fetchFragmentOnce().finally(() => {
            this._fetching = null;
            if (this._refetchQueued) {
                this._refetchQueued = false;
                return this._fetchFragment();
            }
            // The last render of the sequence (the body replaced the loading
            // slot): the control that was used gets the focus back.
            return this.updateComplete.then(() => {
                this._repaintPendingQty();
                this._restorePendingFocus();
            });
        });
        return this._fetching;
    }

    async _fetchFragmentOnce() {
        this._loading = true;
        try {
            const res = await fetch(this.fragmentUrl, {
                credentials: 'same-origin',
                headers: { Accept: 'text/html, */*;q=0.8', 'HX-Request': 'true' },
            });
            if (!res.ok) {
                this.dispatchEvent(new CustomEvent('hyperion-mini-cart-error', {
                    bubbles: true,
                    composed: true,
                    detail: { status: res.status },
                }));
                return;
            }
            this._bodyHtml = await res.text();
            this._stale = false;
        } catch {
            this.dispatchEvent(new CustomEvent('hyperion-mini-cart-error', {
                bubbles: true,
                composed: true,
                detail: { status: 0 },
            }));
        } finally {
            this._loading = false;
        }
    }

    async openPanel(event) {
        if (event) event.preventDefault();
        // A toast still floating from the add to cart would sit on the drawer.
        dismissAllNotifications();
        this._open = true;
        // The theme utilities reach the drawer body only through the adopted
        // sheet (adopted at upgrade, cached): wait for it alongside the
        // fragment so the body never paints unstyled.
        const adopted = this._adoptSharedTailwind();
        if (this.fragmentUrl && (!this._bodyHtml || this._stale)) {
            await this._fetchFragment();
        }
        await adopted;
        requestAnimationFrame(() => {
            this.shadowRoot?.querySelector('[part="panel"] header button')?.focus();
        });
    }

    // The trigger sits in the sticky header: a plain focus() makes Chrome
    // scroll the page towards the trigger's in-flow position (700 px down the
    // page ends up at 250 after Escape). The header is on screen anyway, so
    // the focus return never needs to scroll.
    close() {
        this._open = false;
        this.shadowRoot?.querySelector('[part="trigger"]')?.focus({ preventScroll: true });
    }

    _onKeyDown(e) {
        if (!this._open) return;
        if (e.key === 'Escape') {
            this.close();
            return;
        }
        // Tab stays inside the open drawer. The handler is registered on
        // the host and on the document; only the host sees the composed
        // event first, so the trap runs once.
        if (e.key === 'Tab' && e.currentTarget === this) {
            const panel = this.shadowRoot?.querySelector('[part="panel"]');
            if (panel) trapTabKey(e, panel);
        }
    }

    connectedCallback() {
        super.connectedCallback();
        // The theme sheet is adopted at upgrade on purpose: deferring it to the
        // first open leaves the shadow trigger without the preflight for a
        // frame and moves the whole header by a few pixels under throttling
        // (CLS 0.003 on warm reloads). The parsed sheet is
        // cached module wide, so the cost is one fetch per page, no refetch
        // for a second instance or the open.
        this._adoptSharedTailwind();
        this._neutralizeTriggerLink();
        this.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('hyperion:cart-changed', this._onCartChanged);
        this._observeBadge();
        this.updateComplete.then(() => {
            this.shadowRoot?.addEventListener('click', this._onShadowClick);
            this.shadowRoot?.addEventListener('change', this._onShadowChange);
        });
    }

    async _adoptSharedTailwind() {
        if (!this.shadowRoot || this._tailwindAdopted) return;
        const sheet = await _loadSharedTailwindSheet();
        if (!sheet || !this.shadowRoot) return;
        const current = this.shadowRoot.adoptedStyleSheets || [];
        if (current.includes(sheet)) return;
        this.shadowRoot.adoptedStyleSheets = [...current, sheet];
        this._tailwindAdopted = true;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('hyperion:cart-changed', this._onCartChanged);
        this.shadowRoot?.removeEventListener('click', this._onShadowClick);
        this.shadowRoot?.removeEventListener('change', this._onShadowChange);
        for (const line of this._qtyLines.values()) clearTimeout(line.timer);
        this._qtyLines.clear();
        if (this._badgeObserver) {
            this._badgeObserver.disconnect();
            this._badgeObserver = null;
        }
        if (this._open) unlockBodyScroll();
        this._restoreTriggerLink();
    }

    render() {
        return html`
            <button
                part="trigger"
                aria-label="${this.triggerLabel}"
                aria-haspopup="dialog"
                aria-expanded="${this._open}"
                aria-controls="hyperion-mini-cart-panel"
                @click=${this.openPanel}
            >
                <slot name="trigger" @slotchange=${this._onTriggerSlotChange}></slot>
            </button>
            <div
                part="backdrop"
                aria-hidden="${!this._open}"
                @click=${this.close}
            ></div>
            <aside
                part="panel"
                id="hyperion-mini-cart-panel"
                role="dialog"
                aria-modal="true"
                aria-label="${this.triggerLabel}"
                aria-hidden="${!this._open}"
                ?inert=${!this._open}
            >
                <header part="header">
                    <slot name="title"></slot>
                    <button aria-label="${this.closeLabel}" @click=${this.close}>
                        &#x2715;
                    </button>
                </header>
                <div part="item-list">
                    ${this._loading
                        ? html`<slot name="loading"></slot>`
                        : this._bodyHtml
                            ? html`${unsafeHTML(this._bodyHtml)}`
                            : html`<slot name="empty-message">${this.emptyMessage}</slot>`
                    }
                </div>
                <footer part="footer">
                    <slot name="footer"></slot>
                </footer>
            </aside>
        `;
    }
}

if (!customElements.get('hyperion-mini-cart')) {
    customElements.define('hyperion-mini-cart', HyperionMiniCart);
}

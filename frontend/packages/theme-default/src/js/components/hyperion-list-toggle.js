// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-list-toggle -- wishlist / compare button with membership state.
 *
 * Wraps the server-rendered HTMX form (progressive enhancement: without JS
 * the form still POSTs the native "add" action). Once upgraded it:
 *
 *   * reflects membership as the `active` attribute (styled by
 *     `_components.css`), sets `aria-pressed` + `title` on the button and
 *     swaps the visible label (`add-label` / `remove-label`);
 *   * turns the same click into a REMOVE when the product is already in
 *     the list, by rewriting the outgoing HTMX request in
 *     `htmx:configRequest` (`remove-url`, plus `remove-param` = the
 *     wishlist item id when the list needs it).
 *
 * State comes from `lib/list-state.js`, i.e. from the header counters
 * that every add / remove response refreshes out-of-band, so all toggles
 * for the same product on the page (grid tile, PDP) stay in sync.
 *
 * Attributes:
 *   kind          "wishlist" | "compare"
 *   product-id    catalog product id
 *   remove-url    POST URL of the remove controller
 *   remove-param  optional request param carrying the list item id
 *                 (wishlist: "item")
 *   add-label     visible label when NOT in the list
 *   remove-label  visible label when in the list
 */

import { LitElement, nothing } from 'lit';
import { subscribe } from '../lib/list-state.js';
import { recordComparedFromElement } from '../lib/product-history.js';

const LABEL_SELECTOR = '[data-hyperion-toggle-label]';

export class HyperionListToggle extends LitElement {
    static properties = {
        kind: { type: String },
        productId: { type: Number, attribute: 'product-id' },
        removeUrl: { type: String, attribute: 'remove-url' },
        removeParam: { type: String, attribute: 'remove-param' },
        addLabel: { type: String, attribute: 'add-label' },
        removeLabel: { type: String, attribute: 'remove-label' },
        active: { type: Boolean, reflect: true },
    };

    constructor() {
        super();
        this.kind = 'wishlist';
        this.productId = 0;
        this.removeUrl = '';
        this.removeParam = '';
        this.addLabel = '';
        this.removeLabel = '';
        this.active = false;
        this._itemId = 0;
        this._unsubscribe = null;
        this._onConfigRequest = this._onConfigRequest.bind(this);
        this._onStateChange = this._onStateChange.bind(this);
        this._onAfterRequest = this._onAfterRequest.bind(this);
        this._onBeforeRequest = this._onBeforeRequest.bind(this);
        this._wasActive = false;
    }

    // Light DOM: the server markup (form, inputs, button, svg) stays as is
    // and keeps every Tailwind utility class it was rendered with.
    createRenderRoot() {
        return this;
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('htmx:configRequest', this._onConfigRequest);
        this.addEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.addEventListener('htmx:afterRequest', this._onAfterRequest);
        this._unsubscribe = subscribe(this._onStateChange);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('htmx:configRequest', this._onConfigRequest);
        this.removeEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.removeEventListener('htmx:afterRequest', this._onAfterRequest);
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    updated(changed) {
        if (changed.has('active') || changed.has('addLabel') || changed.has('removeLabel')) {
            this._paint();
        }
    }

    _onStateChange(state) {
        const id = Number(this.productId);
        if (!id) return;
        if (this.kind === 'compare') {
            this.active = state.compare.has(id);
            this._itemId = 0;
        } else {
            this.active = state.wishlist.has(id);
            this._itemId = state.wishlist.get(id) || 0;
        }
    }

    // A successful "add to compare" (the toggle was not active when the
    // request left: htmx swaps the out-of-band fragment, which flips
    // `active`, before it fires afterRequest) puts the product on the
    // recently compared history; the record comes from the enclosing tile
    // or product page.
    _onBeforeRequest() {
        this._wasActive = this.active;
    }

    _onAfterRequest(event) {
        if (this.kind !== 'compare' || this._wasActive || !event.detail?.successful) return;
        recordComparedFromElement(this);
    }

    _onConfigRequest(event) {
        if (!this.active || !this.removeUrl) return;
        const detail = event.detail;
        if (!detail) return;
        detail.path = this.removeUrl;
        if (this.removeParam && detail.parameters) {
            detail.parameters[this.removeParam] = String(this._itemId);
        }
    }

    _paint() {
        const button = this.querySelector('button[type="submit"], button');
        if (button) {
            button.setAttribute('aria-pressed', this.active ? 'true' : 'false');
            const title = this.active ? this.removeLabel : this.addLabel;
            if (title) button.setAttribute('title', title);
        }
        const label = this.querySelector(LABEL_SELECTOR);
        const text = this.active ? this.removeLabel : this.addLabel;
        if (label && text) label.textContent = text;
    }
}

if (!customElements.get('hyperion-list-toggle')) {
    customElements.define('hyperion-list-toggle', HyperionListToggle);
}

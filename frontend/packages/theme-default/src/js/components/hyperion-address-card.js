// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-address-card -- server-rendered customer address tile.
 *
 * Light-DOM custom element: the server emits the entire card markup
 * (name, address, phone, edit + delete actions). This element only
 * intercepts the Delete form submit to ask through the site-styled
 * <hyperion-confirm> dialog (the one every confirmation of the theme goes
 * through: `hx-confirm`, `data-post`, the mini-cart remove) before the form
 * actually POSTs. No `window.confirm()`.
 *
 * Why a dedicated component instead of inline JS:
 *   * SRP -- delete-confirm is discrete behavior worth isolating.
 *   * Re-renderable -- the address book list can be swapped by HTMX
 *     without re-attaching document-level listeners.
 *
 * Server markup contract:
 *   <hyperion-address-card data-delete-confirm="Are you sure?">
 *     <form data-hyperion-address-delete method="post" action="...">
 *       ...
 *       <button type="submit">Delete</button>
 *     </form>
 *   </hyperion-address-card>
 */

import { HyperionConfirm } from './hyperion-confirm.js';

const TAG = 'hyperion-address-card';
// Set on the form once the dialog answered yes, so the re-submission passes.
const CONFIRMED_ATTRIBUTE = 'data-hyperion-confirmed';

class HyperionAddressCard extends HTMLElement {
    connectedCallback() {
        if (this._wired) return;
        this._wired = true;
        this.addEventListener('submit', this._onSubmit);
    }

    disconnectedCallback() {
        this.removeEventListener('submit', this._onSubmit);
    }

    _onSubmit = (event) => {
        const form = event.target.closest('[data-hyperion-address-delete]');
        if (!form || !this.contains(form) || form.hasAttribute(CONFIRMED_ATTRIBUTE)) return;
        event.preventDefault();
        const message = this.getAttribute('data-delete-confirm')
            || 'Are you sure you want to delete this address?';
        HyperionConfirm.ask(message).then((ok) => {
            if (!ok) return;
            form.setAttribute(CONFIRMED_ATTRIBUTE, '');
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
            else form.submit();
        });
    };
}

if (!customElements.get(TAG)) {
    customElements.define(TAG, HyperionAddressCard);
}

export { HyperionAddressCard };

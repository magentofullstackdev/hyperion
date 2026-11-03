// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <address-card> -- read-only display of a saved address. Used by
 * <address-selector> to render each saved-address row.
 */
import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

import type { Address } from '../types/address.js';
import { formatFullName } from '../utils/name-fields.js';

export class AddressCard extends LitElement {
    @property({ type: Object }) public address!: Address;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const a = this.address;
        const street = a.street.filter((s) => s.trim().length > 0).join(', ');
        const region = typeof a.region === 'object' && a.region?.region ? a.region.region : '';
        return html`
            <div class="text-sm text-brand space-y-0.5">
                <p class="font-semibold">${formatFullName(a)}</p>
                ${a.company ? html`<p class="text-muted">${a.company}</p>` : null}
                <p>${street}</p>
                <p>
                    ${[a.city, region, a.postcode].filter(Boolean).join(', ')}
                </p>
                <p>${a.country_id}</p>
                ${a.telephone ? html`<p class="text-muted">${a.telephone}</p>` : null}
            </div>
        `;
    }
}

if (!customElements.get('address-card')) {
    customElements.define('address-card', AddressCard);
}

declare global {
    interface HTMLElementTagNameMap { 'address-card': AddressCard; }
}

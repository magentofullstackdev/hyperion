// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hyperion-compare-sidebar> -- the compare products sidebar of 2 / 3
 * column pages.
 *
 * Rendered from the header-state compare fragment (lib/list-state.js,
 * `state.compareItems`: `{id, name, url}` records), hidden while the list
 * is empty. Remove is an HTMX POST to `remove-url` (the compare plugin
 * answers with the toast and the refreshed fragment); Compare links to the
 * compare page; Clear All is a plain POST to `clear-url` behind the
 * <hyperion-confirm> dialog (`data-hyperion-confirm`, entry.js).
 *
 * Attributes: compare-url, remove-url, clear-url, heading, compare-label,
 * clear-label, remove-label, confirm-label.
 */
import { html, nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';
import { subscribe } from '../lib/list-state.js';
import { ensureFormKey, getCachedFormKey } from '../lib/form-key.js';
import { formKeyInput, toastForm } from '../lib/product-card.js';

export class HyperionCompareSidebar extends HyperionLightElement {
    static properties = {
        compareUrl: { type: String, attribute: 'compare-url' },
        removeUrl: { type: String, attribute: 'remove-url' },
        clearUrl: { type: String, attribute: 'clear-url' },
        heading: { type: String },
        compareLabel: { type: String, attribute: 'compare-label' },
        clearLabel: { type: String, attribute: 'clear-label' },
        removeLabel: { type: String, attribute: 'remove-label' },
        confirmLabel: { type: String, attribute: 'confirm-label' },
        items: { state: true },
    };

    constructor() {
        super();
        this.compareUrl = '';
        this.removeUrl = '';
        this.clearUrl = '';
        this.heading = 'Compare Products';
        this.compareLabel = 'Compare';
        this.clearLabel = 'Clear All';
        this.removeLabel = 'Remove This Item';
        this.confirmLabel = '';
        this.items = [];
        this._onState = this._onState.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        this._unsubscribe = subscribe(this._onState);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribe?.();
        this._unsubscribe = null;
    }

    _onState(state) {
        this.items = Array.isArray(state.compareItems) ? state.compareItems : [];
        this.hidden = this.items.length === 0;
    }

    updated() {
        ensureFormKey(this);
        window.htmx?.process?.(this);
    }

    render() {
        if (this.items.length === 0) return nothing;
        const formKey = getCachedFormKey() || '';
        return html`<section class="bg-surface rounded-xl border border-subtle p-4 mb-6" aria-labelledby="hyperion-compare-sidebar-heading" data-hyperion-compare-sidebar>
            <h2 id="hyperion-compare-sidebar-heading" class="text-base font-semibold text-secondary mb-1">${this.heading}</h2>
            <p class="text-xs text-muted mb-2">${this.items.length} ${this.items.length === 1 ? 'item' : 'items'}</p>
            <ol class="divide-y divide-subtle">
                ${this.items.map((item) => html`<li class="flex items-center justify-between gap-2 py-2" data-hyperion-product-id=${item.id}>
                    <a href=${item.url} class="text-sm font-medium text-secondary hover:text-primary line-clamp-2">${item.name}</a>
                    ${toastForm(this.removeUrl, { product: item.id }, formKey,
                        html`<button type="submit" class="shrink-0 text-muted hover:text-error" title=${this.removeLabel} aria-label=${this.removeLabel} data-hyperion-compare-sidebar-remove>
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>`, { class: 'flex' })}
                </li>`)}
            </ol>
            <div class="mt-3 flex items-center gap-3">
                <a href=${this.compareUrl} class="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-primary hover:bg-primary-hover" data-hyperion-compare-sidebar-link>${this.compareLabel}</a>
                <form action=${this.clearUrl} method="post" class="flex" data-hyperion-confirm=${this.confirmLabel || nothing}>
                    ${formKeyInput(formKey)}
                    <button type="submit" class="text-xs text-muted hover:text-error underline-offset-2 hover:underline" data-hyperion-compare-sidebar-clear>${this.clearLabel}</button>
                </form>
            </div>
        </section>`;
    }
}

if (!customElements.get('hyperion-compare-sidebar')) {
    customElements.define('hyperion-compare-sidebar', HyperionCompareSidebar);
}

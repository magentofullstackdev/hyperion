// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <shipping-method-list> -- the shipping rates of the address, by the state
 * of the estimate:
 *
 *   idle     the address is not enough for rates yet: one line says what
 *            is needed (rates of an earlier address are not shown);
 *   loading  no rows yet: two placeholder rows of the height of a real one;
 *            with rows (a refresh): the rows stay, dimmed, `aria-busy`,
 *            their radios disabled;
 *   ready    the rows;
 *   empty    no carrier serves the address: a line says so, followed by the
 *            carriers' own messages;
 *   error    the request failed: the list on screen belonged to another
 *            address and is not shown, the section status carries the
 *            message and the retry.
 *
 * The block always keeps the height of two rows, so it does not change
 * height when the rates of the common one or two method answer arrive.
 * The progress text is one status region outside the radio group.
 *
 * A carrier with more than one method gets a presentational subheading and
 * its rows print the method only.
 */
import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/signals';

import type { ShippingMethod } from '../types/shipping.js';
import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { t } from '../utils/i18n.js';
import { isUsableShippingRate } from './shipping-method-row.js';
import './shipping-method-row.js';

type Entry =
    | { key: string; heading: string }
    | { key: string; method: ShippingMethod; grouped: boolean };

/** The rows in list order, with a subheading before the first row of a carrier that offers several methods. */
function listEntries(methods: readonly ShippingMethod[]): Entry[] {
    const perCarrier = new Map<string, number>();
    for (const m of methods) {
        if (isUsableShippingRate(m)) perCarrier.set(m.carrier_code, (perCarrier.get(m.carrier_code) ?? 0) + 1);
    }
    const headed = new Set<string>();
    const entries: Entry[] = [];
    for (const m of methods) {
        const grouped = isUsableShippingRate(m) && (perCarrier.get(m.carrier_code) ?? 0) > 1;
        if (grouped && !headed.has(m.carrier_code)) {
            headed.add(m.carrier_code);
            entries.push({ key: `carrier:${m.carrier_code}`, heading: m.carrier_title });
        }
        entries.push({ key: `rate:${m.carrier_code}:${m.method_code}`, method: m, grouped });
    }
    return entries;
}

export class ShippingMethodList extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const state = store.estimateState.get();
        const shown = state === 'idle' || state === 'error' ? [] : store.availableShippingMethods.get();
        const loading = state === 'loading';
        const empty = state === 'empty' || (state === 'ready' && shown.length === 0);
        let progress = '';
        if (loading) {
            progress = t(shown.length > 0 ? 'Hyperion_Checkout::shipping_updating' : 'Hyperion_Checkout::shipping_calculating');
        }

        return html`
            <div class="min-h-[6.25rem] space-y-2" data-estimate-state=${state}>
                ${state === 'idle'
                    ? html`<p class="text-sm text-muted" data-shipping-methods-idle>
                          ${t('Hyperion_Checkout::shipping_waiting_for_address')}
                      </p>`
                    : nothing}
                ${loading && shown.length === 0
                    ? html`
                          <div class="space-y-2" aria-hidden="true" data-shipping-methods-loading>
                              <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse"></div>
                              <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse"></div>
                          </div>
                      `
                    : nothing}
                ${empty
                    ? html`<p class="text-sm text-danger" data-shipping-methods-none>
                          ${t('Hyperion_Checkout::shipping_none_available')}
                      </p>`
                    : nothing}
                ${shown.length > 0 ? this._renderRows(shown, loading) : nothing}
                <hc-section-status section="shipping-methods"></hc-section-status>
            </div>
            <p class="sr-only" role="status" data-shipping-methods-progress>${progress}</p>
        `;
    }

    private _renderRows(methods: readonly ShippingMethod[], refreshing: boolean): unknown {
        const selected = getStore().selectedShippingMethod.get();
        return html`
            <div role="radiogroup"
                 aria-label=${t('Hyperion_Checkout::shipping_method_aria')}
                 aria-busy=${refreshing ? 'true' : nothing}
                 class="space-y-2 ${refreshing ? 'opacity-60' : ''}">
                ${repeat(listEntries(methods), (entry) => entry.key, (entry) => 'heading' in entry
                    ? html`<p class="pt-1 text-xs font-semibold uppercase tracking-wider text-muted"
                              aria-hidden="true"
                              data-shipping-carrier>${entry.heading}</p>`
                    : html`
                          <shipping-method-row
                              class="block"
                              .method=${entry.method}
                              .grouped=${entry.grouped}
                              .disabled=${refreshing}
                              .selected=${selected?.carrier_code === entry.method.carrier_code
                                  && selected.method_code === entry.method.method_code}
                              @method-select=${this._onSelect}
                          ></shipping-method-row>
                      `)}
            </div>
        `;
    }

    private _onSelect(e: CustomEvent<{ carrier_code: string; method_code: string }>): void {
        // The flow selects the rate, shows the totals it expects and saves.
        void flowActions().selectShippingMethod(e.detail);
    }
}

if (!customElements.get('shipping-method-list')) {
    customElements.define('shipping-method-list', ShippingMethodList);
}

declare global {
    interface HTMLElementTagNameMap { 'shipping-method-list': ShippingMethodList; }
}

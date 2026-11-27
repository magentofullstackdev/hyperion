// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Where the shipping extension chunk (`shipping-extension-host.ts`) plugs
 * its drawing into the checkout once it arrived: the address step of
 * `<checkout-shipping>`, the host under the rates and the summary lines
 * under the shipping row of `<summary-totals>`, whether the shipping
 * save of a rate is held (read by the flow actions) and the validation of
 * the active elements on an order attempt (the order pipeline). Null on a store
 * without shipping extensions, where nothing else of the chunk is in the
 * page, and until the chunk arrived.
 */
import { Signal } from 'signal-polyfill';

import { peekCheckoutConfig } from '../bootstrap-config.js';
import { shippingExtensionsValid } from '../extension/gates.js';
import { watchValue } from '../extension/watch.js';
import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';

export interface ShippingExtensionView {
    /** The address step around the editor. */
    address(editor: unknown): unknown;
    /** What goes under the rate list. */
    afterMethods(): unknown;
    /** The summary lines of the active extensions, under the shipping total. */
    summary(): unknown;
    /** A required extension of `selected` is not complete: its shipping save is held. Synchronous. */
    holdsSave(selected: { readonly carrier_code: string; readonly method_code: string } | null): boolean;
    /**
     * `validate()` of the active elements of the selected rate, for an order
     * attempt: false when one answered false, threw or did not answer in
     * time; true when none is active.
     */
    validate(): Promise<boolean>;
}

export const shippingExtensionView = new Signal.State<ShippingExtensionView | null>(null);

type Selected = { readonly carrier_code: string; readonly method_code: string } | null;

/** One part of a match without the chunk's matcher: a pattern (`/.../`) is not evaluated and counts as fitting. */
const fits = (rule: string | null | undefined, code: string): boolean => !rule || rule === '*' || rule.startsWith('/') || rule === code;

/**
 * Without the chunk (not arrived yet, or it could not be loaded): whether
 * a required entry of the configuration may apply to `selected`, so its
 * shipping save is held.
 */
export function configHoldsSave(selected: Selected): boolean {
    return (peekCheckoutConfig()?.hyperion?.shippingExtensions ?? []).some((entry) => entry.required
        && (!entry.match || selected === null || (fits(entry.match.carrier, selected.carrier_code) && fits(entry.match.method, selected.method_code))));
}

/**
 * The chunk could not be loaded: a rate a required entry may apply to
 * stays held and Place Order says why ("This delivery option could not be
 * loaded."); every other rate is saved and ordered as usual.
 */
export function shippingExtensionsUnavailable(): void {
    const store = getStore();
    const gate = (held: boolean): void => shippingExtensionsValid.set(held ? t('Hyperion_Checkout::shipping_extension_failed') : null);
    const read = (): boolean => configHoldsSave(store.selectedShippingMethod.get());
    gate(read());
    watchValue(read, gate);
}

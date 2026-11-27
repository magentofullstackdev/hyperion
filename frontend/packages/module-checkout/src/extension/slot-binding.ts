// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Binds a `<hc-slot-outlet>` to the slot registry: the outlet follows the
 * registrations of its name, shown as a block while it has one, hidden
 * otherwise, and the slot renderer (`slot-render.ts`) keeps its elements.
 */
import { isCheckoutSlotName, registeredSlots, type SlotRegistration } from './slots.js';
import { renderSlotElements } from './slot-render.js';
import { watchValue } from './watch.js';

const EMPTY: readonly SlotRegistration[] = [];

function apply(outlet: HTMLElement, entries: readonly SlotRegistration[]): void {
    const empty = entries.length === 0;
    outlet.hidden = empty;
    outlet.classList.toggle('block', !empty);
    if (empty && outlet.childElementCount === 0) return;
    void renderSlotElements(outlet, entries).catch((err: unknown) => {
        console.error('[hyperion-checkout] the slot elements could not be rendered', err);
    });
}

/** Follow the registry; the function returned stops it. */
export function bindSlotOutlet(outlet: HTMLElement): () => void {
    const read = (): readonly SlotRegistration[] => {
        const name = outlet.getAttribute('name');
        return isCheckoutSlotName(name) ? registeredSlots(name) : EMPTY;
    };
    apply(outlet, read());
    return watchValue(read, (entries) => apply(outlet, entries));
}

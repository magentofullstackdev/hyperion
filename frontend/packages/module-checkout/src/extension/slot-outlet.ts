// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-slot-outlet name="...">: the place of a named checkout slot.
 *
 * Light DOM, no Lit. The outlet is `hidden` while no element is registered
 * for its name: it reserves no space, takes no spacing of its parent's
 * `space-y-*` and renders nothing. Slot elements come only from the
 * generic extension pool (`hyperion.extensions`), so on a checkout without
 * such entries the outlet stays hidden and loads nothing; otherwise it
 * binds itself to the slot registry (`slot-binding.ts`, a chunk of its own).
 */
import { peekCheckoutConfig } from '../bootstrap-config.js';

export class SlotOutlet extends HTMLElement {
    /** Stops the binding to the registry; null while unbound. */
    public unbind: (() => void) | null = null;

    public connectedCallback(): void {
        this.hidden = this.childElementCount === 0;
        if ((peekCheckoutConfig()?.hyperion?.extensions?.length ?? 0) === 0) return;
        void import('./slot-binding.js')
            .then((binding) => {
                if (this.isConnected && this.unbind === null) this.unbind = binding.bindSlotOutlet(this);
            })
            .catch((err: unknown) => {
                console.error('[hyperion-checkout] a checkout slot could not be bound', err);
            });
    }

    public disconnectedCallback(): void {
        this.unbind?.();
        this.unbind = null;
    }
}

if (!customElements.get('hc-slot-outlet')) {
    customElements.define('hc-slot-outlet', SlotOutlet);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-slot-outlet': SlotOutlet; }
}

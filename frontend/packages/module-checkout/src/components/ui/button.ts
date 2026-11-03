// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

/**
 * <hc-button> -- light-DOM CTA primitive.
 *
 * Light DOM is required so the global Tailwind stylesheet's utility
 * classes (`bg-accent`, `text-on-accent`, etc.) cascade in. The
 * trade-off: HTML <slot> elements do NOT pass children through in
 * light-DOM Lit components -- Lit's render() pass replaces the host's
 * content wholesale on each update, so any slotted text disappears.
 *
 * Therefore: callers pass the button label via the `label` property,
 * not via slotted children. This keeps the rendering deterministic
 * across re-renders triggered by `disabled` / `loading` flips.
 */
export class Button extends LitElement {
    @property({ type: String }) public variant: 'primary' | 'secondary' | 'ghost' = 'primary';
    @property({ type: Boolean }) public disabled = false;
    /**
     * Looks disabled (`aria-disabled="true"`, dimmed) but stays focusable
     * and clickable, so the click handler can tell the shopper what is
     * missing; the handler decides what the click does.
     */
    @property({ type: Boolean }) public softDisabled = false;
    @property({ type: Boolean }) public loading = false;
    @property({ type: String }) public type: 'button' | 'submit' = 'button';
    @property({ type: String }) public label = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const base = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed';
        const variants = {
            primary: 'bg-accent text-on-accent hover:bg-accent/90',
            secondary: 'bg-surface-raised text-brand border border-subtle hover:bg-subtle',
            ghost: 'bg-transparent text-accent hover:underline',
        };
        return html`
            <button
                type=${this.type}
                ?disabled=${this.disabled || this.loading}
                aria-disabled=${this.softDisabled && !this.disabled && !this.loading ? 'true' : nothing}
                class="${base} ${variants[this.variant]}"
                @click=${this._onClick}
            >
                ${this.loading
                    ? html`<span class="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>`
                    : null}
                ${this.label}
            </button>
        `;
    }

    private _onClick(e: Event): void {
        if (this.disabled || this.loading) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
}

if (!customElements.get('hc-button')) {
    customElements.define('hc-button', Button);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-button': Button; }
}

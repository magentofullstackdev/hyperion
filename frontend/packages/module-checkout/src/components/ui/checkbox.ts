// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

export class Checkbox extends LitElement {
    @property({ type: String }) public label = '';
    @property({ type: String }) public name = '';
    @property({ type: Boolean }) public checked = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const id = `hc-cb-${this.name || Math.random().toString(36).slice(2)}`;
        return html`
            <label for=${id} class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                    id=${id}
                    type="checkbox"
                    name=${this.name}
                    class="h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                    .checked=${this.checked}
                    @change=${this._onChange}
                />
                <span class="text-sm text-brand">${this.label}</span>
            </label>
        `;
    }

    private _onChange(e: Event): void {
        const target = e.target as HTMLInputElement;
        this.checked = target.checked;
        this.dispatchEvent(new CustomEvent('value-change', {
            detail: { checked: target.checked, name: this.name },
            bubbles: true,
            composed: true,
        }));
    }
}

if (!customElements.get('hc-checkbox')) {
    customElements.define('hc-checkbox', Checkbox);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-checkbox': Checkbox; }
}

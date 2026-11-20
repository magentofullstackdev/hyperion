// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

import { fieldId, nextFieldIdPrefix } from './field-id.js';

export class Checkbox extends LitElement {
    @property({ type: String }) public label = '';
    @property({ type: String }) public name = '';
    @property({ type: Boolean }) public checked = false;
    /** The first part of the control id; a per-element one when the form gives none. */
    @property({ type: String, attribute: 'id-prefix' }) public idPrefix = '';

    private _ownIdPrefix: string | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this.classList.add('hc-field');
    }

    /** The id of the control, stable for the life of the element. */
    public get controlId(): string {
        if (this.idPrefix !== '') return fieldId(this.idPrefix, this.name);
        this._ownIdPrefix ??= nextFieldIdPrefix();
        return fieldId(this._ownIdPrefix, this.name);
    }

    public override render(): unknown {
        const id = this.controlId;
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

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Light-DOM select input. Options are rendered from the `options`
 * property -- an array of `{value, label}`.
 */
import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

export interface SelectOption {
    value: string;
    label: string;
}

export class SelectInput extends LitElement {
    @property({ type: String }) public label = '';
    @property({ type: String }) public name = '';
    @property({ type: String }) public value = '';
    @property({ type: Array }) public options: readonly SelectOption[] = [];
    @property({ type: Boolean, reflect: true }) public required = false;
    @property({ type: String }) public error: string = '';
    @property({ type: String }) public placeholder = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const id = `hc-select-${this.name || Math.random().toString(36).slice(2)}`;
        return html`
            <label for=${id} class="block text-sm font-medium text-brand">
                ${this.label}
                ${this.required ? html`<span aria-hidden="true" class="text-danger">*</span>` : null}
            </label>
            <select
                id=${id}
                name=${this.name}
                class="mt-1 block w-full rounded-md border ${this.error ? 'border-danger' : 'border-subtle'} bg-surface px-3 py-2 text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                .value=${this.value}
                ?required=${this.required}
                aria-required=${this.required ? 'true' : 'false'}
                aria-invalid=${this.error ? 'true' : 'false'}
                @change=${this._onChange}
            >
                ${this.placeholder
                    ? html`<option value="" ?selected=${!this.value}>${this.placeholder}</option>`
                    : null}
                ${this.options.map((opt) => html`
                    <option value=${opt.value} ?selected=${opt.value === this.value}>
                        ${opt.label}
                    </option>
                `)}
            </select>
            ${this.error
                ? html`<p class="mt-1 text-sm text-danger">${this.error}</p>`
                : null}
        `;
    }

    private _onChange(e: Event): void {
        const target = e.target as HTMLSelectElement;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent('value-change', {
            detail: { value: target.value, name: this.name },
            bubbles: true,
            composed: true,
        }));
    }
}

if (!customElements.get('hc-select-input')) {
    customElements.define('hc-select-input', SelectInput);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-select-input': SelectInput; }
}

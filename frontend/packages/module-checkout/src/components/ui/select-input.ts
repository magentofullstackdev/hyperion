// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Light-DOM select input. Options are rendered from the `options`
 * property, an array of `{value, label}`; an option with `separator` is a
 * disabled divider line (between the first choices and the full list).
 * When a value occurs twice in the list only its first option is selected.
 *
 * Emits `value-change` (`{ value, name }`) and `value-blur`. The error
 * line is always in the flow, like the one of the text input, so a select
 * and a text input are interchangeable without moving the fields below.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { fieldId, nextFieldIdPrefix } from './field-id.js';

export interface SelectOption {
    value: string;
    label: string;
    separator?: boolean;
}

export class SelectInput extends LitElement {
    @property({ type: String }) public label = '';
    @property({ type: String }) public name = '';
    @property({ type: String }) public value = '';
    @property({ type: Array }) public options: readonly SelectOption[] = [];
    @property({ type: Boolean, reflect: true }) public required = false;
    @property({ type: String }) public error: string = '';
    @property({ type: String }) public placeholder = '';
    @property({ type: String }) public autocomplete: string = '';
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
        const messageId = `${id}-msg`;
        const selectedIndex = this.options.findIndex((opt) => !opt.separator && opt.value === this.value);
        return html`
            <label for=${id} class="hc-field-label text-brand">
                ${this.label}
                ${this.required ? html`<span aria-hidden="true" class="text-danger">*</span>` : nothing}
            </label>
            <select
                id=${id}
                name=${this.name}
                class="hc-field-control ${this.error ? 'border-danger' : 'border-subtle'} bg-surface text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                autocomplete=${ifDefined(this.autocomplete === '' ? undefined : this.autocomplete)}
                ?required=${this.required}
                aria-required=${this.required ? 'true' : 'false'}
                aria-invalid=${this.error ? 'true' : 'false'}
                aria-describedby=${ifDefined(this.error ? messageId : undefined)}
                @change=${this._onChange}
                @blur=${this._onBlur}
            >
                ${this.placeholder
                    ? html`<option value="" ?selected=${selectedIndex === -1}>${this.placeholder}</option>`
                    : nothing}
                ${this.options.map((opt, index) => opt.separator
                    ? html`<option disabled>${opt.label}</option>`
                    : html`
                          <option value=${opt.value} ?selected=${index === selectedIndex}>
                              ${opt.label}
                          </option>
                      `)}
            </select>
            <p id=${messageId} data-tone="error" class="hc-field-message text-danger">${this.error}</p>
        `;
    }

    /**
     * The options are rendered after the attributes of the select, and an
     * option the shopper once picked no longer follows its `selected`
     * attribute: the value is therefore set on the control once the list
     * is in place. A value outside the list falls back to the placeholder.
     */
    protected override updated(): void {
        const select = this.querySelector('select');
        if (select === null || select.value === this.value) return;
        select.value = this.value;
        if (select.value !== this.value && this.placeholder) select.value = '';
    }

    private _onChange(e: Event): void {
        const target = e.target as HTMLSelectElement;
        if (target.value === this.value) return;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent('value-change', {
            detail: { value: target.value, name: this.name },
            bubbles: true,
            composed: true,
        }));
    }

    private _onBlur(): void {
        this.dispatchEvent(new CustomEvent('value-blur', {
            detail: { value: this.value, name: this.name },
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

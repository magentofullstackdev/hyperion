// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Light-DOM text input primitive. Tailwind classes, accessible.
 * Emits 'input' and 'change' native events on the underlying input.
 *
 * `error` marks the field invalid (`aria-invalid`, red text and border);
 * `warning` is a hint the shopper may ignore (the postcode format): it is
 * only associated through `aria-describedby`, so it is read with the field
 * and never turns it invalid or announces itself on every keystroke.
 */
import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

export class TextInput extends LitElement {
    @property({ type: String }) public label = '';
    @property({ type: String }) public name = '';
    @property({ type: String }) public value = '';
    @property({ type: String }) public type: string = 'text';
    @property({ type: String }) public placeholder = '';
    @property({ type: String }) public autocomplete: string = '';
    @property({ type: Boolean, reflect: true }) public required = false;
    @property({ type: String }) public error: string = '';
    @property({ type: String }) public warning: string = '';
    @property({ type: String }) public inputmode: string = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const id = `hc-input-${this.name || Math.random().toString(36).slice(2)}`;
        const describedBy = [this.error ? `${id}-err` : '', this.warning ? `${id}-warn` : '']
            .filter(Boolean)
            .join(' ');
        return html`
            <label for=${id} class="block text-sm font-medium text-brand">
                ${this.label}
                ${this.required ? html`<span aria-hidden="true" class="text-danger">*</span>` : null}
            </label>
            <input
                id=${id}
                name=${this.name}
                type=${this.type}
                class="mt-1 block w-full rounded-md border ${this.error ? 'border-danger' : 'border-subtle'} bg-surface px-3 py-2 text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                .value=${this.value}
                placeholder=${this.placeholder}
                autocomplete=${this.autocomplete}
                inputmode=${this.inputmode || ''}
                ?required=${this.required}
                aria-required=${this.required ? 'true' : 'false'}
                aria-invalid=${this.error ? 'true' : 'false'}
                aria-describedby=${describedBy}
                @input=${this._onInput}
                @blur=${this._onBlur}
            />
            ${this.error
                ? html`<p id="${id}-err" class="mt-1 text-sm text-danger">${this.error}</p>`
                : null}
            ${this.warning
                ? html`<p id="${id}-warn" class="mt-1 text-sm text-warning-strong">${this.warning}</p>`
                : null}
        `;
    }

    private _onInput(e: Event): void {
        const target = e.target as HTMLInputElement;
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

if (!customElements.get('hc-text-input')) {
    customElements.define('hc-text-input', TextInput);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-text-input': TextInput; }
}

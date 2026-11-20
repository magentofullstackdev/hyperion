// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Light-DOM text input primitive. Tailwind classes, accessible.
 *
 * Emits `value-change` (`{ value, name }`) when the value of the field
 * changed and `value-blur` when it lost the focus. The value is read on
 * `input`, on `change` (a password manager or an autofill may fire only
 * that one) and on blur; an event that carries the value already known is
 * not announced twice. While an input method composes a character nothing
 * is announced and nothing is written back into the field: the composed
 * text is taken when the composition ends.
 *
 * `error` marks the field invalid (`aria-invalid`, red text and border);
 * `warning` is a hint the shopper may ignore (the postcode format) and
 * `hint` a neutral note (a check in progress): both are only associated
 * through `aria-describedby`, so they are read with the field and never
 * turn it invalid. The three share ONE message line that is always in the
 * flow, so the block keeps its height when a message comes or goes.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { fieldId, nextFieldIdPrefix } from './field-id.js';

function orUndefined(value: string): string | undefined {
    return value === '' ? undefined : value;
}

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
    @property({ type: String }) public hint: string = '';
    @property({ type: String }) public inputmode: string = '';
    /** The first part of the control id; a per-element one when the form gives none. */
    @property({ type: String, attribute: 'id-prefix' }) public idPrefix = '';
    /** `autocapitalize` of the control (`words` for names and cities). */
    @property({ type: String }) public capitalize: string = '';
    /** Turns the spelling check of the control off (codes, addresses of mailboxes). */
    @property({ type: Boolean, attribute: 'no-spellcheck' }) public noSpellcheck = false;
    /** `enterkeyhint` of the control (`next` for every field but the last of a form). */
    @property({ type: String, attribute: 'enter-hint' }) public enterHint: string = '';

    private _ownIdPrefix: string | null = null;
    private _composing = false;

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
        const message = this.error || this.warning || this.hint;
        const tone = this.error ? 'error' : this.warning ? 'warning' : 'hint';
        return html`
            <label for=${id} class="hc-field-label text-brand">
                ${this.label}
                ${this.required ? html`<span aria-hidden="true" class="text-danger">*</span>` : nothing}
            </label>
            <input
                id=${id}
                name=${this.name}
                type=${this.type}
                class="hc-field-control ${this.error ? 'border-danger' : 'border-subtle'} bg-surface text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                .value=${this.value}
                placeholder=${ifDefined(orUndefined(this.placeholder))}
                autocomplete=${ifDefined(orUndefined(this.autocomplete))}
                inputmode=${ifDefined(orUndefined(this.inputmode))}
                autocapitalize=${ifDefined(orUndefined(this.capitalize))}
                spellcheck=${ifDefined(this.noSpellcheck ? 'false' : undefined)}
                enterkeyhint=${ifDefined(orUndefined(this.enterHint))}
                ?required=${this.required}
                aria-required=${this.required ? 'true' : 'false'}
                aria-invalid=${this.error ? 'true' : 'false'}
                aria-describedby=${ifDefined(message ? messageId : undefined)}
                @input=${this._onInput}
                @change=${this._onChange}
                @compositionstart=${this._onCompositionStart}
                @compositionend=${this._onCompositionEnd}
                @blur=${this._onBlur}
            />
            <p id=${messageId}
               data-tone=${tone}
               class="hc-field-message ${this.error
                   ? 'text-danger'
                   : this.warning ? 'text-warning-strong' : 'text-muted'}">${message}</p>
        `;
    }

    /** Take the value of the control; announce it when it is news. */
    private _commit(value: string): void {
        if (value === this.value) return;
        this.value = value;
        this.dispatchEvent(new CustomEvent('value-change', {
            detail: { value, name: this.name },
            bubbles: true,
            composed: true,
        }));
    }

    private _onInput(e: Event): void {
        if (this._composing || (e as InputEvent).isComposing === true) return;
        this._commit((e.target as HTMLInputElement).value);
    }

    private _onChange(e: Event): void {
        if (this._composing) return;
        this._commit((e.target as HTMLInputElement).value);
    }

    private _onCompositionStart(): void {
        this._composing = true;
    }

    private _onCompositionEnd(e: Event): void {
        this._composing = false;
        this._commit((e.target as HTMLInputElement).value);
    }

    private _onBlur(e: Event): void {
        this._composing = false;
        this._commit((e.target as HTMLInputElement).value);
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

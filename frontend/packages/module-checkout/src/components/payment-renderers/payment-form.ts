// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-form> -- the generic `form` type of the payment renderer
 * entries: a method that needs a few fields from the shopper and no
 * JavaScript of its own (a purchase order number, a date of birth for an
 * invoice provider).
 *
 * The fields come from the entry (`fields`, labels already translated by
 * the server) and are drawn with the checkout's own controls. A required
 * field must not be empty and a field with a `pattern` must match it as a
 * whole (`utils/whole-pattern.ts`: a pattern the browser cannot compile
 * makes the field invalid); the
 * error shows after the field lost the focus, or for every field when the
 * checkout asks (`validate()`, a press of Place Order). The element reports
 * whether it is complete (`hyperion-payment:valid` / `:invalid`), so Place
 * Order follows the typing. Values travel trimmed, in `additional_data`
 * under the field name or as the top level `po_number`.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import type {
    PaymentContext,
    PaymentData,
    PaymentFormField,
    PaymentMethodInfo,
    VaultTokenInfo,
} from '../../../extension-api.js';
import { matchesWhole } from '../../utils/whole-pattern.js';
import '../ui/select-input.js';
import '../ui/text-input.js';

function fieldsOf(options: Readonly<Record<string, unknown>>): PaymentFormField[] {
    const listed = options['fields'];
    if (!Array.isArray(listed)) return [];
    return listed.filter((field): field is PaymentFormField => Boolean(field)
        && typeof (field as PaymentFormField).name === 'string'
        && (field as PaymentFormField).name !== '');
}

export class PaymentForm extends LitElement {
    public static readonly hyperionApi = '1';

    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: PaymentMethodInfo;
    public config: Readonly<Record<string, unknown>> = {};
    public token: VaultTokenInfo | null = null;

    @state() private _values: Readonly<Record<string, string>> = {};
    @state() private _touched: ReadonlySet<string> = new Set();

    private _reported: string | null | undefined;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this.dispatchEvent(new CustomEvent('hyperion-payment:ready', { bubbles: true, composed: true, detail: {} }));
        this._reported = undefined;
        this._report();
    }

    private _fields(): PaymentFormField[] {
        return fieldsOf(this.options);
    }

    /** The error of a field for its value; empty when it is fine. */
    private _errorOf(field: PaymentFormField): string {
        const value = (this._values[field.name] ?? '').trim();
        if (value === '') {
            if (!field.required) return '';
            return field.target === 'po_number'
                ? this.context.t('Enter the purchase order number.')
                : this.context.t('This is a required field.');
        }
        if (field.pattern && !matchesWhole(field.pattern, value)) {
            return this.context.t('Enter a valid {label}.', { label: field.label });
        }
        return '';
    }

    /** The first error of the form, null when it is complete. */
    private _firstError(): string | null {
        for (const field of this._fields()) {
            const error = this._errorOf(field);
            if (error !== '') return error;
        }
        return null;
    }

    /** Tell the checkout whether the form is complete, when that changed. */
    private _report(): void {
        const error = this._firstError();
        if (error === this._reported) return;
        this._reported = error;
        this.dispatchEvent(error === null
            ? new CustomEvent('hyperion-payment:valid', { bubbles: true, composed: true, detail: {} })
            : new CustomEvent('hyperion-payment:invalid', { bubbles: true, composed: true, detail: { message: error } }));
    }

    public override render(): unknown {
        const fields = this._fields();
        if (fields.length === 0) return nothing;
        return html`
            <div class="space-y-3" data-payment-form>
                ${fields.map((field) => this._renderField(field))}
            </div>
        `;
    }

    private _renderField(field: PaymentFormField): unknown {
        const value = this._values[field.name] ?? '';
        const error = this._touched.has(field.name) ? this._errorOf(field) : '';
        if (field.type === 'select') {
            return html`<hc-select-input
                label=${field.label}
                name=${field.name}
                .value=${value}
                .options=${field.options.map((option) => ({ value: option.value, label: option.label }))}
                .required=${field.required}
                .error=${error}
                @value-change=${this._onChange}
                @value-blur=${this._onBlur}
            ></hc-select-input>`;
        }
        return html`<hc-text-input
            label=${field.label}
            name=${field.name}
            type=${field.type === 'tel' || field.type === 'date' ? field.type : 'text'}
            .value=${value}
            .required=${field.required}
            .error=${error}
            @value-change=${this._onChange}
            @value-blur=${this._onBlur}
        ></hc-text-input>`;
    }

    private _onChange(e: CustomEvent<{ value: string; name: string }>): void {
        e.stopPropagation();
        this._values = { ...this._values, [e.detail.name]: String(e.detail.value ?? '') };
        this._report();
    }

    private _onBlur(e: CustomEvent<{ name?: string }>): void {
        const name = e.detail?.name ?? (e.target as { name?: string } | null)?.name ?? '';
        if (name === '') return;
        this._touched = new Set([...this._touched, name]);
    }

    /** Show every field's error and move the focus to the first invalid one. */
    public async validate(): Promise<boolean> {
        this._touched = new Set(this._fields().map((field) => field.name));
        this._report();
        await this.updateComplete;
        const invalid = this.querySelector<HTMLElement>('[aria-invalid="true"]');
        invalid?.focus();
        return this._firstError() === null;
    }

    public getPaymentData(): PaymentData {
        const error = this._firstError();
        if (error !== null) throw new Error(error);
        let poNumber: string | undefined;
        const additional: Record<string, string> = {};
        for (const field of this._fields()) {
            const value = (this._values[field.name] ?? '').trim();
            if (field.target === 'po_number') {
                poNumber = value;
            } else if (value !== '') {
                additional[field.name] = value;
            }
        }
        return {
            ...(poNumber !== undefined ? { po_number: poNumber } : {}),
            ...(Object.keys(additional).length > 0 ? { additional_data: additional } : {}),
        };
    }
}

if (!customElements.get('hc-payment-form')) {
    customElements.define('hc-payment-form', PaymentForm);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-form': PaymentForm; }
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The address fields a store declares on top of the built-in ones
 * (`hyperion.addressFields`, `AddressFieldConfig` of the extension API): an
 * Italian fiscal code, an SDI code, a PEC address. A chunk of its own,
 * imported only when the list is not empty (by `store/hydrate.ts` at boot and
 * by `<address-form>`).
 *
 * A field is shown in the forms its `forms` lists, for the countries its
 * `countries` lists (every country when empty), after the built-in fields in
 * `sortOrder`. Its value lives in the address itself: a `custom_attributes`
 * entry (`{ attribute_code, value }`, a checkbox as "1" / "0") or a key of
 * `extension_attributes` (a checkbox as a boolean), the shapes the request
 * payload already forwards.
 *
 * The shipping address doubles as the billing address while "same as
 * shipping" is on (physical quote): it then carries the fields of both
 * forms, and the shipping form shows them.
 *
 * Loading this module installs its check into the one completeness
 * predicate and its renderer into the forms (`declaredFields` of
 * `utils/address-validation.ts`):
 * a required field left empty, a value that does not match its `pattern`
 * (the whole value, as the HTML `pattern` attribute reads it) or one longer
 * than `maxLength` makes the address incomplete.
 */
import { html, nothing } from 'lit';

import type { AddressFieldConfig as DeclaredField } from '../../extension-api.js';
import type { Address, CustomAttribute } from '../types/address.js';
import { peekCheckoutConfig } from '../bootstrap-config.js';
import { billingFollowsShipping } from '../extension/address-override.js';
import { getStore, type Store } from '../store/index.js';
import {
    declaredFields as installed,
    type AddressFormMode,
    type DeclaredFieldsHost,
} from '../utils/address-validation.js';
import { t } from '../utils/i18n.js';
import { fieldId } from './ui/field-id.js';
import { matchesWhole } from '../utils/whole-pattern.js';
import './ui/text-input.js';
import './ui/select-input.js';

const TYPES: ReadonlySet<string> = new Set(['text', 'tel', 'email', 'date', 'select', 'checkbox']);
const CODE = /^[a-z][a-z0-9_]*$/;

let parsedFrom: unknown = null;
let parsed: readonly DeclaredField[] = [];

/** The declared fields of the page, well formed ones only, in `sortOrder`. */
export function declaredFields(): readonly DeclaredField[] {
    const listed = peekCheckoutConfig()?.hyperion?.addressFields;
    if (listed === parsedFrom) return parsed;
    parsedFrom = listed;
    parsed = (Array.isArray(listed) ? listed : [])
        .filter((field): field is DeclaredField =>
            field !== null && typeof field === 'object'
            && typeof field.code === 'string' && CODE.test(field.code)
            && TYPES.has(field.type)
            && (field.target === 'custom_attributes' || field.target === 'extension_attributes')
            && Array.isArray(field.forms))
        .map((field, index) => ({
            field: {
                ...field,
                label: typeof field.label === 'string' && field.label !== '' ? field.label : field.code,
                options: Array.isArray(field.options) ? field.options : [],
                countries: Array.isArray(field.countries) ? field.countries : [],
            },
            index,
        }))
        .sort((a, b) => (Number(a.field.sortOrder) || 0) - (Number(b.field.sortOrder) || 0) || a.index - b.index)
        .map(({ field }) => field);
    return parsed;
}

/** The declared fields shown for `forms` and the country. */
export function fieldsFor(forms: readonly AddressFormMode[], countryId: string | null | undefined): readonly DeclaredField[] {
    const country = countryId ?? '';
    return declaredFields().filter((field) =>
        field.forms.some((form) => forms.includes(form))
        && (field.countries.length === 0 || field.countries.includes(country)));
}

function storeOrNull(): Store | null {
    try {
        return getStore();
    } catch {
        return null;
    }
}

/** The shipping address is also the billing address ("same as shipping" on a physical quote). */
function shippingIsBilling(store: Store | null): boolean {
    return store !== null && !store.isVirtual.get() && billingFollowsShipping(store);
}

/** The forms whose fields the form `mode` shows. Reads signals. */
export function formsOfMode(mode: AddressFormMode): readonly AddressFormMode[] {
    if (mode === 'billing') return ['billing'];
    return shippingIsBilling(storeOrNull()) ? ['shipping', 'billing'] : ['shipping'];
}

/**
 * The forms an address is checked for. A caller that names no form gets the
 * one the address plays in the checkout: the billing address entered on its
 * own is the billing form, every other address the shipping form (with the
 * billing fields while it doubles as the billing address).
 */
function formsOfAddress(addr: Partial<Address>, form: AddressFormMode | undefined): readonly AddressFormMode[] {
    if (form !== undefined) return formsOfMode(form);
    const store = storeOrNull();
    if (store === null) return ['shipping', 'billing'];
    if (addr === store.billingAddress.get() && (store.isVirtual.get() || !billingFollowsShipping(store))) return ['billing'];
    return formsOfMode('shipping');
}

/** The value of a declared field in an address; undefined when it has none. */
export function declaredValue(addr: Partial<Address>, field: DeclaredField): unknown {
    if (field.target === 'extension_attributes') {
        return (addr.extension_attributes as Record<string, unknown> | undefined)?.[field.code];
    }
    return addr.custom_attributes?.find((entry) => entry?.attribute_code === field.code)?.value;
}

/** The address with `value` as the value of the declared field. */
export function withDeclaredValue(addr: Partial<Address>, field: DeclaredField, value: string | boolean): Partial<Address> {
    if (field.target === 'extension_attributes') {
        return { ...addr, extension_attributes: { ...(addr.extension_attributes ?? {}), [field.code]: value } };
    }
    const text = typeof value === 'boolean' ? (value ? '1' : '0') : value;
    const list: CustomAttribute[] = (addr.custom_attributes ?? []).filter((entry) => entry?.attribute_code !== field.code);
    list.push({ attribute_code: field.code, value: text });
    return { ...addr, custom_attributes: list };
}

function isChecked(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function textOf(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(String).join(',');
    return '';
}

export type FieldProblem = 'required' | 'format' | 'length';

/** What is wrong with the value of a declared field; null when nothing. */
export function fieldProblem(field: DeclaredField, value: unknown): FieldProblem | null {
    if (field.type === 'checkbox') return field.required && !isChecked(value) ? 'required' : null;
    const text = textOf(value).trim();
    if (text === '') return field.required ? 'required' : null;
    if (typeof field.maxLength === 'number' && field.maxLength > 0 && text.length > field.maxLength) return 'length';
    if (typeof field.pattern === 'string' && field.pattern !== '' && !matchesWhole(field.pattern, text)) return 'format';
    if (field.type === 'select' && field.options.length > 0 && !field.options.some((option) => option.value === text)) return 'format';
    return null;
}

/** The codes of the declared fields an address still needs. Reads signals. */
export function missingDeclaredFields(addr: Partial<Address>, form: AddressFormMode | undefined): readonly string[] {
    if (declaredFields().length === 0) return [];
    return fieldsFor(formsOfAddress(addr, form), addr.country_id)
        .filter((field) => fieldProblem(field, declaredValue(addr, field)) !== null)
        .map((field) => field.code);
}

function errorText(problem: FieldProblem | null, field: DeclaredField): string {
    if (problem === 'required') return t('Hyperion_Checkout::validation_required');
    if (problem === 'length') return t('Hyperion_Checkout::validation_field_length', { max: String(field.maxLength ?? '') });
    if (problem === 'format') return t('Hyperion_Checkout::validation_field_format');
    return '';
}

function renderCheckbox(host: DeclaredFieldsHost, field: DeclaredField, error: string): unknown {
    const id = fieldId(host.idPrefix, field.code);
    const message = error || field.hint || '';
    const messageId = `${id}-msg`;
    return html`
        <div class="hc-field" data-address-field=${field.code}>
            <label for=${id} class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input id=${id}
                       type="checkbox"
                       name=${field.code}
                       class="h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                       .checked=${isChecked(declaredValue(host.address, field))}
                       aria-required=${field.required ? 'true' : 'false'}
                       aria-invalid=${error ? 'true' : 'false'}
                       aria-describedby=${message ? messageId : nothing}
                       @change=${(e: Event): void => {
                           host.touch(field.code);
                           host.change(withDeclaredValue(host.address, field, (e.target as HTMLInputElement).checked));
                       }} />
                <span class="text-sm text-brand">
                    ${field.label}
                    ${field.required ? html`<span aria-hidden="true" class="text-danger">*</span>` : nothing}
                </span>
            </label>
            <p id=${messageId} class="hc-field-message ${error ? 'text-danger' : 'text-muted'}">${message}</p>
        </div>
    `;
}

function renderField(host: DeclaredFieldsHost, field: DeclaredField): unknown {
    const problem = host.isTouched(field.code) ? fieldProblem(field, declaredValue(host.address, field)) : null;
    const error = errorText(problem, field);
    if (field.type === 'checkbox') return renderCheckbox(host, field, error);
    const onChange = (e: CustomEvent<{ value: string }>): void => {
        if (field.type === 'select') host.touch(field.code);
        host.change(withDeclaredValue(host.address, field, e.detail.value));
    };
    const onBlur = (): void => host.touch(field.code);
    const value = textOf(declaredValue(host.address, field));
    if (field.type === 'select') {
        return html`
            <hc-select-input
                data-address-field=${field.code}
                label=${field.label}
                name=${field.code}
                id-prefix=${host.idPrefix}
                autocomplete=${field.autocomplete ?? ''}
                placeholder=${t('Hyperion_Checkout::name_option_placeholder')}
                .options=${field.options.map((option) => ({ value: option.value, label: option.label }))}
                .value=${value}
                .required=${field.required}
                .error=${error}
                @value-change=${onChange}
                @value-blur=${onBlur}
            ></hc-select-input>
        `;
    }
    return html`
        <hc-text-input
            data-address-field=${field.code}
            label=${field.label}
            name=${field.code}
            type=${field.type}
            id-prefix=${host.idPrefix}
            autocomplete=${field.autocomplete ?? ''}
            inputmode=${field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : ''}
            .noSpellcheck=${true}
            .value=${value}
            .required=${field.required}
            .error=${error}
            .hint=${field.hint ?? ''}
            @value-change=${onChange}
            @value-blur=${onBlur}
        ></hc-text-input>
    `;
}

/** The declared fields of the form, for its mode and the selected country. Reads signals. */
export function renderDeclaredFields(host: DeclaredFieldsHost): unknown {
    const fields = fieldsFor(formsOfMode(host.mode), host.address.country_id);
    if (fields.length === 0) return nothing;
    return fields.map((field) => renderField(host, field));
}

installed.set({ missing: missingDeclaredFields, render: renderDeclaredFields });

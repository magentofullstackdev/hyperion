// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <address-form> -- country/region/postcode-aware address editor.
 *
 * Reads `checkoutConfig.directoryData` and `checkoutConfig.countryData`
 * to decide whether the region field is a <select> (populated list) or
 * a free-text input. Postcode required unless the country is in
 * `optionalZipCountries`. Street line count from
 * `customer/address/street_lines` (default 2). Visibility flags for
 * company/telephone/fax/vat follow the `no`/`opt`/`req` admin config;
 * name prefix / middle name / suffix come from
 * `checkoutConfig.hyperion.nameFields` (select when an option list is
 * configured, text input otherwise).
 *
 * Emits:
 *   - 'address-change' with the current `Address` (snapshot) whenever
 *     a field edits.
 *   - 'address-valid' with a boolean indicating whether every visible
 *     required field passes the local validators.
 *
 * Errors show on touched fields only, or on every field once the Place
 * Order button asked for a validation (`validationRequests`, bumped after
 * this form mounted) because the shopper pressed it too early. A postcode
 * that matches none of the country's patterns is a warning under the same
 * reveal rule (`_warningFor()`): the field stays valid, the address stays
 * complete and the value travels as typed, like core's Knockout checkout.
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import type { Address } from '../types/address.js';
import type { NameFieldConfig } from '../types/config.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { validationRequests } from '../store/validation-request.js';
import { t } from '../utils/i18n.js';
import { readNameFieldsConfig, type NameFieldKey } from '../utils/name-fields.js';
import {
    isAddressComplete,
    isPostcodeRequired,
    postcodeWarning,
    readAddressFieldConfig,
} from '../utils/address-validation.js';
import './ui/text-input.js';
import './ui/select-input.js';
import './ui/checkbox.js';

const readAddressConfig = readAddressFieldConfig;

interface DirectoryCountry {
    id: string;
    name: string;
    is_region_required: boolean;
    is_region_visible: boolean;
}

function readCountries(): readonly DirectoryCountry[] {
    const cfg = getCheckoutConfig() as unknown as Record<string, unknown>;
    // Hyperion's ConfigProvider populates `directoryData` (server-side,
    // synchronously). The legacy `countryData` key was an internal
    // misnaming kept here as a fallback in case the merchant runs
    // alongside an extension that still feeds it.
    const raw = cfg['directoryData'] ?? cfg['countryData'];
    if (!raw || typeof raw !== 'object') return [];
    const out: DirectoryCountry[] = [];
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const name = typeof v['name'] === 'string' ? v['name'] : id;
        out.push({
            id,
            name,
            is_region_required: v['is_region_required'] === true,
            is_region_visible: v['is_region_visible'] !== false,
        });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
}

interface DirectoryRegion {
    id: string;
    code: string;
    name: string;
}

function readRegions(countryId: string): readonly DirectoryRegion[] {
    const cfg = getCheckoutConfig() as unknown as Record<string, unknown>;
    const dir = cfg['directoryData'];
    if (!dir || typeof dir !== 'object') return [];
    const entry = (dir as Record<string, unknown>)[countryId];
    if (!entry || typeof entry !== 'object') return [];
    const obj = entry as Record<string, unknown>;
    const source =
        obj['regions'] && typeof obj['regions'] === 'object'
            ? (obj['regions'] as Record<string, unknown>)
            : obj;
    const out: DirectoryRegion[] = [];
    for (const [id, value] of Object.entries(source)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const name = typeof v['name'] === 'string' ? v['name'] : null;
        const code = typeof v['code'] === 'string' ? v['code'] : '';
        if (!name) continue;
        out.push({ id, code, name });
    }
    return out;
}

export class AddressForm extends SignalWatcher(LitElement) {
    @property({ type: String }) public mode: 'shipping' | 'billing' = 'shipping';
    @property({ type: Object }) public value: Address | null = null;
    @property({ type: Boolean }) public showSaveInAddressBook = false;
    @property({ type: Object }) public serverErrors: Readonly<Record<string, string>> = {};

    @state() private accessor _local: Partial<Address> = {};
    @state() private accessor _touched: Readonly<Record<string, boolean>> = {};
    /** Every field counts as touched once a validation was requested after mount. */
    @state() private accessor _revealAll = false;

    private _validationBaseline = 0;

    public override createRenderRoot(): HTMLElement { return this; }

    public override willUpdate(changed: Map<string, unknown>): void {
        if (changed.has('value') && this.value) {
            this._local = { ...this.value };
        }
        if (changed.has('value') || changed.has('showSaveInAddressBook')) {
            this._initSaveInAddressBook();
        }
        if (!this._revealAll && validationRequests.get() > this._validationBaseline) {
            this._revealAll = true;
        }
    }

    /**
     * Lit sets `value` before the element is connected (the template commits
     * its property parts, then inserts the fragment), and the first
     * `willUpdate()` only runs on the microtask after this callback. The
     * local copy is therefore seeded here from `value` BEFORE the default
     * country is considered: without it, a form mounted with a complete
     * (hydrated) address emitted `{ country_id, save_in_address_book }`
     * alone, the parent wrote that into the store and the shipping
     * information was never re-saved after a reload.
     *
     * The emit happens only when the copy differs from `value` (the default
     * country or the address book flag was added), so the emitted address is
     * always `value` plus defaults, never less. A hydrated address carries
     * the flag already (`store/hydrate.ts`) and emits nothing: an emit of an
     * unchanged address would re-run the estimate the boot started.
     */
    public override connectedCallback(): void {
        super.connectedCallback();
        this._validationBaseline = validationRequests.get();
        if (this.value && Object.keys(this._local).length === 0) {
            this._local = { ...this.value };
        }
        let changed = false;
        if (!this._local.country_id) {
            const defaultCountry = getCheckoutConfig().defaultCountryId;
            this._local = { ...this._local, country_id: defaultCountry };
            changed = true;
        }
        if (this._initSaveInAddressBook()) changed = true;
        if (changed) this._emit();
    }

    /**
     * A new address of a logged-in customer is saved to the address book
     * unless the shopper unticks the box; a guest's or a saved address never
     * is. The flag is set explicitly so the checkbox and the payload
     * (`save_in_address_book` 1 / 0) always say the same thing.
     */
    private _initSaveInAddressBook(): boolean {
        if (typeof this._local.save_in_address_book === 'boolean') return false;
        const isSaved = this._local.id != null && this._local.id !== '';
        this._local = { ...this._local, save_in_address_book: this.showSaveInAddressBook && !isSaved };
        return true;
    }

    public override render(): unknown {
        const cfg = readAddressConfig();
        const countries = readCountries();
        const selectedCountry = (this._local.country_id as string) ?? '';
        const regions = selectedCountry ? readRegions(selectedCountry) : [];
        const country = countries.find((c) => c.id === selectedCountry);
        const postcodeRequired = isPostcodeRequired(selectedCountry, cfg);
        const regionIsList = regions.length > 0;
        const regionRequired = country?.is_region_required === true || regionIsList;
        const regionVisible = country?.is_region_visible !== false;

        const street = (this._local.street ?? []) as string[];
        const streetLines: string[] = [];
        for (let i = 0; i < cfg.streetLines; i++) streetLines.push(street[i] ?? '');

        const nameFields = readNameFieldsConfig();

        return html`
            <div class="space-y-3">
                ${this._renderNameField('prefix', nameFields.prefix, 'honorific-prefix')}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <hc-text-input
                        label=${t('Hyperion_Checkout::firstname_label')}
                        name="firstname"
                        autocomplete="given-name"
                        .value=${(this._local.firstname as string) ?? ''}
                        .required=${true}
                        .error=${this._errorFor('firstname', true)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-text-input
                        label=${t('Hyperion_Checkout::lastname_label')}
                        name="lastname"
                        autocomplete="family-name"
                        .value=${(this._local.lastname as string) ?? ''}
                        .required=${true}
                        .error=${this._errorFor('lastname', true)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                </div>
                ${this._renderNameField('middlename', nameFields.middlename, 'additional-name')}
                ${this._renderNameField('suffix', nameFields.suffix, 'honorific-suffix')}

                ${cfg.showCompany !== 'no'
                    ? html`
                          <hc-text-input
                              label=${t('Hyperion_Checkout::company_label')}
                              name="company"
                              autocomplete="organization"
                              .value=${(this._local.company as string) ?? ''}
                              .required=${cfg.showCompany === 'req'}
                              .error=${this._errorFor('company', cfg.showCompany === 'req')}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `
                    : nothing}

                ${streetLines.map(
                    (line, idx) => html`
                        <hc-text-input
                            label=${idx === 0
                                ? t('Hyperion_Checkout::street_label_primary')
                                : t('Hyperion_Checkout::street_label_additional', { n: String(idx + 1) })}
                            name=${`street_${idx}`}
                            autocomplete=${idx === 0 ? 'address-line1' : `address-line${idx + 1}`}
                            .value=${line}
                            .required=${idx === 0}
                            .error=${idx === 0 ? this._errorFor('street') : ''}
                            @value-change=${this._onStreetChange}
                            @value-blur=${this._onBlur}
                            data-index=${idx}
                        ></hc-text-input>
                    `
                )}

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <hc-text-input
                        label=${t('Hyperion_Checkout::city_label')}
                        name="city"
                        autocomplete="address-level2"
                        .value=${(this._local.city as string) ?? ''}
                        .required=${true}
                        .error=${this._errorFor('city', true)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    ${regionVisible
                        ? regionIsList
                            ? html`
                                  <hc-select-input
                                      label=${t('Hyperion_Checkout::region_label')}
                                      name="region_id"
                                      placeholder=${t('Hyperion_Checkout::region_placeholder')}
                                      .options=${regions.map((r) => ({ value: r.id, label: r.name }))}
                                      .value=${(this._local.region_id as string) ?? ''}
                                      .required=${regionRequired}
                                      .error=${this._errorFor('region_id', regionRequired)}
                                      @value-change=${this._onRegionSelectChange}
                                  ></hc-select-input>
                              `
                            : html`
                                  <hc-text-input
                                      label=${t('Hyperion_Checkout::region_label')}
                                      name="region"
                                      autocomplete="address-level1"
                                      .value=${(this._local.region as unknown as string) ?? ''}
                                      .required=${regionRequired}
                                      .error=${this._errorFor('region', regionRequired)}
                                      @value-change=${this._onFieldChange}
                                      @value-blur=${this._onBlur}
                                  ></hc-text-input>
                              `
                        : nothing}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <hc-text-input
                        label=${t('Hyperion_Checkout::postcode_label')}
                        name="postcode"
                        autocomplete="postal-code"
                        .value=${(this._local.postcode as string) ?? ''}
                        .required=${postcodeRequired}
                        .error=${this._errorFor('postcode', postcodeRequired)}
                        .warning=${this._warningFor('postcode')}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-select-input
                        label=${t('Hyperion_Checkout::country_label')}
                        name="country_id"
                        .options=${countries.map((c) => ({ value: c.id, label: c.name }))}
                        .value=${selectedCountry}
                        .required=${true}
                        .error=${this._errorFor('country_id', true)}
                        @value-change=${this._onCountryChange}
                    ></hc-select-input>
                </div>

                ${cfg.showTelephone !== 'no'
                    ? html`
                          <hc-text-input
                              label=${t('Hyperion_Checkout::telephone_label')}
                              name="telephone"
                              type="tel"
                              autocomplete="tel"
                              .value=${(this._local.telephone as string) ?? ''}
                              .required=${cfg.showTelephone === 'req'}
                              .error=${this._errorFor('telephone', cfg.showTelephone === 'req')}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `
                    : nothing}

                ${cfg.showFax !== 'no'
                    ? html`
                          <hc-text-input
                              label=${t('Hyperion_Checkout::fax_label')}
                              name="fax"
                              .value=${(this._local.fax as string) ?? ''}
                              .required=${cfg.showFax === 'req'}
                              @value-change=${this._onFieldChange}
                          ></hc-text-input>
                      `
                    : nothing}

                ${cfg.showVat
                    ? html`
                          <hc-text-input
                              label=${t('Hyperion_Checkout::vat_label')}
                              name="vat_id"
                              .value=${(this._local.vat_id as string) ?? ''}
                              @value-change=${this._onFieldChange}
                          ></hc-text-input>
                      `
                    : nothing}

                ${this.showSaveInAddressBook
                    ? html`
                          <hc-checkbox
                              name="save_in_address_book"
                              label=${t('Hyperion_Checkout::save_in_address_book')}
                              .checked=${this._local.save_in_address_book === true}
                              @value-change=${this._onSaveToggle}
                          ></hc-checkbox>
                      `
                    : nothing}
            </div>
        `;
    }

    /**
     * Prefix / middle name / suffix: a <select> when the admin configured
     * an option list, a text input otherwise, nothing when hidden.
     */
    private _renderNameField(key: NameFieldKey, cfg: NameFieldConfig, autocomplete: string): unknown {
        if (cfg.show === 'no') return nothing;
        const required = cfg.show === 'req';
        const label = t(`Hyperion_Checkout::${key}_label`);
        const value = (this._local[key] as string) ?? '';
        const options = cfg.options ?? [];
        if (options.length > 0) {
            // A stored value outside the configured list (config changed
            // after the address was saved) stays selectable.
            const list = options.includes(value) || value === '' ? options : [value, ...options];
            return html`
                <div class="md:max-w-xs">
                    <hc-select-input
                        label=${label}
                        name=${key}
                        placeholder=${t('Hyperion_Checkout::name_option_placeholder')}
                        .options=${list.map((o) => ({ value: o, label: o }))}
                        .value=${value}
                        .required=${required}
                        .error=${this._errorFor(key, required)}
                        @value-change=${this._onNameSelectChange}
                    ></hc-select-input>
                </div>
            `;
        }
        return html`
            <div class=${key === 'middlename' ? '' : 'md:max-w-xs'}>
                <hc-text-input
                    label=${label}
                    name=${key}
                    autocomplete=${autocomplete}
                    .value=${value}
                    .required=${required}
                    .error=${this._errorFor(key, required)}
                    @value-change=${this._onFieldChange}
                    @value-blur=${this._onBlur}
                ></hc-text-input>
            </div>
        `;
    }

    private _onNameSelectChange(e: CustomEvent<{ value: string; name: string }>): void {
        this._touched = { ...this._touched, [e.detail.name]: true };
        this._onFieldChange(e);
    }

    private _errorFor(field: string, required = false): string {
        const serverErr = this.serverErrors[field];
        if (serverErr) return serverErr;
        const touched = this._revealAll || this._touched[field] === true;
        if (!touched) return '';
        if (field === 'street') {
            const street = (this._local.street as string[]) ?? [];
            if (!street[0] || street[0].trim().length === 0) {
                return t('Hyperion_Checkout::validation_required');
            }
            return '';
        }
        if (!required) return '';
        const val = (this._local as Record<string, unknown>)[field];
        if (val === null || val === undefined) {
            return t('Hyperion_Checkout::validation_required');
        }
        if (typeof val === 'string' && val.trim().length === 0) {
            return t('Hyperion_Checkout::validation_required');
        }
        return '';
    }

    /**
     * The non-blocking hint of a field, under the same reveal rule as the
     * errors and never beside one: today only the postcode format.
     */
    private _warningFor(field: string): string {
        if (field !== 'postcode') return '';
        if (this.serverErrors[field]) return '';
        const touched = this._revealAll || this._touched[field] === true;
        if (!touched) return '';
        const warning = postcodeWarning(
            this._local.postcode,
            (this._local.country_id as string) ?? '',
            readAddressConfig()
        );
        if (warning === null) return '';
        return t('Hyperion_Checkout::validation_postcode', { example: warning.examples.join(', ') });
    }

    private _onFieldChange(e: CustomEvent<{ value: string; name: string }>): void {
        this._local = { ...this._local, [e.detail.name]: e.detail.value };
        this._emit();
    }

    private _onStreetChange(e: CustomEvent<{ value: string; name: string }>): void {
        const target = e.target as HTMLElement;
        const idxAttr = target.getAttribute('data-index');
        const idx = idxAttr ? Number(idxAttr) : 0;
        const street = [...((this._local.street as string[]) ?? [])];
        while (street.length < idx + 1) street.push('');
        street[idx] = e.detail.value;
        this._local = { ...this._local, street };
        this._emit();
    }

    private _onCountryChange(e: CustomEvent<{ value: string }>): void {
        this._local = {
            ...this._local,
            country_id: e.detail.value,
            region_id: null,
            region: null,
        };
        this._emit();
    }

    private _onRegionSelectChange(e: CustomEvent<{ value: string }>): void {
        const regions = readRegions((this._local.country_id as string) ?? '');
        const match = regions.find((r) => r.id === e.detail.value);
        this._local = {
            ...this._local,
            region_id: e.detail.value,
            region: match ? { region: match.name, region_code: match.code, region_id: Number(match.id) } : null,
        };
        this._emit();
    }

    private _onBlur(e: CustomEvent<{ name: string }>): void {
        this._touched = { ...this._touched, [e.detail.name]: true };
    }

    private _onSaveToggle(e: CustomEvent<{ checked: boolean }>): void {
        this._local = { ...this._local, save_in_address_book: e.detail.checked };
        this._emit();
    }

    private _emit(): void {
        this.dispatchEvent(new CustomEvent('address-change', {
            detail: this._local as Address,
            bubbles: true,
            composed: true,
        }));
        this.dispatchEvent(new CustomEvent('address-valid', {
            detail: this._isComplete(),
            bubbles: true,
            composed: true,
        }));
    }

    private _isComplete(): boolean {
        return isAddressComplete(this._local, readAddressConfig());
    }
}

if (!customElements.get('address-form')) {
    customElements.define('address-form', AddressForm);
}

declare global {
    interface HTMLElementTagNameMap { 'address-form': AddressForm; }
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-region-select -- country-aware State/Province control.
 *
 * Replaces Magento's RequireJS `directoryRegionUpdater` widget on the
 * address forms (registration, address book). It wraps server-rendered
 * light-DOM controls, so the form also works without JavaScript: the
 * server accepts both `region_id` and `region`.
 *
 *   <hyperion-region-select regions='{"US":{"12":{"code":"CA","name":"California"}}}'
 *                           required-countries='["US","CA"]'
 *                           optional-zip-countries='["IE"]'
 *                           region-id="12" region="" optional-allowed>
 *       <select name="country_id" data-country-select>...</select>
 *       <div data-region-field>
 *           <label data-region-label for="region_id">State/Province</label>
 *           <select name="region_id" id="region_id" data-region-select>...</select>
 *           <input type="text" name="region" id="region" data-region-input hidden>
 *       </div>
 *       <input type="text" name="postcode" data-postcode-input>
 *   </hyperion-region-select>
 *
 * Attributes:
 *   regions                JSON map `{countryId: {regionId: {code, name}}}`
 *                          (Magento\Directory\Helper\Data::getRegionJson()).
 *                          When absent, a `<script type="application/json"
 *                          data-regions>` child is read instead.
 *   required-countries     JSON array of country ids whose region is
 *                          mandatory (`general/region/state_required`).
 *   optional-zip-countries JSON array of country ids whose postcode is
 *                          optional (`general/country/optional_zip_countries`).
 *   region-id              region id to restore (saved address, failed submit).
 *   region                 free-text region to restore for a country
 *                          without regions.
 *   optional-allowed       keep the region select for a country that has
 *                          regions but does not require one
 *                          (`general/region/display_all`); without it the
 *                          whole `[data-region-field]` is hidden for those.
 *   placeholder            text of the empty option of the select.
 *
 * On every country change the select is rebuilt from the map (sorted by
 * name) and only the active control keeps its `name` and `required`, so
 * the POST carries either `region_id` or `region`, never a stale pair.
 * `hyperion-region-change` bubbles with `{ countryId, hasRegions, required }`.
 */

import { nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';

const DEFAULT_PLACEHOLDER = 'Please select a region, state or province.';

function parseJson(text, fallback) {
    if (!text) return fallback;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_e) {
        return fallback;
    }
}

export class HyperionRegionSelect extends HyperionLightElement {
    static properties = {
        regions: { type: String },
        requiredCountries: { type: String, attribute: 'required-countries' },
        optionalZipCountries: { type: String, attribute: 'optional-zip-countries' },
        regionId: { type: String, attribute: 'region-id' },
        region: { type: String },
        optionalAllowed: { type: Boolean, attribute: 'optional-allowed' },
        placeholder: { type: String },
    };

    constructor() {
        super();
        this.regions = '';
        this.requiredCountries = '';
        this.optionalZipCountries = '';
        this.regionId = '';
        this.region = '';
        this.optionalAllowed = false;
        this.placeholder = '';
        this._country = null;
        this._select = null;
        this._input = null;
        this._onCountryChange = this._onCountryChange.bind(this);
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this._country = this.querySelector('[data-country-select], select[name="country_id"]');
        this._select = this.querySelector('[data-region-select]');
        this._input = this.querySelector('[data-region-input]');
        if (!this._country || !this._select || !this._input) return;
        this._country.addEventListener('change', this._onCountryChange);
        this._sync(true);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._country?.removeEventListener('change', this._onCountryChange);
    }

    // --- Data --------------------------------------------------------------

    _regionMap() {
        const script = this.querySelector('script[type="application/json"][data-regions]');
        return parseJson(this.regions || script?.textContent, {});
    }

    _countryList(json) {
        const list = parseJson(json, []);
        return Array.isArray(list) ? list.map(String) : [];
    }

    /** Regions of a country as `[{ id, name }]`, sorted by name. */
    _regionsFor(countryId) {
        const entry = this._regionMap()[countryId];
        if (!entry || typeof entry !== 'object') return [];
        const rows = Array.isArray(entry)
            ? entry.map((row) => ({ id: String(row.id ?? ''), name: String(row.name ?? '') }))
            : Object.entries(entry).map(([id, row]) => ({
                id: String(id),
                name: String(typeof row === 'object' && row !== null ? (row.name ?? '') : row),
            }));
        return rows
            .filter((row) => row.id !== '' && row.name !== '')
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    // --- Sync --------------------------------------------------------------

    _onCountryChange() {
        this._sync(false);
    }

    _sync(initial) {
        const countryId = String(this._country.value ?? '');
        const regions = this._regionsFor(countryId);
        const required = this._countryList(this.requiredCountries).includes(countryId);
        const field = this.querySelector('[data-region-field]');
        const label = this.querySelector('[data-region-label]');

        if (regions.length) {
            const hidden = !required && !this.optionalAllowed;
            this._rebuildSelect(regions, initial ? this.regionId : this._select.value);
            this._activate(this._select, 'region_id', required && !hidden);
            this._deactivate(this._input);
            if (field) field.hidden = hidden;
            if (label) label.htmlFor = this._select.id || label.htmlFor;
        } else {
            if (initial && this.region && !this._input.value) {
                this._input.value = this.region;
            }
            this._activate(this._input, 'region', required);
            this._deactivate(this._select);
            if (field) field.hidden = false;
            if (label) label.htmlFor = this._input.id || label.htmlFor;
        }

        const postcode = this.querySelector('[data-postcode-input]');
        if (postcode) {
            postcode.required = !this._countryList(this.optionalZipCountries).includes(countryId);
        }

        this.dispatchEvent(new CustomEvent('hyperion-region-change', {
            bubbles: true,
            detail: { countryId, hasRegions: regions.length > 0, required },
        }));
    }

    _rebuildSelect(regions, selectedId) {
        const select = this._select;
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = this.placeholder || DEFAULT_PLACEHOLDER;
        select.appendChild(placeholder);
        const wanted = String(selectedId ?? '');
        for (const region of regions) {
            const option = document.createElement('option');
            option.value = region.id;
            option.textContent = region.name;
            option.defaultSelected = region.id === wanted;
            select.appendChild(option);
        }
        select.value = regions.some((region) => region.id === wanted) ? wanted : '';
    }

    _activate(control, name, required) {
        control.name = name;
        control.required = required;
        control.hidden = false;
        control.removeAttribute('aria-hidden');
    }

    _deactivate(control) {
        control.name = '';
        control.required = false;
        control.hidden = true;
        control.setAttribute('aria-hidden', 'true');
    }
}

if (!customElements.get('hyperion-region-select')) {
    customElements.define('hyperion-region-select', HyperionRegionSelect);
}

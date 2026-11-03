// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Name prefix / middle name / suffix helpers shared by the address form,
 * the saved-address card and the address validity selectors.
 *
 * The settings come from `checkoutConfig.hyperion.nameFields`; an absent
 * section (older config payload, or a store created before bootstrap)
 * hides all three fields, which is also core's default configuration.
 */
import type { Address } from '../types/address.js';
import type { FieldVisibility, NameFieldConfig, NameFieldsConfig } from '../types/config.js';
import { peekCheckoutConfig } from '../bootstrap-config.js';

export type NameFieldKey = 'prefix' | 'middlename' | 'suffix';

export const NAME_FIELD_KEYS: readonly NameFieldKey[] = ['prefix', 'middlename', 'suffix'];

const HIDDEN: NameFieldConfig = { show: 'no', options: [] };

function normaliseField(raw: unknown): NameFieldConfig {
    if (!raw || typeof raw !== 'object') return HIDDEN;
    const value = raw as Record<string, unknown>;
    const show: FieldVisibility =
        value['show'] === 'opt' || value['show'] === 'req' ? value['show'] : 'no';
    const options = Array.isArray(value['options'])
        ? (value['options'] as unknown[]).filter((o): o is string => typeof o === 'string' && o.trim() !== '')
        : [];
    return { show, options };
}

export function readNameFieldsConfig(): NameFieldsConfig {
    const cfg = peekCheckoutConfig() as unknown as { hyperion?: { nameFields?: unknown } } | null;
    const raw = cfg?.hyperion?.nameFields;
    const section = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
        prefix: normaliseField(section['prefix']),
        middlename: normaliseField(section['middlename']),
        suffix: normaliseField(section['suffix']),
    };
}

/**
 * Keys of the name fields that are required by configuration and empty
 * on the address.
 */
export function missingRequiredNameFields(
    addr: Partial<Address> | null,
    cfg: NameFieldsConfig = readNameFieldsConfig()
): NameFieldKey[] {
    const missing: NameFieldKey[] = [];
    for (const key of NAME_FIELD_KEYS) {
        if (cfg[key].show !== 'req') continue;
        const value = addr?.[key];
        if (typeof value !== 'string' || value.trim() === '') missing.push(key);
    }
    return missing;
}

/**
 * Whether an address satisfies the required name fields. A saved address
 * (it carries an `id`) is accepted as is: the address book form enforced
 * the configuration when it was saved, and the checkout offers no way to
 * edit it, so requiring a prefix that a stored address lacks would only
 * lock the shopper out of Place Order.
 */
export function hasRequiredNameFields(
    addr: Partial<Address> | null,
    cfg: NameFieldsConfig = readNameFieldsConfig()
): boolean {
    if (addr?.id != null && addr.id !== '') return true;
    return missingRequiredNameFields(addr, cfg).length === 0;
}

/** `prefix firstname middlename lastname suffix`, skipping empty parts. */
export function formatFullName(addr: Partial<Address>): string {
    return [addr.prefix, addr.firstname, addr.middlename, addr.lastname, addr.suffix]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter((part) => part !== '')
        .join(' ');
}

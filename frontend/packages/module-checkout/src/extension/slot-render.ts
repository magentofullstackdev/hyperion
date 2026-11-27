// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The elements of a slot outlet: one element per registration, created
 * once its tag is defined and its class declares a supported API version,
 * with `context`, `options` and `slot` assigned before it is connected.
 * The element of a registration is kept while the registration stands and
 * removed with it; the order follows `sortOrder`. A tag that is never
 * defined, a version mismatch or a throwing property assignment leaves the
 * registration without an element (logged once by the loader or here).
 */
import { createCheckoutContext } from './context.js';
import { awaitExtensionElement, isAllowedExtensionTag } from './loader.js';
import type { SlotRegistration } from './slots.js';

const created = new WeakMap<HTMLElement, Map<number, HTMLElement | null>>();

async function elementFor(registration: SlotRegistration): Promise<HTMLElement | null> {
    if (!isAllowedExtensionTag(registration.tag, registration.internal)) {
        console.error(`[hyperion-checkout] "${registration.owner}" registered a slot tag it may not use: ${registration.tag}`);
        return null;
    }
    const loaded = await awaitExtensionElement({
        id: registration.owner,
        tag: registration.tag,
        moduleUrl: null,
        builtin: null,
    });
    if (loaded.state !== 'ready') return null;
    try {
        const el = document.createElement(registration.tag) as HTMLElement & Record<string, unknown>;
        el.context = createCheckoutContext({ phrases: registration.phrases });
        el.options = Object.freeze({ ...registration.options });
        el.slot = registration.slot;
        return el;
    } catch (err) {
        console.error(`[hyperion-checkout] the slot element ${registration.tag} of "${registration.owner}" could not be created`, err);
        return null;
    }
}

/** The slot elements on the page, in document order. */
export function activeSlotElements(): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const outlet of document.querySelectorAll<HTMLElement>('hc-slot-outlet')) {
        const own = new Set(created.get(outlet)?.values() ?? []);
        for (const child of outlet.children) {
            if (own.has(child as HTMLElement)) out.push(child as HTMLElement);
        }
    }
    return out;
}

/** Bring the children of `outlet` in line with `entries`. */
export async function renderSlotElements(outlet: HTMLElement, entries: readonly SlotRegistration[]): Promise<void> {
    let byKey = created.get(outlet);
    if (byKey === undefined) {
        byKey = new Map();
        created.set(outlet, byKey);
    }
    const keys = new Set(entries.map((entry) => entry.key));
    for (const [key, el] of [...byKey]) {
        if (!keys.has(key)) {
            el?.remove();
            byKey.delete(key);
        }
    }
    const pending = entries.filter((entry) => !byKey.has(entry.key));
    for (const entry of pending) byKey.set(entry.key, null);
    await Promise.all(pending.map(async (entry) => {
        const el = await elementFor(entry);
        if (byKey.has(entry.key)) byKey.set(entry.key, el);
    }));
    // In order, moving only what is out of place (a move reconnects an
    // element); a registration removed meanwhile has no entry any more.
    let position = 0;
    for (const entry of entries) {
        const el = byKey.get(entry.key) ?? null;
        if (el === null) continue;
        try {
            const current = outlet.children[position] ?? null;
            if (current !== el) outlet.insertBefore(el, current);
            position += 1;
        } catch (err) {
            console.error(`[hyperion-checkout] the slot element ${entry.tag} of "${entry.owner}" failed when connected`, err);
            byKey.set(entry.key, null);
        }
    }
}

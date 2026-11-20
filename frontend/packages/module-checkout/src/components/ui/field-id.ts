// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Ids of the form controls. A control's id is `<prefix>-<name>`: a form
 * that can be on the page twice (the shipping and the billing address)
 * gives its fields its own prefix, every other control takes one from the
 * counter below, once per element, so two fields with the same name never
 * share an id and an id never changes between renders.
 */
let counter = 0;

export function nextFieldIdPrefix(): string {
    counter += 1;
    return `hc-f${counter}`;
}

export function fieldId(prefix: string, name: string): string {
    return name === '' ? prefix : `${prefix}-${name}`;
}

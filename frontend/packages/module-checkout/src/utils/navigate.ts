// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The one place the checkout leaves the page from, so tests can watch it.
 */
export function navigateTo(url: string): void {
    window.location.assign(url);
}

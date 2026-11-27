// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The overlay of an order on its way and the dialog of an ended session
 * (`loading-overlay.ts`, which imports `session-expired-dialog.ts`) are a
 * chunk the first frame does not wait for: both draw nothing until then,
 * and either one shows the current state whenever its definition arrives.
 *
 * A failed load is tried once more at once, and again whenever an order
 * starts or the session ends while the chunk is still missing. The dialog
 * is the only way on from an ended session: when it still cannot be
 * loaded then, the shopper is sent to the sign in page the dialog links
 * to, where what was entered is put back after the sign in.
 *
 * This module belongs to the application chunk, so the import below does
 * not split the code the overlay shares with the application.
 */
import { watchValue } from '../extension/watch.js';
import { getStore } from '../store/index.js';
import { loginUrl } from '../utils/login-url.js';
import { navigateTo } from '../utils/navigate.js';

let importOverlays = (): Promise<unknown> => import('./loading-overlay.js');
let pending: Promise<unknown> | null = null;

function load(): Promise<unknown> {
    pending ??= importOverlays().catch((err: unknown) => {
        pending = null;
        console.error('[hyperion-checkout] the order overlay could not be loaded', err);
        throw err;
    });
    return pending;
}

/** Start loading the overlays; called before the mount, which does not wait for them. */
export function loadOrderOverlays(): void {
    void load().catch(load).catch(() => undefined);
    let store: ReturnType<typeof getStore>;
    try {
        store = getStore();
    } catch {
        return;
    }
    watchValue(() => store.sessionExpired.get() || store.isPlacingOrder.get(), (needed) => {
        if (!needed || customElements.get('hc-session-expired')) return;
        load().catch(() => {
            if (store.sessionExpired.get()) navigateTo(loginUrl());
        });
    });
}

export function setOverlayImporterForTests(importer: (() => Promise<unknown>) | null): void {
    importOverlays = importer ?? ((): Promise<unknown> => import('./loading-overlay.js'));
    pending = null;
}

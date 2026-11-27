// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The part of the extension runtime that runs at every boot, kept small:
 * after the mount it starts the checkout events and, only when
 * `hyperion.extensions` lists an entry, imports the generic runtime
 * (`runtime.ts`). A checkout without extensions requests no extension chunk. The
 * runtime is imported through the application chunk (`loadRuntime`), so the
 * code it shares with the application stays in that chunk.
 */
import type { CheckoutConfig } from '../types/config.js';
import type { Store } from '../store/index.js';
import { t } from '../utils/i18n.js';
import { emitCheckoutEvent, startCheckoutEvents } from './events.js';
import { registerCheckoutGate, setExtensionsPending } from './gates.js';
import { EXTENSION_API } from './version.js';

/**
 * How long the order may wait for the modules of the generic pool: the
 * idle wait, the import and the default export of a module are bounded
 * each (2 s, 8 s, 8 s); the runtime chunk on top.
 */
export const EXTENSIONS_START_LIMIT_MS = 20000;

/**
 * After the mount: the change events, the modules of the generic pool
 * (the order waits for them), and `ready` once the first render is done
 * and the first requests settled (`whenSettled`).
 */
export function startExtensions(
    config: CheckoutConfig,
    store: Store,
    whenSettled: () => Promise<unknown>,
    loadRuntime: () => Promise<typeof import('./runtime.js')>
): void {
    startCheckoutEvents(store);
    const entries = config.hyperion.extensions ?? [];
    if (entries.length > 0) {
        const required = entries.some((entry) => entry.required === true);
        const failed = (): void => {
            if (required) registerCheckoutGate('required-extensions').set(t('Hyperion_Checkout::extension_required_failed'));
        };
        const started = loadRuntime().then(
            (runtime) => runtime.startExtensions(entries),
            (err: unknown) => {
                console.error('[hyperion-checkout] the checkout extensions could not be started', err);
                failed();
            }
        );
        // The order waits for the modules, never longer than this: past it a
        // required module that is still on its way closes the gate until it
        // is there, an optional one is left out.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const limit = new Promise<void>((resolve) => {
            timer = setTimeout(() => {
                console.error('[hyperion-checkout] extensions late');
                if (required) {
                    const late = registerCheckoutGate('late-extensions');
                    late.set(t('Hyperion_Checkout::extension_required_failed'));
                    void started.then(() => late.remove());
                }
                resolve();
            }, EXTENSIONS_START_LIMIT_MS);
        });
        setExtensionsPending(Promise.race([started.finally(() => clearTimeout(timer)), limit]));
    }
    const ready = (): void => {
        emitCheckoutEvent('ready', { apiVersion: config.hyperion.extensionApi ?? EXTENSION_API });
    };
    void whenSettled().then(ready, ready);
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Shared Braintree client + device data.
 *
 * One client instance per client token and one data collector per
 * (token, PayPal flag) pair, both cached as promises so the card, vault and
 * PayPal renderers reuse them. A failed client creation is evicted so the
 * next attempt starts clean.
 *
 * Device data follows the core adapter (`adapter.js::setup`): the data
 * collector is always created, a collector failure is logged and the order
 * goes on without `device_data`.
 */
import { loadBraintreeModule } from './sdk.js';
import type { BraintreeClient } from './types.js';

const clients = new Map<string, Promise<BraintreeClient>>();
const deviceData = new Map<string, Promise<string | null>>();

export function getBraintreeClient(authorization: string): Promise<BraintreeClient> {
    const cached = clients.get(authorization);
    if (cached) return cached;
    const request = loadBraintreeModule('client')
        .then((client) => client.create({ authorization }))
        .catch((err: unknown) => {
            clients.delete(authorization);
            throw err;
        });
    clients.set(authorization, request);
    return request;
}

export function getDeviceData(
    authorization: string,
    options: { paypal?: boolean } = {}
): Promise<string | null> {
    const key = `${authorization}|${options.paypal ? 'paypal' : 'card'}`;
    const cached = deviceData.get(key);
    if (cached) return cached;
    const request = Promise.all([getBraintreeClient(authorization), loadBraintreeModule('data-collector')])
        .then(([client, collector]) => collector.create({
            client,
            ...(options.paypal ? { paypal: true } : {}),
        }))
        .then((instance) => instance.deviceData)
        .catch((err: unknown) => {
            deviceData.delete(key);
            console.error('[hyperion-checkout] Braintree device data collection failed', err);
            return null;
        });
    deviceData.set(key, request);
    return request;
}

export function resetBraintreeClientsForTests(): void {
    clients.clear();
    deviceData.clear();
}

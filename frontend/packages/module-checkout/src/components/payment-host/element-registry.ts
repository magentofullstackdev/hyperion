// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The payment elements the host created, one per row key, kept for the
 * page lifetime (a row that leaves the screen keeps its element, so the
 * state inside it survives a switch to another method and back), and the
 * heartbeat of each: every `hyperion-payment:busy` with `busy: true`
 * restarts the time limit of the call the element is in.
 */
import type { PaymentElement } from '../../../extension-api.js';
import type { Heartbeat } from '../../extension/call.js';
import type { PaymentEntry } from './entries.js';

export interface HostedElement {
    readonly rowKey: string;
    readonly code: string;
    readonly entry: PaymentEntry;
    readonly element: PaymentElement;
    readonly beats: Set<() => void>;
}

const hosted = new Map<string, HostedElement>();

export function hostedElement(rowKey: string): HostedElement | null {
    return hosted.get(rowKey) ?? null;
}

export function registerHosted(entry: HostedElement): void {
    hosted.set(entry.rowKey, entry);
}

export function forgetHosted(rowKey: string): void {
    hosted.delete(rowKey);
}

export function heartbeatOf(rowKey: string): Heartbeat {
    return {
        subscribe: (beat) => {
            const current = hosted.get(rowKey);
            if (!current) return () => undefined;
            current.beats.add(beat);
            return (): void => {
                current.beats.delete(beat);
            };
        },
    };
}

export function resetHostedForTests(): void {
    hosted.clear();
}

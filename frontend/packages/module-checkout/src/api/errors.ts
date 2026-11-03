// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Normalised REST error type.
 *
 * Magento's wire shape (`MagentoWireError` in `types/errors.ts`) has
 * several inconsistencies per endpoint -- sometimes `parameters` is an
 * object, sometimes an array; some endpoints nest errors under
 * `errors`. This class collapses everything into one shape that
 * actions + components can consume without per-call branching.
 *
 * The wire `message` is the exception's RAW phrase: the web API never
 * renders the placeholders (`%message`, `%fieldName`, `%1`) and ships the
 * arguments as `parameters` instead, so `interpolateMessage()` renders
 * them here the way `Magento\Framework\Phrase\Renderer\Placeholder` does
 * (a list argument fills `%1`, `%2`, ...; a named one fills `%name`), and
 * an aggregate error ("One or more input exceptions have occurred.") is
 * reported by its nested, specific messages.
 */
import type { MagentoWireError } from '../types/errors.js';

export class MagentoApiError extends Error {
    public readonly httpStatus: number;
    public readonly code: string;
    public readonly parameters: Readonly<Record<string, string>>;
    /** The nested per-field messages of an aggregate error, rendered. */
    public readonly errors: readonly string[];

    public constructor(
        httpStatus: number,
        code: string,
        message: string,
        parameters: Readonly<Record<string, string>> = {},
        errors: readonly string[] = []
    ) {
        super(message);
        this.name = 'MagentoApiError';
        this.httpStatus = httpStatus;
        this.code = code;
        this.parameters = parameters;
        this.errors = errors;
    }
}

/**
 * Thrown when the network-level fetch itself fails (DNS error,
 * offline, CORS, TLS, etc.) -- i.e. the request never produced an
 * HTTP response. Callers use this to distinguish retryable transport
 * failures from 4xx/5xx responses.
 */
export class NetworkError extends Error {
    public constructor(cause: unknown) {
        super(cause instanceof Error ? cause.message : 'Network error');
        this.name = 'NetworkError';
        this.cause = cause;
    }
}

/**
 * True for the rejection `fetch()` produces when its `AbortSignal` fires
 * (a `DOMException` named `AbortError`). Such a rejection is a caller's own
 * cancellation, never a transport failure: the client rethrows it as is and
 * flow actions ignore it.
 */
export function isAbortError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

/**
 * `parameters` as Magento emits them (an object keyed by placeholder name,
 * a flat list positional to the phrase, or nothing) as a string record:
 * list entries are keyed by their index as a string.
 */
function normaliseParameters(raw: MagentoWireError['parameters']): Record<string, string> {
    const parameters: Record<string, string> = {};
    if (Array.isArray(raw)) {
        raw.forEach((v, i) => {
            parameters[String(i)] = String(v);
        });
    } else if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw)) {
            parameters[key] = String(value);
        }
    }
    return parameters;
}

/**
 * Render the placeholders of a raw Magento phrase from its parameters:
 * `%1` from the list entry `0`, `%name` from the named entry `name`.
 * Longer placeholders are replaced first (`%message` before `%m`), and a
 * placeholder without a parameter is left as it is.
 */
export function interpolateMessage(
    message: string,
    parameters: Readonly<Record<string, string>>
): string {
    const placeholders = Object.keys(parameters)
        .map((key) => ({ key, placeholder: /^\d+$/.test(key) ? `%${Number(key) + 1}` : `%${key}` }))
        .sort((a, b) => b.placeholder.length - a.placeholder.length);
    if (placeholders.length === 0) return message;
    let out = '';
    let i = 0;
    while (i < message.length) {
        const hit = message[i] === '%'
            ? placeholders.find((p) => message.startsWith(p.placeholder, i))
            : undefined;
        if (hit) {
            out += parameters[hit.key];
            i += hit.placeholder.length;
        } else {
            out += message[i];
            i += 1;
        }
    }
    return out;
}

/**
 * Normalise a raw Magento REST error body into `MagentoApiError`.
 * Exported for unit-test coverage -- the client re-exports it
 * internally. The message is the phrase rendered with its parameters
 * (or the nested errors of an aggregate), ready to show; i18n of the
 * phrase itself is the server's (`__()` ran before the exception).
 */
export function normaliseMagentoError(
    httpStatus: number,
    body: unknown
): MagentoApiError {
    if (body === null || typeof body !== 'object') {
        return new MagentoApiError(
            httpStatus,
            'unknown',
            `HTTP ${httpStatus} (no error body)`
        );
    }

    const wire = body as MagentoWireError;
    const parameters = normaliseParameters(wire.parameters);
    const rawMessage = typeof wire.message === 'string' && wire.message.length > 0
        ? wire.message
        : `HTTP ${httpStatus}`;
    const errors = Array.isArray(wire.errors)
        ? wire.errors
            .filter((e): e is MagentoWireError => !!e && typeof e === 'object' && typeof e.message === 'string')
            .map((e) => interpolateMessage(e.message, normaliseParameters(e.parameters)))
            .filter((m) => m.trim().length > 0)
        : [];
    const message = errors.length > 0 ? errors.join(' ') : interpolateMessage(rawMessage, parameters);

    return new MagentoApiError(httpStatus, String(httpStatus), message, parameters, errors);
}

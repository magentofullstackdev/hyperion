// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Normalized REST error type.
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
 *
 * `message` is that rendered text, or a translated line for the status
 * class when the answer carried none. The class of a failure (and the text
 * to show for it) is decided by `classifyError()` of `error-kinds.ts`, from
 * the fields kept here: the status, the raw phrase, whether the body was
 * JSON at all, and the `Retry-After` header.
 */
import type { CheckoutErrorKind, MagentoWireError } from '../types/errors.js';
import { t } from '../utils/i18n.js';

/** Stands for a response body that is not JSON (a proxy's page, a firewall's challenge). */
export const NON_JSON_BODY: unique symbol = Symbol('non-JSON body');

/** What an answer told beyond its status and its rendered message. */
export interface MagentoApiErrorDetails {
    /** The wire phrase before its placeholders were rendered. */
    rawMessage?: string;
    /** The body was not JSON: nothing in it is a message. */
    nonJsonBody?: boolean;
    /** The wait the `Retry-After` header asks for. */
    retryAfterMs?: number;
}

export class MagentoApiError extends Error {
    public readonly httpStatus: number;
    public readonly code: string;
    public readonly parameters: Readonly<Record<string, string>>;
    /** The nested per-field messages of an aggregate error, rendered. */
    public readonly errors: readonly string[];
    /**
     * The wire phrase before its placeholders were rendered (`%1` still in
     * it); empty when the answer carried no message. An error built without
     * it reports its message.
     */
    public readonly rawMessage: string;
    /** The body was not JSON. */
    public readonly nonJsonBody: boolean;
    /** The wait the `Retry-After` header asked for, when the answer had one. */
    public readonly retryAfterMs: number | undefined;
    /** The class of the failure, set by the client, which knows the request. */
    public kind: CheckoutErrorKind | undefined;

    public constructor(
        httpStatus: number,
        code: string,
        message: string,
        parameters: Readonly<Record<string, string>> = {},
        errors: readonly string[] = [],
        details: MagentoApiErrorDetails = {}
    ) {
        super(message);
        this.name = 'MagentoApiError';
        this.httpStatus = httpStatus;
        this.code = code;
        this.parameters = parameters;
        this.errors = errors;
        this.rawMessage = details.rawMessage ?? message;
        this.nonJsonBody = details.nonJsonBody ?? false;
        this.retryAfterMs = details.retryAfterMs;
        this.kind = undefined;
    }
}

/** The classes a request that got no answer can belong to. */
export type TransportErrorKind = 'offline' | 'network' | 'timeout';

function browserIsOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Thrown when the network-level fetch itself fails (DNS error,
 * offline, CORS, TLS, etc.) -- i.e. the request never produced an
 * HTTP response. Callers use this to distinguish retryable transport
 * failures from 4xx/5xx responses. `kind` is settled when the failure
 * happens: `offline` when the browser reported no connection then.
 */
export class NetworkError extends Error {
    public readonly kind: TransportErrorKind;

    public constructor(cause: unknown, kind?: TransportErrorKind) {
        super(cause instanceof Error ? cause.message : 'Network error');
        this.name = 'NetworkError';
        this.cause = cause;
        this.kind = kind ?? (browserIsOffline() ? 'offline' : 'network');
    }
}

/**
 * The request was given a time limit (`ApiFetchOptions.timeoutMs`) and no
 * answer arrived within it. A transport failure like any other for the
 * callers, except that the request may well have reached the server.
 */
export class RequestTimeoutError extends NetworkError {
    public constructor(cause?: unknown) {
        super(cause ?? new Error('Request timed out'), 'timeout');
        this.name = 'RequestTimeoutError';
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
function normalizeParameters(raw: MagentoWireError['parameters']): Record<string, string> {
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
 * The message of an error answer that carries none of its own (an empty
 * body, a proxy's HTML page), chosen by the status class.
 */
function fallbackMessage(httpStatus: number): string {
    if (httpStatus >= 500) return t('Hyperion_Checkout::error_store_unavailable');
    if (httpStatus === 429) return t('Hyperion_Checkout::error_too_many_requests');
    if (httpStatus === 403) return t('Hyperion_Checkout::error_request_blocked');
    return t('Hyperion_Checkout::unexpected_error');
}

/**
 * Normalize a raw Magento REST error body into `MagentoApiError`. The
 * message is the phrase rendered with its parameters (or the nested errors
 * of an aggregate), ready to show; i18n of the phrase itself is the
 * server's (`__()` ran before the exception). A body that is not a JSON
 * object, or one without a message, yields a translated message for the
 * status class: the caller passes `NON_JSON_BODY` for a body that is not
 * JSON, so a proxy's page never becomes the text. `retryAfterMs` is the
 * parsed `Retry-After` header of the answer, when it had one.
 */
export function normalizeMagentoError(
    httpStatus: number,
    body: unknown,
    retryAfterMs?: number
): MagentoApiError {
    const header: MagentoApiErrorDetails = retryAfterMs === undefined ? {} : { retryAfterMs };
    if (body === null || typeof body !== 'object') {
        return new MagentoApiError(httpStatus, 'unknown', fallbackMessage(httpStatus), {}, [], {
            ...header,
            rawMessage: '',
            nonJsonBody: body === NON_JSON_BODY,
        });
    }

    const wire = body as MagentoWireError;
    const parameters = normalizeParameters(wire.parameters);
    const errors = Array.isArray(wire.errors)
        ? wire.errors
            .filter((e): e is MagentoWireError => !!e && typeof e === 'object' && typeof e.message === 'string')
            .map((e) => interpolateMessage(e.message, normalizeParameters(e.parameters)))
            .filter((m) => m.trim().length > 0)
        : [];
    const rawMessage = typeof wire.message === 'string' ? wire.message.trim() : '';
    let message: string;
    if (errors.length > 0) {
        message = errors.join(' ');
    } else if (rawMessage !== '') {
        message = interpolateMessage(rawMessage, parameters);
    } else {
        message = fallbackMessage(httpStatus);
    }

    return new MagentoApiError(httpStatus, String(httpStatus), message, parameters, errors, { ...header, rawMessage });
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The public error of the extension API (`CheckoutError` of
 * `extension-api.d.ts`): how one is built, and the plain text rule for the
 * messages an extension sends (`public-kind.ts` maps the kinds).
 */
import type { CheckoutError } from '../../extension-api.js';

export { publicErrorKind, type PublicErrorKind } from './public-kind.js';
import type { PublicErrorKind } from './public-kind.js';

/** The longest message an extension may have shown for it. */
export const MAX_MESSAGE_LENGTH = 500;

/** `value` as plain text of at most `MAX_MESSAGE_LENGTH` characters; null when it is not a usable string. */
export function plainMessage(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    // eslint-disable-next-line no-control-regex -- control characters are dropped from untrusted text
    const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (text === '') return null;
    return text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH) : text;
}

/** A frozen public error. `message` is translated and safe to show. */
export function publicError(kind: PublicErrorKind, message: string, status: number | null = null, cause?: unknown): CheckoutError {
    const error = new Error(message) as Error & { kind: PublicErrorKind; status: number | null };
    error.name = 'CheckoutError';
    error.kind = kind;
    error.status = status;
    if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
    return Object.freeze(error) as CheckoutError;
}

/** True for an error built by `publicError()`. */
export function isPublicError(value: unknown): value is CheckoutError {
    return value instanceof Error && value.name === 'CheckoutError'
        && typeof (value as { kind?: unknown }).kind === 'string';
}

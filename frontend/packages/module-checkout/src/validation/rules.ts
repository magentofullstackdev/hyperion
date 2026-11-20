// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Field-level validators. Each returns `null` when valid or a
 * translation key (for `t()` in i18n) when invalid. Deliberately
 * thin -- server-side validation is authoritative.
 */

export type Validator = (value: string) => string | null;

export const required: Validator = (value) =>
    value.trim().length === 0 ? 'Hyperion_Checkout::validation_required' : null;

/**
 * The shape of an email address the checkout accepts: the one expression
 * behind the field validator, the Place Order gate and the guest email
 * sent with the quote addresses.
 */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const email: Validator = (value) => {
    if (!value) return 'Hyperion_Checkout::validation_required';
    return EMAIL_SHAPE.test(value)
        ? null
        : 'Hyperion_Checkout::validation_email';
};

export function composeValidators(...validators: Validator[]): Validator {
    return (value) => {
        for (const v of validators) {
            const err = v(value);
            if (err) return err;
        }
        return null;
    };
}

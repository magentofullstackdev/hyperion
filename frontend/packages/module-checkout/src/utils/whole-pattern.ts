// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Every `pattern` of the extension surface (a payment method pattern, a
 * shipping `match` part between slashes, an address field, a field of a
 * payment form) must match the WHOLE value, as the HTML `pattern`
 * attribute reads it and as the server checks it. The source is wrapped as
 * `^(?:pattern)$`, which leaves an already anchored pattern as it is and
 * makes an alternation (`a|b`) apply to the whole value. No flags.
 *
 * A pattern the browser cannot compile matches nothing, logged once: a
 * field stays invalid, a method or a shipping rule is not matched.
 */

const compiled = new Map<string, RegExp | null>();

/** Whether `value` matches the whole `pattern`; false for a pattern that does not compile. */
export function matchesWhole(pattern: string, value: string): boolean {
    let expression = compiled.get(pattern);
    if (expression === undefined) {
        try {
            expression = new RegExp(`^(?:${pattern})$`);
        } catch (err) {
            console.error(`[hyperion-checkout] invalid pattern ${pattern}`, err);
            expression = null;
        }
        compiled.set(pattern, expression);
    }
    return expression !== null && expression.test(value);
}

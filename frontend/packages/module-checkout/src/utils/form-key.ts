// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Read the live `form_key` cookie.
 *
 * Why read at call time: Varnish-cached pages ship with whatever
 * form_key the FPC baked in, which is a different value from the one
 * the user's current session actually accepts. The theme-level
 * form-key provider (`app/design/frontend/Magentofullstackdev/hyperion/web/js/entry.js`,
 * committed earlier today) generates a client-side form_key, sets it
 * as a cookie, and relies on Magento's `RegisterFormKeyFromCookie`
 * plugin to sync the server session. As long as that cookie exists at
 * the moment a mutation fires, CSRF passes.
 *
 * The checkout bundle doesn't own the cookie -- it only reads it. Any
 * absence is a bootstrapping bug in the theme side of things.
 */

export function readFormKeyCookie(): string {
    const parts = document.cookie.split(';');
    for (const raw of parts) {
        const piece = raw.trim();
        if (piece.startsWith('form_key=')) {
            const value = piece.substring('form_key='.length);
            return decodeURIComponent(value);
        }
    }
    return '';
}

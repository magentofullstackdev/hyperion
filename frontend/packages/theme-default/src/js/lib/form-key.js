// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Form-key provider and `data-post` links, without RequireJS.
//
// Varnish strips every backend Set-Cookie header from cacheable responses,
// so an edge-cached page ships whatever `form_key` value happened to be in
// the session when it was first rendered, stale for every subsequent
// visitor. Luma repairs it with `Magento_PageCache::js/form-key-provider.js`:
// the client generates a form_key, stores it in a cookie, and
// `Magento\PageCache\Plugin\RegisterFormKeyFromCookie` adopts that cookie
// as the session form key on the next request. This module ports that
// behaviour and adds the two things Luma's `mage/dataPost` widget does:
//
//   - every same-origin `<form method="post">` gets a hidden `form_key`
//     input when the template did not render one (core templates the theme
//     keeps, such as `Magento_Customer::form/confirmation.phtml`, post
//     without one and `CsrfValidator` would reject the request);
//   - `[data-post]` controls build and submit a POST form from their
//     `{"action": url, "data": {...}}` payload (reorder links, address
//     deletion and every other core control that must not be a GET).

export const FORM_KEY_INPUT_SELECTOR = 'input[name="form_key"]';
const FORM_KEY_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORM_KEY_LENGTH = 16;
const FORM_KEY_COOKIE_MAX_AGE = 86400;

export function readFormKeyCookie() {
    const parts = document.cookie.split(';');
    for (let i = 0; i < parts.length; i++) {
        const piece = parts[i].trim();
        if (piece.indexOf('form_key=') === 0) {
            return piece.substring('form_key='.length) || null;
        }
    }
    return null;
}

export function writeFormKeyCookie(value) {
    const cfg = window.cookiesConfig || {};
    const secure = cfg.secure || location.protocol === 'https:' ? '; secure' : '';
    const sameSite = '; samesite=' + (cfg.samesite || 'lax');
    document.cookie =
        'form_key=' + value +
        '; max-age=' + FORM_KEY_COOKIE_MAX_AGE +
        '; path=/' + secure + sameSite;
}

export function generateFormKey() {
    const bytes = new Uint8Array(FORM_KEY_LENGTH);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        // No Web Crypto (a very old browser): core's own provider uses
        // Math.random, the form key is a CSRF token and not a secret.
        for (let i = 0; i < FORM_KEY_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < FORM_KEY_LENGTH; i++) {
        out += FORM_KEY_CHARS[bytes[i] % FORM_KEY_CHARS.length];
    }
    return out;
}

let cachedFormKey = null;

export function getCachedFormKey() {
    return cachedFormKey;
}

// Whether a form posts to this origin. Relative and empty actions count;
// third-party gateways (PayPal Standard, hosted payment pages) do not.
export function isSameOriginPostForm(form) {
    if (!(form instanceof HTMLFormElement)) return false;
    if ((form.getAttribute('method') || 'get').toLowerCase() !== 'post') return false;
    const action = form.getAttribute('action');
    if (!action || action.trim() === '') return true;
    try {
        return new URL(action, location.href).origin === location.origin;
    } catch {
        return false;
    }
}

// Add a hidden `form_key` input to every same-origin POST form under
// `root` that has none. Returns the number of inputs added.
export function injectFormKeyInputs(root, key) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    let added = 0;
    const forms = scope instanceof HTMLFormElement ? [scope] : Array.from(scope.querySelectorAll('form'));
    forms.forEach((form) => {
        if (!isSameOriginPostForm(form)) return;
        if (form.querySelector(FORM_KEY_INPUT_SELECTOR)) return;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'form_key';
        input.value = key;
        form.appendChild(input);
        added++;
    });
    return added;
}

// Read (or mint) the form_key cookie, sync every form_key input and add
// the missing ones. Safe to call repeatedly (init, after HTMX swaps,
// before each HTMX request).
export function ensureFormKey(root) {
    let key = readFormKeyCookie();
    if (!key) {
        key = generateFormKey();
        writeFormKeyCookie(key);
    }
    cachedFormKey = key;
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll(FORM_KEY_INPUT_SELECTOR).forEach((el) => {
        el.value = key;
    });
    injectFormKeyInputs(scope, key);
    return key;
}

// Parse a `data-post` attribute value. Returns null when it is not the
// `{"action": url, "data": {...}}` shape core's PostHelper emits.
export function parseDataPost(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    let params;
    try {
        params = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!params || typeof params !== 'object' || typeof params.action !== 'string' || params.action === '') {
        return null;
    }
    const data = params.data && typeof params.data === 'object' ? params.data : {};
    return { action: params.action, data, files: params.files };
}

// Build the POST form `mage/dataPost` would build: one input per `data`
// entry plus `form_key`. `confirmation` / `confirmationMessage` are core's
// own control fields and are posted along, like core does.
export function buildDataPostForm(params, formKey) {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = params.action;
    form.hidden = true;
    const data = { ...params.data };
    if (formKey) data.form_key = formKey;
    Object.keys(data).forEach((name) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = data[name] == null ? '' : String(data[name]);
        form.appendChild(input);
    });
    if (params.files && typeof params.files === 'object') {
        form.enctype = 'multipart/form-data';
        Object.keys(params.files).forEach((name) => {
            const files = params.files[name];
            if (typeof FileList !== 'undefined' && files instanceof FileList) {
                const input = document.createElement('input');
                input.type = 'file';
                input.name = name;
                input.files = files;
                form.appendChild(input);
            }
        });
    }
    return form;
}

// Submit a `data-post` payload. `confirm(message)` must resolve to a
// boolean; it is only consulted when the payload asks for confirmation.
export function submitDataPost(params, confirm) {
    const submit = () => {
        const form = buildDataPostForm(params, cachedFormKey || ensureFormKey());
        document.body.appendChild(form);
        form.submit();
    };
    if (params.data.confirmation) {
        const message = params.data.confirmationMessage || '';
        return Promise.resolve(confirm ? confirm(message) : window.confirm(message)).then((ok) => {
            if (ok) submit();
            return Boolean(ok);
        });
    }
    submit();
    return Promise.resolve(true);
}

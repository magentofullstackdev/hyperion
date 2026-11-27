// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The storefront's loader of extension elements (the express buttons of
 * `<hyperion-express-slot>`): the same rules as the checkout's loader, in a
 * copy of its own because the theme bundle never imports the checkout
 * package.
 *
 * A first-party entry names a `builtin` id, resolved through a map of
 * dynamic imports (`registerBuiltinModule()`), so the theme build keeps each
 * one a chunk. Any other entry names the `moduleUrl` the server resolved
 * from an asset id; it is imported only from the page's origin or the
 * origin the theme's own scripts are served from (the static base URL).
 *
 * `loadExtensionElement()` waits for the tag (8 s) and compares the major of
 * the version the class declares (`static hyperionApi`) with the API's. It
 * always resolves, with `ready`, `load-failed`, `timeout` or
 * `version-mismatch`, and logs each failure once with the id, the tag, the
 * module and both versions. One import per module; a failure is forgotten
 * and the retry appends `?hyperion_retry=<n>` (a browser may keep a failed
 * module fetch in its module map for the life of the page).
 */

/** Version of the storefront extension API (same value as the checkout's). */
export const EXTENSION_API = '1.0-beta';

/** How long a module may take to define its tag. */
export const DEFINE_TIMEOUT_MS = 8000;

const TAG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
const RESERVED_TAG_PREFIXES = [
    'hyperion-', 'hc-', 'checkout-', 'payment-', 'shipping-', 'address-', 'order-',
    'summary-', 'place-', 'coupon-', 'loading-', 'error-',
];

const defaultImporter = (url) => import(/* @vite-ignore */ url);
const defaultOrigins = () => {
    const origins = [window.location.origin];
    try {
        origins.push(new URL(import.meta.url).origin);
    } catch {
        // A module without a URL (a test runner) adds nothing.
    }
    return origins;
};

let importModule = defaultImporter;
let allowedOrigins = defaultOrigins;
const builtins = new Map();
const inFlight = new Map();
const failures = new Map();

/** The major of a version string, NaN when it has none. */
export function apiMajor(version) {
    const match = /^(\d+)(?:[.-]|$)/.exec(String(version ?? ''));
    return match ? Number(match[1]) : Number.NaN;
}

/** True when a class written for `declared` runs on this API. */
export function isSupportedApi(declared) {
    const major = apiMajor(declared);
    return Number.isFinite(major) && major === apiMajor(EXTENSION_API);
}

/** Register the module of a first-party `builtin` id. */
export function registerBuiltinModule(id, load) {
    builtins.set(id, load);
}

/** True when `tag` is a valid custom element name an extension may define. */
export function isAllowedExtensionTag(tag, internal = false) {
    if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) return false;
    return internal || !RESERVED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix));
}

/** The absolute URL of `moduleUrl` when it may be imported, null otherwise. */
export function allowedModuleUrl(moduleUrl) {
    if (typeof moduleUrl !== 'string' || moduleUrl.trim() === '') return null;
    let url;
    try {
        url = new URL(moduleUrl, `${window.location.origin}/`);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return allowedOrigins().includes(url.origin) ? url : null;
}

function describe(entry, declared) {
    return [
        `id "${entry.id ?? ''}"`,
        `tag "${entry.tag ?? ''}"`,
        `module "${entry.moduleUrl ?? entry.builtin ?? ''}"`,
        `API "${EXTENSION_API}"`,
        `declared API "${declared === undefined ? '' : String(declared)}"`,
    ].join(', ');
}

function cacheKey(entry) {
    if (entry.builtin) return `builtin:${entry.builtin}`;
    return entry.moduleUrl ? `url:${entry.moduleUrl}` : null;
}

function withRetryMarker(url, attempt) {
    if (!attempt) return url.href;
    const marked = new URL(url.href);
    marked.searchParams.set('hyperion_retry', String(attempt));
    return marked.href;
}

/** Import the module of an entry once while it succeeds; rejects when it cannot or may not be loaded. */
export function importExtensionModule(entry) {
    const key = cacheKey(entry);
    if (key === null) return Promise.reject(new Error('the entry names no module'));
    const running = inFlight.get(key);
    if (running) return running;

    let load;
    if (entry.builtin) {
        const resolver = builtins.get(entry.builtin);
        load = resolver
            ? Promise.resolve().then(resolver)
            : Promise.reject(new Error(`no first-party module is registered as "${entry.builtin}"`));
    } else {
        const url = allowedModuleUrl(entry.moduleUrl);
        load = url === null
            ? Promise.reject(new Error('the module URL is not on an allowed origin'))
            : Promise.resolve().then(() => importModule(withRetryMarker(url, failures.get(key) ?? 0)));
    }
    const tracked = load.catch((err) => {
        if (inFlight.get(key) === tracked) inFlight.delete(key);
        failures.set(key, (failures.get(key) ?? 0) + 1);
        throw err;
    });
    inFlight.set(key, tracked);
    return tracked;
}

function evict(entry) {
    const key = cacheKey(entry);
    if (key === null) return;
    inFlight.delete(key);
    failures.set(key, (failures.get(key) ?? 0) + 1);
}

function whenDefined(tag, timeoutMs) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        customElements.whenDefined(tag).then(
            (ctor) => {
                clearTimeout(timer);
                resolve(ctor ?? customElements.get(tag) ?? null);
            },
            () => {
                clearTimeout(timer);
                resolve(null);
            }
        );
    });
}

/**
 * Load the module of an element entry and wait for its tag; always resolves.
 *
 * @param {{ id?: string, tag: string, moduleUrl: string|null, builtin: string|null }} entry
 * @param {number} [timeoutMs]
 * @returns {Promise<{ state: 'ready'|'load-failed'|'timeout'|'version-mismatch', elementClass: CustomElementConstructor|null }>}
 */
export async function loadExtensionElement(entry, timeoutMs = DEFINE_TIMEOUT_MS) {
    // Only first-party entries name a builtin, and only they may use the theme's prefixes.
    if (!isAllowedExtensionTag(entry.tag, Boolean(entry.builtin))) {
        console.error(`[hyperion] an extension element has a tag it may not use: ${describe(entry)}`);
        return { state: 'load-failed', elementClass: null };
    }
    if (!customElements.get(entry.tag)) {
        try {
            await importExtensionModule(entry);
        } catch (err) {
            console.error(`[hyperion] an extension module could not be loaded: ${describe(entry)}`, err);
            return { state: 'load-failed', elementClass: null };
        }
    }
    const ctor = await whenDefined(entry.tag, timeoutMs);
    if (ctor === null) {
        evict(entry);
        console.error(`[hyperion] an extension element was not defined in time: ${describe(entry)}`);
        return { state: 'timeout', elementClass: null };
    }
    const declared = ctor.hyperionApi;
    if (!isSupportedApi(declared)) {
        console.error(`[hyperion] an extension element was written for another API version: ${describe(entry, declared)}`);
        return { state: 'version-mismatch', elementClass: null };
    }
    return { state: 'ready', elementClass: ctor };
}

/** Replace `import()` and the allowed origins (tests only); null restores the defaults. */
export function setExtensionLoaderForTests({ importer = null, origins = null } = {}) {
    importModule = importer ?? defaultImporter;
    allowedOrigins = origins ? () => origins : defaultOrigins;
}

/** Forget the builtins, the imports and the failures (tests only). */
export function resetExtensionLoader() {
    builtins.clear();
    inFlight.clear();
    failures.clear();
    importModule = defaultImporter;
    allowedOrigins = defaultOrigins;
}

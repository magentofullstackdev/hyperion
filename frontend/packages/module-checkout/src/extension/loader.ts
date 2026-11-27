// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The loader of extension code: a custom element (payment, shipping,
 * slot) or a module of the generic pool.
 *
 * A first-party entry names a `builtin` id: its module comes from the
 * resolver registered for that id (`registerBuiltinModule()`, a function
 * that returns a dynamic `import()`), so the build keeps it a chunk of its
 * own. Any other entry names a `moduleUrl` that the server resolved from an
 * asset id; it is imported only when its origin is the page's own or one of
 * `hyperion.staticOrigins`.
 *
 * The checkout's version and the allowed static origins are read from the
 * page's configuration (`hyperion.extensionApi`, `hyperion.staticOrigins`).
 *
 * `loadExtensionElement()` then waits for the tag to be defined (8 s) and
 * checks the version the element class declares (`static hyperionApi`)
 * against the checkout's. It always resolves, with one of four states;
 * every failure is logged once with the id, the tag, the URL and both
 * versions. One import runs per module URL. A failed one is forgotten, so
 * a retry imports again, with `?hyperion_retry=<n>` appended: a browser may
 * keep a failed module fetch in its module map for the life of the page.
 */
import { peekCheckoutConfig } from '../bootstrap-config.js';
import { isSupportedApi } from './api-version.js';
import { EXTENSION_API } from './version.js';

export type ExtensionLoadState = 'ready' | 'load-failed' | 'timeout' | 'version-mismatch';

export interface ExtensionModuleDescriptor {
    /** The pool item name, for the log. */
    readonly id?: string;
    readonly moduleUrl: string | null;
    readonly builtin: string | null;
}

export interface ExtensionElementDescriptor extends ExtensionModuleDescriptor {
    readonly tag: string;
    /** First-party entries may use the checkout's own tag prefixes. */
    readonly internal?: boolean;
}

export interface ExtensionLoadResult {
    readonly state: ExtensionLoadState;
    /** The element class when `state` is `ready`. */
    readonly elementClass: CustomElementConstructor | null;
}

/** How long a module may take to define its tag. */
export const DEFINE_TIMEOUT_MS = 8000;

/** How long the import of a module may take: a static origin that stalls never holds the checkout. */
export const IMPORT_TIMEOUT_MS = 8000;

/** The import of a module did not settle within `IMPORT_TIMEOUT_MS`. */
export class ExtensionImportTimeout extends Error {
    public constructor(what: string) {
        super(`the module ${what} did not load within ${IMPORT_TIMEOUT_MS} ms`);
        this.name = 'ExtensionImportTimeout';
    }
}

/** The custom element name rule, plus the prefixes the checkout and the theme own. */
const TAG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
const RESERVED_TAG_PREFIXES: readonly string[] = [
    'hyperion-', 'hc-', 'checkout-', 'payment-', 'shipping-', 'address-', 'order-',
    'summary-', 'place-', 'coupon-', 'loading-', 'error-',
];

/** The page's origin; replaced in the unit tests. */
let pageOrigin = (): string => window.location.origin;

/** The checkout's version of the extension API, as the server stated it (`hyperion.extensionApi`). */
export function extensionApiVersion(): string {
    const stated = peekCheckoutConfig()?.hyperion?.extensionApi;
    return typeof stated === 'string' && stated !== '' ? stated : EXTENSION_API;
}

/** The origins other than the page's that may serve modules (`hyperion.staticOrigins`). */
function staticOrigins(): readonly string[] {
    const listed = peekCheckoutConfig()?.hyperion?.staticOrigins;
    return Array.isArray(listed) ? listed.filter((origin) => typeof origin === 'string') : [];
}

const builtins = new Map<string, () => Promise<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const failures = new Map<string, number>();

/** Register the module of a first-party `builtin` id. */
export function registerBuiltinModule(id: string, load: () => Promise<unknown>): void {
    builtins.set(id, load);
}

/** True when `tag` is a valid custom element name an extension may define. */
export function isAllowedExtensionTag(tag: unknown, internal = false): tag is string {
    if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) return false;
    return internal || !RESERVED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix));
}

/** The absolute URL of `moduleUrl` when it may be imported, null otherwise. */
export function allowedModuleUrl(moduleUrl: unknown): URL | null {
    if (typeof moduleUrl !== 'string' || moduleUrl.trim() === '') return null;
    let url: URL;
    try {
        url = new URL(moduleUrl, `${pageOrigin()}/`);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.origin === pageOrigin()) return url;
    return staticOrigins().includes(url.origin) ? url : null;
}

function describe(descriptor: ExtensionModuleDescriptor & { tag?: string }, declared?: unknown): string {
    return [
        `id "${descriptor.id ?? ''}"`,
        `tag "${descriptor.tag ?? ''}"`,
        `module "${descriptor.moduleUrl ?? descriptor.builtin ?? ''}"`,
        `checkout API "${extensionApiVersion()}"`,
        `declared API "${declared === undefined ? '' : String(declared)}"`,
    ].join(', ');
}

function cacheKey(descriptor: ExtensionModuleDescriptor): string | null {
    if (descriptor.builtin) return `builtin:${descriptor.builtin}`;
    return descriptor.moduleUrl ? `url:${descriptor.moduleUrl}` : null;
}

function withRetryMarker(url: URL, attempt: number): string {
    if (attempt === 0) return url.href;
    const marked = new URL(url.href);
    marked.searchParams.set('hyperion_retry', String(attempt));
    return marked.href;
}

/** Stands in for `import()` in the unit tests. */
let importModule: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url);

export function setModuleImporterForTests(importer: ((url: string) => Promise<unknown>) | null): void {
    importModule = importer ?? ((url) => import(/* @vite-ignore */ url));
}

export function resetExtensionLoaderForTests(origin: (() => string) | null = null): void {
    builtins.clear();
    inFlight.clear();
    failures.clear();
    pageOrigin = origin ?? ((): string => window.location.origin);
}

/**
 * Import the module of an entry: once per URL (or builtin id) while it
 * succeeds; a failure is forgotten so the next call tries again. Rejects
 * when the module cannot be loaded or may not be, and with
 * `ExtensionImportTimeout` when it does not load within `IMPORT_TIMEOUT_MS`
 * (forgotten too: the retry appends its marker to the URL).
 */
export function importExtensionModule(descriptor: ExtensionModuleDescriptor): Promise<unknown> {
    const key = cacheKey(descriptor);
    if (key === null) return Promise.reject(new Error('the entry names no module'));
    const running = inFlight.get(key);
    if (running) return running;

    let load: Promise<unknown>;
    if (descriptor.builtin) {
        const resolver = builtins.get(descriptor.builtin);
        load = resolver
            ? Promise.resolve().then(resolver)
            : Promise.reject(new Error(`no first-party module is registered as "${descriptor.builtin}"`));
    } else {
        const url = allowedModuleUrl(descriptor.moduleUrl);
        if (url === null) {
            load = Promise.reject(new Error('the module URL is not on an allowed origin'));
        } else {
            load = importModule(withRetryMarker(url, failures.get(key) ?? 0));
        }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ExtensionImportTimeout(key)), IMPORT_TIMEOUT_MS);
    });
    const bounded = Promise.race([load, limit]).finally(() => clearTimeout(timer));
    // A module that loads after its time limit stays unused until a retry.
    load.catch(() => undefined);
    const tracked = bounded.catch((err: unknown) => {
        if (inFlight.get(key) === tracked) inFlight.delete(key);
        failures.set(key, (failures.get(key) ?? 0) + 1);
        throw err;
    });
    inFlight.set(key, tracked);
    return tracked;
}

/** Forget a module that loaded but failed later (a timeout): the next call imports it again. */
function evict(descriptor: ExtensionModuleDescriptor): void {
    const key = cacheKey(descriptor);
    if (key === null) return;
    inFlight.delete(key);
    failures.set(key, (failures.get(key) ?? 0) + 1);
}

function whenDefined(tag: string, timeoutMs: number): Promise<CustomElementConstructor | null> {
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
 * Wait for a tag some module defines (8 s) and check the version its class
 * declares. Used for the elements of a module the caller loaded itself (a
 * slot element of a generic module).
 */
export async function awaitExtensionElement(
    descriptor: ExtensionElementDescriptor,
    timeoutMs: number = DEFINE_TIMEOUT_MS
): Promise<ExtensionLoadResult> {
    const ctor = await whenDefined(descriptor.tag, timeoutMs);
    if (ctor === null) {
        console.error(`[hyperion-checkout] an extension element was not defined in time: ${describe(descriptor)}`);
        return { state: 'timeout', elementClass: null };
    }
    const declared = (ctor as unknown as { hyperionApi?: unknown }).hyperionApi;
    if (!isSupportedApi(declared, extensionApiVersion())) {
        console.error(`[hyperion-checkout] an extension element was written for another API version: ${describe(descriptor, declared)}`);
        return { state: 'version-mismatch', elementClass: null };
    }
    return { state: 'ready', elementClass: ctor };
}

/** Load the module of an element entry and wait for its tag; always resolves. */
export async function loadExtensionElement(
    descriptor: ExtensionElementDescriptor,
    timeoutMs: number = DEFINE_TIMEOUT_MS
): Promise<ExtensionLoadResult> {
    if (!isAllowedExtensionTag(descriptor.tag, descriptor.internal === true)) {
        console.error(`[hyperion-checkout] an extension element has a tag it may not use: ${describe(descriptor)}`);
        return { state: 'load-failed', elementClass: null };
    }
    if (!customElements.get(descriptor.tag)) {
        try {
            await importExtensionModule(descriptor);
        } catch (err) {
            // A retry can fail because the import it replaced arrived late and
            // defined the tag first (a second `define()` throws): the element is there.
            if (customElements.get(descriptor.tag)) return awaitExtensionElement(descriptor, timeoutMs);
            if (err instanceof ExtensionImportTimeout) {
                console.error(`[hyperion-checkout] an extension module did not load in time: ${describe(descriptor)}`, err);
                return { state: 'timeout', elementClass: null };
            }
            console.error(`[hyperion-checkout] an extension module could not be loaded: ${describe(descriptor)}`, err);
            return { state: 'load-failed', elementClass: null };
        }
    }
    const result = await awaitExtensionElement(descriptor, timeoutMs);
    if (result.state === 'timeout') evict(descriptor);
    return result;
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Bundle-local i18n runtime.
 *
 * Decisions:
 *   - Every user-visible string routes through `t(key, params?)` with a
 *     `Hyperion_Checkout::<name>` key. The static catalogs under
 *     `src/i18n/<locale>.json` map those keys to text; `en_US.json` is the
 *     source of the English strings.
 *   - Magento is authoritative at runtime: `checkoutConfig.hyperion.translations`
 *     carries the English strings of the module's `i18n/en_US.csv` rendered
 *     through `__()` (the module's `i18n/<locale>.csv`, a merchant CSV or a
 *     language pack decide the text). It is keyed by the English source
 *     string, Magento's own convention; `t()` looks a key up by its English
 *     text there first, then in the active static catalog, then in `en_US`.
 *     A dictionary keyed by `Hyperion_Checkout::` keys is accepted too.
 *   - The static catalogs are the fallback for unit tests, standalone dev
 *     mode and strings that are not in the CSV yet. The fallback locale comes
 *     from `hyperion.locale` (the locale Magento resolved), then `locale`,
 *     then the store code; `it` / `it_IT` select the Italian catalog, any
 *     other locale selects the catalog of its language when one exists and
 *     `en_US` otherwise.
 *   - Missing key: `console.warn` in dev, render the key itself in
 *     production. NEVER render an empty string.
 *   - `{placeholder}` interpolation (no positional `%1`/`%s`).
 */
import enUS from '../i18n/en_US.json' with { type: 'json' };

type Catalog = Readonly<Record<string, string>>;

export interface I18nOptions {
    /** The locale Magento resolved for the request (`hyperion.locale`). */
    locale?: string | null;
    /** The store code, the fallback when no locale is given. */
    storeCode?: string | null;
    /**
     * Server rendered dictionary keyed by the English source string (or by
     * the `Hyperion_Checkout::` key); merged over the static catalog.
     */
    translations?: Catalog | null;
}

const DEFAULT_LOCALE = 'en_US';
const EMPTY: Catalog = Object.freeze({});

let activeCatalog: Catalog = enUS as Catalog;
const fallbackCatalog: Catalog = enUS as Catalog;
let runtimeTranslations: Catalog = EMPTY;
let activeLocale = DEFAULT_LOCALE;

/**
 * Static catalogs -- extend when a new JSON catalog gets wired. Vite
 * code-splits each dynamic import; the chunk of a locale only ships when
 * that locale is resolved at boot.
 */
const CATALOGS: Readonly<Record<string, () => Promise<{ default: Catalog }>>> = {
    en_US: async () => ({ default: enUS as Catalog }),
    it_IT: async () => {
        const mod = await import('../i18n/it_IT.json', { with: { type: 'json' } });
        return { default: mod.default as Catalog };
    },
};

/**
 * Install the runtime dictionary and the static catalog for the request.
 * A plain string is accepted for the previous `loadLocale(storeCode)` form.
 */
export async function loadLocale(options: I18nOptions | string): Promise<void> {
    const opts: I18nOptions = typeof options === 'string' ? { storeCode: options } : options;
    runtimeTranslations = isDictionary(opts.translations) ? opts.translations : EMPTY;
    activeLocale = resolveLocale(opts);
    const catalogLocale = resolveCatalogLocale(activeLocale);
    if (catalogLocale === null) {
        if (runtimeTranslations === EMPTY) {
            console.warn(
                `[hyperion-checkout] no i18n catalog for locale "${activeLocale}", falling back to en_US`
            );
        }
        activeCatalog = fallbackCatalog;
        return;
    }
    const mod = await CATALOGS[catalogLocale]();
    activeCatalog = mod.default;
}

/**
 * The locale the checkout runs in: `locale`, then the store code, mapped to a
 * `xx_YY` code (`it` -> `it_IT`, `en` -> `en_US`); `en_US` when neither is usable.
 */
export function resolveLocale(options: Pick<I18nOptions, 'locale' | 'storeCode'>): string {
    for (const candidate of [options.locale, options.storeCode]) {
        const normalized = normalizeLocale(candidate);
        if (normalized !== null) return normalized;
    }
    return DEFAULT_LOCALE;
}

/**
 * The static catalog that serves a locale: the exact locale, else the first
 * catalog of the same language (`it_CH` -> `it_IT`), else null.
 */
export function resolveCatalogLocale(locale: string): string | null {
    if (locale in CATALOGS) return locale;
    const language = locale.split('_')[0];
    const sameLanguage = Object.keys(CATALOGS).find((code) => code.split('_')[0] === language);
    return sameLanguage ?? null;
}

export function getActiveLocale(): string {
    return activeLocale;
}

export function t(
    key: string,
    params?: Readonly<Record<string, string | number>>
): string {
    let template = runtimeLookup(key) ?? activeCatalog[key] ?? fallbackCatalog[key];
    if (template === undefined) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(`[hyperion-checkout] missing translation for key "${key}"`);
        }
        template = key;
    }
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const v = params[name];
        return v === undefined ? match : String(v);
    });
}

/**
 * Test-only setter. Unit tests install a deterministic catalog to
 * avoid coupling to CSVs; the runtime dictionary is reset unless given.
 */
export function setActiveCatalogForTests(
    catalog: Catalog,
    locale = DEFAULT_LOCALE,
    translations: Catalog = EMPTY
): void {
    activeCatalog = catalog;
    activeLocale = locale;
    runtimeTranslations = translations;
}

function runtimeLookup(key: string): string | undefined {
    if (runtimeTranslations === EMPTY) return undefined;
    const byKey = runtimeTranslations[key];
    if (typeof byKey === 'string' && byKey !== '') return byKey;
    const source = fallbackCatalog[key];
    if (source === undefined) return undefined;
    const bySource = runtimeTranslations[source];
    return typeof bySource === 'string' && bySource !== '' ? bySource : undefined;
}

function normalizeLocale(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().replace('-', '_');
    if (/^[a-z]{2,3}_[A-Za-z]{2,4}$/.test(trimmed)) {
        const [language, region] = trimmed.split('_');
        return `${language}_${region.toUpperCase()}`;
    }
    switch (trimmed) {
        case 'en':
            return 'en_US';
        case 'it':
            return 'it_IT';
        default:
            return null;
    }
}

function isDictionary(value: unknown): value is Catalog {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

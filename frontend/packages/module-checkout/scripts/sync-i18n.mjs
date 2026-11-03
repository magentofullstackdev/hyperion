#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * sync-i18n.mjs keeps the bundle's JSON catalog and the Magento
 * `i18n/<locale>.csv` files in lock-step.
 *
 * The bundle stores translations as JSON keyed by the canonical
 * `Hyperion_Checkout::<key>` form so the runtime `t()` helper has
 * O(1) lookup. Magento's translation pipeline (admin labels, PHP
 * `__()` calls, theme translation packs) reads from
 * `i18n/<locale>.csv`. This script reconciles the two so both views
 * stay authoritative.
 *
 * Direction: JSON → CSV.
 *   - For every `Hyperion_Checkout::<key>` entry in the JSON catalog,
 *     write a `"<value>","<value>"` row in the CSV.
 *   - PHP-side strings already in the CSV (admin labels, exception
 *     phrases) are preserved (we only add/update rows whose key
 *     matches a known JSON value; we never delete).
 *
 * Run: `pnpm --filter @magentofullstackdev/hyperion-checkout i18n:sync`
 * (also executed automatically by the package's `build` script).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '../../..');
// packageRoot/../../.. is the repository root.
const moduleI18nDir = resolve(
    repoRoot,
    'app/code/Magentofullstackdev/HyperionCheckout/i18n'
);

const LOCALES = [
    { code: 'en_US', json: resolve(packageRoot, 'src/i18n/en_US.json') },
    { code: 'it_IT', json: resolve(packageRoot, 'src/i18n/it_IT.json') },
];

function csvEscape(value) {
    if (value.includes('"') || value.includes(',') || /\s/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Parses the whole CSV text (RFC 4180 shape, as Magento's `i18n:collect-phrases`
 * writes it): fields are separated by commas, a quoted field may contain
 * commas, doubled quotes AND line breaks. Splitting the text on newlines
 * first, as an earlier version did, tore the multi-line admin comment of
 * `etc/adminhtml/system.xml` into garbage rows on every build.
 */
export function parseExistingCsv(raw) {
    const rows = new Map();
    let row = [];
    let cur = '';
    let inQuotes = false;
    let quotedField = false;
    const endField = () => { row.push(cur); cur = ''; quotedField = false; };
    const endRow = () => {
        endField();
        const empty = row.length === 1 && row[0].trim().length === 0;
        if (!empty && row.length >= 2) rows.set(row[0], row[1]);
        row = [];
    };
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inQuotes) {
            if (c === '"' && raw[i + 1] === '"') { cur += '"'; i++; continue; }
            if (c === '"') { inQuotes = false; continue; }
            cur += c;
            continue;
        }
        if (c === '"' && cur.length === 0 && !quotedField) { inQuotes = true; quotedField = true; continue; }
        if (c === ',') { endField(); continue; }
        if (c === '\r' && raw[i + 1] === '\n') { continue; }
        if (c === '\n') { endRow(); continue; }
        cur += c;
    }
    if (cur.length > 0 || row.length > 0) endRow();
    return rows;
}

async function loadCatalog(path) {
    if (!existsSync(path)) return null;
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
}

async function syncLocale(locale, baseCatalog) {
    const catalog = await loadCatalog(locale.json);
    if (!catalog) {
        console.warn(`[sync-i18n] skipping ${locale.code}: ${locale.json} not found`);
        return;
    }
    const csvPath = resolve(moduleI18nDir, `${locale.code}.csv`);
    const existing = existsSync(csvPath)
        ? parseExistingCsv(await readFile(csvPath, 'utf8'))
        : new Map();

    let added = 0;
    let updated = 0;
    // Magento's CSV is keyed by the *English source* string. For non-
    // English locales we use the corresponding en_US value as the
    // source key so every locale's CSV references the same row.
    for (const [key, value] of Object.entries(catalog)) {
        if (typeof value !== 'string') continue;
        if (!key.startsWith('Hyperion_Checkout::')) continue;
        const sourceKey = locale.code === 'en_US' ? value : (baseCatalog?.[key] ?? null);
        if (!sourceKey) continue;
        const previous = existing.get(sourceKey);
        existing.set(sourceKey, value);
        if (previous === undefined) added++;
        else if (previous !== value) updated++;
    }

    const lines = [];
    for (const [k, v] of existing.entries()) {
        lines.push(`${csvEscape(k)},${csvEscape(v)}`);
    }
    const out = lines.join('\n') + '\n';
    await writeFile(csvPath, out, 'utf8');
    console.log(
        `[sync-i18n] ${locale.code}.csv: ${existing.size} rows ` +
        `(added: ${added}, updated: ${updated})`
    );
}

async function main() {
    const enLocale = LOCALES.find((l) => l.code === 'en_US');
    const baseCatalog = enLocale ? await loadCatalog(enLocale.json) : null;
    for (const locale of LOCALES) {
        await syncLocale(locale, baseCatalog);
    }
}

// Run only when executed as a script (the parser above is importable by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error('[sync-i18n] failed:', err);
        process.exit(1);
    });
}

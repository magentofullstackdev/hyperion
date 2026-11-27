#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * bundle-budget.mjs measures what the checkout downloads before it mounts
 * and compares it with the budget in `bundle-budget.json`.
 *
 * The boot set is the entry (`src/main.ts`), every chunk it reaches through
 * static imports, the chunk that holds `<checkout-app>` (a dynamic import
 * of the entry, recognized like `Block\Checkout` does: chunk name
 * `checkout-app` or file `assets/checkout-app-<hash>.js`) and that chunk's
 * static imports. The chunks only some stores or visitors load (optional
 * sections, gateways, locale catalogs) are not part of it.
 *
 * Size = the sum of `zlib.gzipSync(file, { level: 9 })` per file. The
 * figure depends on the zlib build of the Node.js runtime by a few bytes,
 * so the baseline is always recorded by this script.
 *
 * Usage (from the package directory):
 *   node scripts/bundle-budget.mjs              compare, exit 1 above baselineGzip + allowance
 *   node scripts/bundle-budget.mjs --record     write the measured total as baselineGzip
 *   node scripts/bundle-budget.mjs --manifest <path/to/.vite/manifest.json>
 *                                               measure another build (files resolve
 *                                               against the parent of `.vite/`)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '../../..');
const DEFAULT_MANIFEST = resolve(
    repoRoot,
    'app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/.vite/manifest.json'
);
const BUDGET_FILE = resolve(packageDir, 'bundle-budget.json');
const ENTRY_KEY = 'src/main.ts';
const APP_CHUNK_NAME = 'checkout-app';
const APP_CHUNK_FILE = /^assets\/checkout-app-[A-Za-z0-9_-]+\.js$/;

function parseArgs(argv) {
    const args = { record: false, manifest: DEFAULT_MANIFEST };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--record') {
            args.record = true;
        } else if (arg === '--manifest') {
            const value = argv[i + 1];
            if (!value) throw new Error('--manifest needs a path');
            args.manifest = resolve(process.cwd(), value);
            i += 1;
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    return args;
}

function findAppChunkKey(manifest, entry) {
    for (const key of entry.dynamicImports ?? []) {
        const chunk = manifest[key];
        if (!chunk || typeof chunk.file !== 'string') continue;
        if (chunk.name === APP_CHUNK_NAME || APP_CHUNK_FILE.test(chunk.file)) return key;
    }
    return null;
}

function collectStaticImports(manifest, key, seen, files) {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk || typeof chunk.file !== 'string') {
        throw new Error(`manifest has no file for "${key}"`);
    }
    files.push(chunk.file);
    for (const imported of chunk.imports ?? []) {
        collectStaticImports(manifest, imported, seen, files);
    }
}

/** The files of the boot set, in discovery order. */
export function bootSetFiles(manifest) {
    const entry = manifest[ENTRY_KEY];
    if (!entry) throw new Error(`manifest has no "${ENTRY_KEY}" entry`);
    const appKey = findAppChunkKey(manifest, entry);
    if (appKey === null) throw new Error('manifest has no checkout-app chunk among the entry\'s dynamic imports');
    const seen = new Set();
    const files = [];
    collectStaticImports(manifest, ENTRY_KEY, seen, files);
    collectStaticImports(manifest, appKey, seen, files);
    return files;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
    const webDir = resolve(dirname(args.manifest), '..');

    const rows = bootSetFiles(manifest).map((file) => {
        const bytes = readFileSync(resolve(webDir, file));
        return { file, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
    });
    const total = rows.reduce((sum, row) => ({ raw: sum.raw + row.raw, gzip: sum.gzip + row.gzip }), { raw: 0, gzip: 0 });

    const width = Math.max(5, ...rows.map((row) => row.file.length));
    const line = (file, raw, gzip) => `${file.padEnd(width)}  ${String(raw).padStart(9)}  ${String(gzip).padStart(9)}`;
    console.log(line('file', 'raw B', 'gzip B'));
    for (const row of rows) console.log(line(row.file, row.raw, row.gzip));
    console.log(line('total', total.raw, total.gzip));

    if (args.record) {
        let budget = { allowance: 3072 };
        try {
            budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
        } catch {
            // No budget yet: start one with the default allowance.
        }
        budget = { baselineGzip: total.gzip, allowance: budget.allowance ?? 3072 };
        writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 4)}\n`);
        console.log(`recorded baselineGzip ${total.gzip} in ${BUDGET_FILE}`);
        return 0;
    }

    const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
    const limit = budget.baselineGzip + budget.allowance;
    const delta = total.gzip - budget.baselineGzip;
    console.log(`baseline ${budget.baselineGzip} + allowance ${budget.allowance} = limit ${limit}; measured ${total.gzip} (${delta >= 0 ? '+' : ''}${delta})`);
    if (total.gzip > limit) {
        console.error(`boot set over budget by ${total.gzip - limit} B gzip`);
        return 1;
    }
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = main();
    } catch (err) {
        console.error(`bundle-budget: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
    }
}

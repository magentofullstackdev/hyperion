#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * check-pack.mjs packs the checkout package the way it is published
 * (`pnpm pack`), extracts the tarball and checks what a consumer gets: the
 * public types, the testing kit and its harness, the config fixtures, and
 * no test, dev only or excluded file. The testing kit must import nothing
 * but its own files and the public types (no `lit`, no signals, nothing
 * of `src/`).
 *
 * Usage (from the package directory):
 *   node scripts/check-pack.mjs            pack into a temporary directory, exit 1 on a problem
 *   node scripts/check-pack.mjs --keep     keep the temporary directory and print its path
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keep = process.argv.includes('--keep');

const REQUIRED = [
    'package.json',
    'LICENSE',
    'README.md',
    'extension-api.d.ts',
    'src/main.ts',
    'testing/index.js',
    'testing/index.d.ts',
    'testing/context.js',
    'testing/mount.js',
    'testing/contract.js',
    'testing/harness.html',
    'testing/harness.js',
    'src/fixtures/checkoutConfig.guest.json',
    'src/fixtures/checkoutConfig.customer.json',
    'src/fixtures/checkoutConfig.virtual.json',
];

const FORBIDDEN = [
    [/(^|\/)__tests__\//, 'a test directory'],
    [/\.(test|spec)\.[cm]?[jt]s$/, 'a test file'],
    [/^src\/fixtures\/payment\.braintree\.json$/, 'the hand written Braintree fixture'],
    [/^src\/styles\/dev-harness\.css$/, 'the dev harness stylesheet'],
    [/^testing\/(tsconfig\.json|vitest\.config\.js)$/, 'a testing kit dev file'],
    [/^(index\.html|vite\.config\.ts|vitest\.config\.ts|tsconfig\.json|bundle-budget\.json|scripts\/)/, 'a build or dev file'],
    [/(^|\/)node_modules\//, 'node_modules'],
];

/** @param {string} dir */
function listFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) out.push(...listFiles(path));
        else out.push(path);
    }
    return out;
}

/** @param {string} text */
function importSpecifiers(text) {
    return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

const workDir = mkdtempSync(join(tmpdir(), 'hyperion-checkout-pack-'));
const problems = [];
try {
    execFileSync('pnpm', ['pack', '--pack-destination', workDir], { cwd: packageDir, stdio: ['ignore', 'ignore', 'inherit'] });
    const tarball = readdirSync(workDir).find((name) => name.endsWith('.tgz'));
    if (!tarball) throw new Error('pnpm pack wrote no tarball');
    execFileSync('tar', ['-xzf', join(workDir, tarball), '-C', workDir]);
    const root = join(workDir, 'package');
    const files = listFiles(root).map((path) => relative(root, path).split('\\').join('/')).sort();

    for (const required of REQUIRED) {
        if (!files.includes(required)) problems.push(`missing ${required}`);
    }
    for (const file of files) {
        for (const [pattern, label] of FORBIDDEN) {
            if (pattern.test(file)) problems.push(`${file} is ${label}`);
        }
    }
    for (const file of files.filter((name) => /^testing\/.*\.(js|d\.ts)$/.test(name) && !name.endsWith('config.js'))) {
        for (const name of importSpecifiers(readFileSync(join(root, file), 'utf8'))) {
            if (!/^\.\/[\w.-]+\.js$/.test(name) && name !== '../extension-api.js') {
                problems.push(`${file} imports ${name}`);
            }
        }
    }
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
        const targets = typeof target === 'string' ? [target] : Object.values(target);
        for (const path of targets) {
            const clean = String(path).replace(/^\.\//, '');
            if (clean.includes('*')) {
                const prefix = clean.slice(0, clean.indexOf('*'));
                if (!files.some((file) => file.startsWith(prefix))) problems.push(`export ${subpath} matches no file`);
            } else if (!files.includes(clean)) {
                problems.push(`export ${subpath} points at the missing ${clean}`);
            }
        }
    }

    console.log(`${tarball}: ${files.length} files`);
    for (const file of files) console.log(`  ${file}`);
} finally {
    if (keep) console.log(`kept ${workDir}`);
    else rmSync(workDir, { recursive: true, force: true });
}

if (problems.length > 0) {
    for (const problem of problems) console.error(`check-pack: ${problem}`);
    process.exit(1);
}
console.log('check-pack: the tarball carries what a consumer needs and nothing else');

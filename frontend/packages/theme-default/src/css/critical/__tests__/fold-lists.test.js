// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The fold lists of the critical sheets: Tailwind reads an entry that matches
// no file as nothing, so a template that moves (to a module, to another
// directory) silently takes its classes out of the critical sheet and the
// fold shifts when the full sheet arrives. Every entry must match a file.

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { FOLD_CATEGORY, FOLD_CMS, FOLD_COMMON, FOLD_PRODUCT } from '../tailwind.ts';

/** The directory the entries are relative to (`content.relative`). */
const CRITICAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A glob of the lists as a regular expression: `**` (with its slash), `*`, `?` and `{a,b}`. */
function globToRegExp(glob) {
    let out = '';
    let braces = 0;
    for (let i = 0; i < glob.length; i += 1) {
        const char = glob[i];
        if (char === '*' && glob[i + 1] === '*') {
            const slash = glob[i + 2] === '/';
            out += slash ? '(?:.*/)?' : '.*';
            i += slash ? 2 : 1;
        } else if (char === '*') {
            out += '[^/]*';
        } else if (char === '?') {
            out += '[^/]';
        } else if (char === '{') {
            braces += 1;
            out += '(?:';
        } else if (char === '}' && braces > 0) {
            braces -= 1;
            out += ')';
        } else if (char === ',' && braces > 0) {
            out += '|';
        } else {
            out += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${out}$`);
}

function* filesUnder(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* filesUnder(path);
        else yield path;
    }
}

/** True when at least one file matches the entry. */
function matchesAFile(entry) {
    const absolute = resolve(CRITICAL_DIR, entry);
    const magic = absolute.search(/[*?{]/);
    if (magic === -1) return existsSync(absolute);
    const base = absolute.slice(0, absolute.lastIndexOf('/', magic));
    if (!existsSync(base)) return false;
    const pattern = globToRegExp(absolute);
    for (const file of filesUnder(base)) {
        if (pattern.test(file)) return true;
    }
    return false;
}

describe('critical sheet fold lists', () => {
    test.each([
        ['common', FOLD_COMMON],
        ['home and CMS', FOLD_CMS],
        ['category and search', FOLD_CATEGORY],
        ['product', FOLD_PRODUCT],
    ])('every entry of the %s list matches a file', (_name, list) => {
        expect(list.filter((entry) => !matchesAFile(entry))).toEqual([]);
    });

    test('the product fold reads the express slot template of the checkout module', () => {
        expect(FOLD_PRODUCT.some((entry) => entry.includes('/HyperionCheckout/view/frontend/templates/express/'))).toBe(true);
    });
});

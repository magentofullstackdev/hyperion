// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * What the published package carries must stay neutral and self
 * contained: the config fixtures name no real host, mailbox or key, and
 * the testing kit imports nothing but its own files and the public types.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const testingDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(testingDir, '..');
const fixturesDir = join(packageDir, 'src', 'fixtures');

/** @type {{ files: string[] }} */
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

/** Hosts a shipped file may name: reserved example names and public payment provider hosts. */
const ALLOWED_HOST = /^(?:[a-z0-9-]+\.)*(?:example|example\.com|example\.net|example\.org|paypal\.com|paypalobjects\.com|braintreegateway\.com)$/;
const ALLOWED_MAILBOX_DOMAIN = /^(?:[a-z0-9-]+\.)*example(?:\.com|\.net|\.org)?$/;

/** Wording that belongs to a private workspace, never to a published file. */
const PRIVATE_WORDING = [
    /d[e]vdoc/i,
    /\bspec [0-9]{3}\b/i,
    /hyperion2[0-9]{2}/i,
    /\bthe s[l]ot\b/i,
    /\bthe owner\b/i,
    /\.local\b/i,
    /\blocalhost\b/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Keys whose value must never be a real credential. */
const SECRET_KEY = /(?:secret|password(?!_hash$)|private_?key|api_?key|access_?token|client_?secret)$/i;

/** The fixtures `files` of package.json publishes. */
function shippedFixtures() {
    const excluded = new Set(manifest.files
        .filter((entry) => entry.startsWith('!src/fixtures/'))
        .map((entry) => entry.slice('!src/fixtures/'.length)));
    if (manifest.files.includes('!src/fixtures')) return [];
    return readdirSync(fixturesDir).filter((name) => !excluded.has(name)).map((name) => join(fixturesDir, name));
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function shippedTestingFiles(dir = testingDir) {
    /** @type {string[]} */
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...shippedTestingFiles(path));
        else out.push(path);
    }
    return out;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function contentProblems(text) {
    /** @type {string[]} */
    const problems = [];
    for (const match of text.matchAll(/\bhttps?:\/\/([^/\s"'`<>\\:]+)/gi)) {
        const host = String(match[1]).toLowerCase();
        if (!ALLOWED_HOST.test(host)) problems.push(`host ${host}`);
    }
    for (const match of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
        const domain = String(match[1]).toLowerCase();
        if (!ALLOWED_MAILBOX_DOMAIN.test(domain)) problems.push(`mailbox at ${domain}`);
    }
    for (const match of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
        problems.push(`IP address ${match[0]}`);
    }
    for (const pattern of PRIVATE_WORDING) {
        if (pattern.test(text)) problems.push(`wording ${pattern}`);
    }
    return problems;
}

/**
 * @param {unknown} node
 * @param {string} path
 * @param {string[]} problems
 */
function secretProblems(node, path, problems) {
    if (Array.isArray(node)) {
        node.forEach((child, index) => secretProblems(child, `${path}[${index}]`, problems));
    } else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
            if (SECRET_KEY.test(key) && typeof value === 'string' && value !== '') problems.push(`${path}.${key} carries a value`);
            secretProblems(value, `${path}.${key}`, problems);
        }
    }
}

describe('published config fixtures', () => {
    it('ship the three checkoutConfig captures', () => {
        const names = shippedFixtures().map((path) => relative(fixturesDir, path));
        expect(names).toEqual(expect.arrayContaining([
            'checkoutConfig.customer.json',
            'checkoutConfig.guest.json',
            'checkoutConfig.virtual.json',
        ]));
    });

    for (const path of shippedFixtures()) {
        const name = relative(packageDir, path);
        it(`${name} names no real host, mailbox, address or private wording`, () => {
            expect(contentProblems(readFileSync(path, 'utf8'))).toEqual([]);
        });
        if (path.endsWith('.json')) {
            it(`${name} carries no credential value`, () => {
                /** @type {string[]} */
                const problems = [];
                secretProblems(JSON.parse(readFileSync(path, 'utf8')), '$', problems);
                expect(problems).toEqual([]);
            });
        }
    }
});

describe('published testing kit', () => {
    const files = shippedTestingFiles();
    const runtime = files.filter((path) => /\.(?:js|d\.ts)$/.test(path) && !/config\.js$/.test(path));

    it('ships its entry points', () => {
        const names = files.map((path) => relative(testingDir, path));
        expect(names).toEqual(expect.arrayContaining(['index.js', 'index.d.ts', 'harness.html', 'harness.js']));
    });

    for (const path of runtime) {
        it(`${relative(packageDir, path)} imports only the kit and the public types`, () => {
            const text = readFileSync(path, 'utf8');
            const imported = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)]
                .map((match) => String(match[1]));
            const foreign = imported.filter((name) => !/^\.\/[\w.-]+\.js$/.test(name) && name !== '../extension-api.js');
            expect(foreign).toEqual([]);
            expect(/\blit\b['"/]|@lit-labs|signal-polyfill/.test(imported.join(' '))).toBe(false);
        });
    }

    for (const path of files) {
        it(`${relative(packageDir, path)} names no real host or private wording`, () => {
            expect(contentProblems(readFileSync(path, 'utf8'))).toEqual([]);
        });
    }
});

describe('content check', () => {
    it('flags a local host, a real mailbox, an IP address and workspace wording', () => {
        expect(contentProblems('{"a":"https://store.local/x","b":"jane@corp.com","c":"10.0.0.1","d":"see d' + 'evdoc"}')).toEqual([
            'host store.local',
            'mailbox at corp.com',
            'IP address 10.0.0.1',
            'wording /d[e]vdoc/i',
            'wording /\\.local\\b/i',
        ]);
    });

    it('accepts reserved example hosts and sample data mailboxes', () => {
        expect(contentProblems('https://shop.example/checkout/ roni_cost@example.com https://www.paypalobjects.com/x.png')).toEqual([]);
    });

    it('flags a credential value', () => {
        /** @type {string[]} */
        const problems = [];
        secretProblems({ payment: { gateway: { client_secret: 'abc', password_hash: null, apiKey: '' } } }, '$', problems);
        expect(problems).toEqual(['$.payment.gateway.client_secret carries a value']);
    });
});

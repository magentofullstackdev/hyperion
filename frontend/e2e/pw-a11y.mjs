// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Accessibility gate: axe-core, injected
// from the workspace's devDependency, scans the home page, a category, a
// product page, the login, registration and contact forms and the cart with
// its default rule set (every rule that is not experimental: WCAG 2.x A / AA
// and the best practices). Any `critical` or `serious` violation fails the
// run; `moderate` and `minor` ones are listed as warnings. A page error
// fails the page too.
// node e2e/pw-a11y.mjs <baseUrl>
// PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host that is
// not in /etc/hosts.
import { createRequire } from 'node:module';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '');
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl>');
    process.exit(2);
}
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});
let axePath;
try {
    axePath = require.resolve('axe-core/axe.min.js');
} catch (_e) {
    console.error('axe-core is not installed: run `pnpm install --frozen-lockfile` in the frontend workspace (`frontend/`) first.');
    process.exit(2);
}

const PAGES = [
    ['home', '/'],
    ['category', u('/women.html')],
    ['product', u('/joust-duffle-bag.html')],
    ['login', '/customer/account/login/'],
    ['register', '/customer/account/create/'],
    ['contact', '/contact/'],
    ['cart', '/checkout/cart/'],
];
const FAILING = new Set(['critical', 'serious']);

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const describeViolation = (v) => {
    const targets = v.nodes.slice(0, 3).map((n) => (Array.isArray(n.target) ? n.target.join(' >>> ') : String(n.target)));
    return `${v.id} [${v.impact}] ${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'}: ${targets.join(' | ')}`;
};

const browser = await chromium.launch({ headless: true, ...launchOptions() });
const warnings = [];
try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));

    for (const [name, path] of PAGES) {
        pageErrors.length = 0;
        const response = await page.goto(base + path, { waitUntil: 'networkidle' });
        const status = response ? response.status() : 0;
        // The header state and the component chunks arrive after load.
        await page.evaluate(() => Promise.all(
            [...new Set([...document.querySelectorAll('*')].map((el) => el.localName).filter((n) => n.startsWith('hyperion-')))]
                .map((n) => Promise.race([customElements.whenDefined(n), new Promise((r) => setTimeout(r, 3000))]))
        ));
        await sleep(500);
        await page.addScriptTag({ path: axePath });
        const axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, { resultTypes: ['violations'] });
            return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target })) }));
        });
        const failing = axe.filter((v) => FAILING.has(v.impact));
        const minor = axe.filter((v) => !FAILING.has(v.impact));
        for (const v of failing) console.log(`  VIOLATION  ${name} ${path}: ${describeViolation(v)}  (${v.help})`);
        for (const v of minor) {
            const line = `${name} ${path}: ${describeViolation(v)}  (${v.help})`;
            warnings.push(line);
            console.log(`  WARN       ${line}`);
        }
        check(`${name} ${path}: HTTP ${status}, no critical or serious axe violation`, status === 200 && failing.length === 0, failing.length ? `${failing.length} failing rule${failing.length === 1 ? '' : 's'}, ${minor.length} warning${minor.length === 1 ? '' : 's'}` : `${axe.length} warning${axe.length === 1 ? '' : 's'}`);
        check(`${name} ${path}: no page errors`, pageErrors.length === 0, pageErrors.join(' | '));
    }
    await ctx.close();
} catch (e) {
    check('script completed', false, e.message);
} finally {
    await browser.close();
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed, warnings: warnings.length }, null, 2));
process.exit(failed.length ? 1 : 0);

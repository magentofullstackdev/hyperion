// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Accessibility gate: axe-core, injected
// from the workspace's devDependency, scans the home page, a category, a
// product page, the login, registration and contact forms and the cart with
// its default rule set (every rule that is not experimental: WCAG 2.x A / AA
// and the best practices). Any `critical` or `serious` violation fails the
// run; `moderate` and `minor` ones are listed as warnings. A page error
// fails the page too. The checkout follows with a product in the cart, scanned
// twice: as it loads, and with the billing address form open next to the
// shipping one after a press on Place Order with nothing filled in (every
// error message showing). There a duplicate id or a second main landmark
// fails the run whatever impact the rule carries.
// node e2e/pw-a11y.mjs <baseUrl> [--only=pages|checkout] [--dump=<file>]
//   --dump writes every violation with its nodes (selector, HTML, failure summary) to a JSON file
import { readFileSync, writeFileSync } from 'node:fs';
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
// Options are written --name=value.
const option = (name) => (process.argv.find((a) => a.startsWith(name + '=')) ?? '').slice(name.length + 1);
const only = option('--only');
const dumpFile = option('--dump');
const dump = [];
const CHECKOUT_PRODUCT = u('/fusion-backpack.html');
// Rules the checkout must pass at any impact: the two address forms share field names, and the theme owns the main landmark.
const CHECKOUT_STRICT = new Set(['duplicate-id', 'duplicate-id-aria', 'duplicate-id-active', 'landmark-no-duplicate-main', 'landmark-one-main']);

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

    const waitForComponents = () => page.evaluate(() => Promise.all(
        [...new Set([...document.querySelectorAll('*')].map((el) => el.localName).filter((n) => n.startsWith('hyperion-')))]
            .map((n) => Promise.race([customElements.whenDefined(n), new Promise((r) => setTimeout(r, 3000))]))
    ));
    const scan = async (name, path, status, strict = new Set()) => {
        await sleep(500);
        // A page under an enforced content security policy refuses the script tag: the source is evaluated there.
        if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: axePath }).catch(() => page.evaluate(readFileSync(axePath, 'utf8')));
        const axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, { resultTypes: ['violations'] });
            return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) }));
        });
        dump.push({ name, path, violations: axe });
        const failing = axe.filter((v) => FAILING.has(v.impact) || strict.has(v.id));
        const minor = axe.filter((v) => !failing.includes(v));
        for (const v of failing) {
            console.log(`  VIOLATION  ${name} ${path}: ${describeViolation(v)}  (${v.help})`);
            for (const n of v.nodes.slice(0, 12)) console.log(`             ${(Array.isArray(n.target) ? n.target.join(' >>> ') : String(n.target))}  ${String(n.html).replace(/\s+/g, ' ').slice(0, 260)}  [${String(n.failureSummary).replace(/\s+/g, ' ').slice(0, 240)}]`);
        }
        for (const v of minor) {
            const line = `${name} ${path}: ${describeViolation(v)}  (${v.help})`;
            warnings.push(line);
            console.log(`  WARN       ${line}`);
        }
        check(`${name} ${path}: HTTP ${status}, no critical or serious axe violation`, status === 200 && failing.length === 0, failing.length ? `${failing.length} failing rule${failing.length === 1 ? '' : 's'}, ${minor.length} warning${minor.length === 1 ? '' : 's'}` : `${axe.length} warning${axe.length === 1 ? '' : 's'}`);
        check(`${name} ${path}: no page errors`, pageErrors.length === 0, pageErrors.join(' | '));
    };

    for (const [name, path] of only === 'checkout' ? [] : PAGES) {
        pageErrors.length = 0;
        const response = await page.goto(base + path, { waitUntil: 'networkidle' });
        const status = response ? response.status() : 0;
        // The header state and the component chunks arrive after load.
        await waitForComponents();
        await scan(name, path, status);
    }

    // ---- the checkout, with a product in the cart
    if (only !== 'pages') {
        try {
            pageErrors.length = 0;
            await page.goto(base + CHECKOUT_PRODUCT, { waitUntil: 'networkidle' });
            await Promise.all([
                page.waitForResponse((r) => /checkout\/cart\/add/.test(r.url()), { timeout: 30000 }),
                page.click('#product_addtocart_form button[type="submit"]'),
            ]);
            await sleep(800);
            const response = await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
            const status = response ? response.status() : 0;
            const placeOrder = page.locator('[data-hyperion-place-order] button');
            await placeOrder.waitFor({ timeout: 45000 });
            await waitForComponents();
            await scan('checkout', '/checkout/', status, CHECKOUT_STRICT);

            // Both address forms, then the press that reveals every error of the incomplete forms.
            pageErrors.length = 0;
            const sameAsShipping = page.locator('hc-checkbox[name="billing_same_as_shipping"] input[type="checkbox"]');
            if (await sameAsShipping.isChecked()) await sameAsShipping.click();
            const billingOpen = await page.waitForSelector('#hc-billing-firstname', { timeout: 15000 }).then(() => true).catch(() => false);
            // The control is aria-disabled until the forms are complete and still answers a press.
            await placeOrder.click({ force: true });
            const errorsShown = await page.waitForSelector('checkout-app [aria-invalid="true"]', { timeout: 15000 }).then(() => true).catch(() => false);
            await sleep(700);
            const state = await page.evaluate(() => ({
                forms: document.querySelectorAll('checkout-app address-form').length,
                invalid: document.querySelectorAll('checkout-app [aria-invalid="true"]').length,
                focus: document.activeElement ? document.activeElement.localName + (document.activeElement.id ? '#' + document.activeElement.id : '') : '',
            }));
            check('checkout /checkout/: the billing address form opens next to the shipping one and a press on Place Order shows the errors of the incomplete forms', billingOpen && errorsShown && state.forms === 2, JSON.stringify(state));
            await scan('checkout, both address forms and the errors of an early press', '/checkout/', status, CHECKOUT_STRICT);
        } catch (e) {
            check('checkout scans completed', false, e.message);
        }
    }
    await ctx.close();
} catch (e) {
    check('script completed', false, e.message);
} finally {
    await browser.close();
}
if (dumpFile) {
    writeFileSync(dumpFile, JSON.stringify(dump, null, 2));
    console.log(`violations written to ${dumpFile}`);
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed, warnings: warnings.length }, null, 2));
process.exit(failed.length ? 1 : 0);

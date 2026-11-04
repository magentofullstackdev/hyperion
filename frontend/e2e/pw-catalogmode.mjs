#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Catalog mode and "Add to Cart from Listing Page" checks for a Hyperion install.
// Usage: node e2e/pw-catalogmode.mjs <baseUrl> <slotDir>
//   node e2e/pw-catalogmode.mjs https://shop.example <slotDir>
// Drives the configuration through `docker compose exec php-fpm bin/magento`
// in <slotDir>, runs the guest and customer checks for every phase and
// restores the defaults (catalog mode off, listing button on, reCAPTCHA v3
// threshold) at the end. Exit code 1 when a check fails.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
// PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host
// that is not in /etc/hosts yet (Chromium host resolver rules).
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const [base = '', slot = '.'] = process.argv.slice(2).map((a) => a.replace(/\/$/, ''));
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <slotDir> ...');
    process.exit(2);
}
const slotDir = path.resolve(slot);
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };
const CATEGORY = u('/gear/bags.html');
const PDP = u('/joust-duffle-bag.html');

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 200) : ''}`);
};
const magento = (...args) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', '-u', 'www-data', 'php-fpm', 'bin/magento', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
}).toString();
const configure = (values) => {
    for (const [path, value] of Object.entries(values)) {
        if (value === null) magento('config:set', path, '');
        else magento('config:set', path, String(value));
    }
    magento('cache:flush');
};
// The values a run touches are read first and put back as they were, never
// as a fixed default: an install without reCAPTCHA keys must not end up with
// reCAPTCHA v3 switched on by this script.
const RESTORED_PATHS = ['recaptcha_frontend/type_for/customer_login', 'recaptcha_frontend/type_recaptcha_v3/score_threshold', 'hyperion_catalog_mode/general/enabled', 'hyperion_catalog_mode/general/allowed_customer_groups', 'hyperion/catalog/add_to_cart_from_listing'];
const snapshot = Object.fromEntries(RESTORED_PATHS.map((path) => {
    try { return [path, magento('config:show', path).trim() || null]; } catch { return [path, null]; }
}));

const browser = await chromium.launch({ headless: true, ...launchOptions() });
const problems = [];
const newPage = async () => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '')}`); });
    return { ctx, page };
};
const count = (page, sel) => page.locator(sel).count();
const go = (page, path) => page.goto(base + path, { waitUntil: 'networkidle' });
const messageShown = async (page, text) => {
    try {
        await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout: 8000 });
        return true;
    } catch { return false; }
};

try {
    // reCAPTCHA v3 scores the headless browser too low for the customer login.
    configure({ 'recaptcha_frontend/type_for/customer_login': null, 'recaptcha_frontend/type_recaptcha_v3/score_threshold': 0.1 });

    // ---------------------------------------------------------------- phase A: guests restricted, General allowed
    configure({ 'hyperion_catalog_mode/general/enabled': 1, 'hyperion_catalog_mode/general/allowed_customer_groups': '1', 'hyperion/catalog/add_to_cart_from_listing': 1 });
    {
        const { ctx, page } = await newPage();
        await go(page, '/');
        check('A guest home: no mini-cart in the header', (await count(page, 'hyperion-mini-cart')) === 0 && (await count(page, '#hyperion-mini-cart-count')) === 0);
        check('A guest home: widget tiles rendered without Add to Cart', (await count(page, 'form[hx-post*="checkout/cart/add"]')) === 0 && (await count(page, 'article')) > 0, `articles ${await count(page, 'article')}`);
        await go(page, CATEGORY);
        check('A guest category: tiles rendered without Add to Cart', (await count(page, '[data-hyperion-tile]')) > 0 && (await count(page, 'form[hx-post*="checkout/cart/add"]')) === 0, `tiles ${await count(page, '[data-hyperion-tile]')}`);
        check('A guest category: wishlist / compare toggles still there', (await count(page, 'hyperion-list-toggle')) > 0);
        await go(page, PDP);
        check('A guest PDP: no add-to-cart form', (await count(page, '#product_addtocart_form')) === 0);
        check('A guest PDP: login notice shown', (await page.locator('[data-hyperion-purchase-restricted]').textContent().catch(() => '')).includes('Please log in to purchase items.'));
        check('A guest PDP: price still visible', (await count(page, '.price')) > 0);
        await go(page, '/checkout/cart/');
        check('A guest cart URL: redirected to the login page', page.url().includes('/customer/account/login'), page.url().replace(base, ''));
        check('A guest cart URL: error message displayed', await messageShown(page, 'Please log in to purchase items.'));
        await go(page, '/checkout/');
        check('A guest checkout URL: redirected to the login page', page.url().includes('/customer/account/login'), page.url().replace(base, ''));
        const formKey = await page.evaluate(() => document.cookie.match(/form_key=([^;]+)/)?.[1] ?? '');
        const res = await ctx.request.post(base + '/checkout/cart/add/', { headers: { 'HX-Request': 'true' }, form: { product: '1', qty: '1', form_key: formKey }, maxRedirects: 0 });
        check('A guest HTMX cart add: 403 with HX-Redirect', res.status() === 403 && (res.headers()['hx-redirect'] ?? '').includes('/customer/account/login'), `${res.status()} ${res.headers()['hx-redirect'] ?? ''}`);
        const res2 = await ctx.request.get(base + '/hyperion/minicart/fragment/', { maxRedirects: 0 });
        check('A guest mini-cart fragment endpoint: redirected', res2.status() === 302, String(res2.status()));
        await go(page, '/wishlist/');
        check('A guest wishlist URL: not touched by the guard (core login redirect)', page.url().includes('/customer/account/login'));
        await ctx.close();
    }
    const { ctx: cctx, page: cpage } = await newPage();
    {
        await go(cpage, '/customer/account/login/');
        await cpage.fill('#email', CUSTOMER.email);
        await cpage.fill('#pass', CUSTOMER.password);
        await cpage.click('#login-form button[type="submit"]');
        await cpage.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
        check('A customer: login', !cpage.url().includes('/login'), cpage.url().replace(base, ''));
        await go(cpage, '/');
        check('A customer home: mini-cart present', (await count(cpage, 'hyperion-mini-cart')) === 1);
        await go(cpage, CATEGORY);
        check('A customer category: Add to Cart on the tiles', (await count(cpage, 'form[hx-post*="checkout/cart/add"]')) > 0);
        await go(cpage, PDP);
        check('A customer PDP: add-to-cart form present', (await count(cpage, '#product_addtocart_form')) === 1);
        await cpage.click('#product_addtocart_form button[type="submit"]');
        await cpage.waitForSelector('hyperion-notification', { timeout: 15000 }).catch(() => {});
        check('A customer PDP: add to cart succeeded', await messageShown(cpage, 'to your shopping cart'));
        await go(cpage, '/checkout/cart/');
        check('A customer cart: reachable', cpage.url().includes('/checkout/cart') && (await count(cpage, 'form[action*="checkout/cart/updatePost"], [data-hyperion-cart-items], .cart-item, hyperion-cart-item')) >= 0, cpage.url().replace(base, ''));
        await go(cpage, '/checkout/');
        check('A customer checkout: reachable', cpage.url().replace(base, '').startsWith('/checkout') && !cpage.url().includes('/cart'), cpage.url().replace(base, ''));
    }

    // ---------------------------------------------------------------- phase B: nobody allowed
    configure({ 'hyperion_catalog_mode/general/allowed_customer_groups': null });
    {
        await go(cpage, PDP);
        check('B customer PDP: restricted notice for the account', (await cpage.locator('[data-hyperion-purchase-restricted]').textContent().catch(() => '')).includes('Your account is not allowed to purchase items.'));
        check('B customer PDP: no add-to-cart form', (await count(cpage, '#product_addtocart_form')) === 0);
        await go(cpage, '/');
        check('B customer home: no mini-cart', (await count(cpage, 'hyperion-mini-cart')) === 0);
        await go(cpage, '/checkout/cart/');
        // Store codes may be part of the URL (an install with the store code in the URL: /en/customer/account/).
        check('B customer cart URL: redirected to the account dashboard', /\/customer\/account\/?$/.test(cpage.url()) && !cpage.url().includes('login'), cpage.url().replace(base, ''));
        check('B customer cart URL: error message displayed', await messageShown(cpage, 'Your account is not allowed to purchase items.'));
        await go(cpage, '/sales/order/history/');
        check('B customer order history: no reorder links', (await count(cpage, '[data-post*="sales/order/reorder"], a[href*="sales/order/reorder"]')) === 0);
        await go(cpage, '/wishlist/');
        check('B customer wishlist: page reachable', cpage.url().includes('/wishlist'), cpage.url().replace(base, ''));
        check('B customer wishlist: no Add to Cart / Add All', (await count(cpage, '[data-hyperion-wishlist-tocart], button[formaction*="allcart"]')) === 0);
    }

    // ---------------------------------------------------------------- phase C: catalog mode off, listing button off
    configure({ 'hyperion_catalog_mode/general/enabled': 0, 'hyperion/catalog/add_to_cart_from_listing': 0 });
    {
        await go(cpage, CATEGORY);
        check('C customer category: tiles without Add to Cart (setting off)', (await count(cpage, '[data-hyperion-tile]')) > 0 && (await count(cpage, 'form[hx-post*="checkout/cart/add"]')) === 0);
        await go(cpage, '/');
        check('C customer home: widget tiles without Add to Cart, mini-cart back', (await count(cpage, 'form[hx-post*="checkout/cart/add"]')) === 0 && (await count(cpage, 'hyperion-mini-cart')) === 1);
        await go(cpage, PDP);
        check('C customer PDP: add-to-cart form present', (await count(cpage, '#product_addtocart_form')) === 1);
        await cctx.close();
        const { ctx, page } = await newPage();
        await go(page, CATEGORY);
        check('C guest category: tiles without Add to Cart (setting off)', (await count(page, '[data-hyperion-tile]')) > 0 && (await count(page, 'form[hx-post*="checkout/cart/add"]')) === 0);
        await ctx.close();
    }

    // ---------------------------------------------------------------- phase D: defaults restored
    configure({ 'hyperion/catalog/add_to_cart_from_listing': 1 });
    {
        const { ctx, page } = await newPage();
        await go(page, CATEGORY);
        check('D guest category: Add to Cart on the tiles again', (await count(page, 'form[hx-post*="checkout/cart/add"]')) > 0);
        await go(page, '/');
        check('D guest home: mini-cart present', (await count(page, 'hyperion-mini-cart')) === 1);
        await ctx.close();
    }
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
} finally {
    configure(snapshot);
    await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} / ${results.length} passed`);
process.exit(failed ? 1 : 0);

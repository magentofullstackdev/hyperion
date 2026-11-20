#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the checkout flow: the journeys a shopper takes through the Lit checkout besides the plain order.
// Usage: node e2e/pw-checkout-flow.mjs <baseUrl> <slotDir> [--only F3,F5] [--shots dir] [--with-recaptcha] [--with-braintree]
//   node e2e/pw-checkout-flow.mjs https://shop.example <slotDir>
// <slotDir> is the Magento install directory (docker compose project with the services php-fpm and db).
//
//   F1   virtual quote (guest) and downloadable quote (customer): order without a shipping step
//   F2   coupons in the checkout: invalid code, a 100 percent code selects the "free" method, removal, free order;
//        --with-recaptcha switches the coupon_code reCAPTCHA on for the scenario and expects the token header
//   F3   reload in the middle of the flow, guest and customer: the typed data is back, Place Order is usable with no
//        REST request before it, the one background rate refresh comes after; a customer who chose a saved address
//        that is not the default keeps it. Prints the time from first contentful paint to a usable Place Order.
//   F4   billing address different from shipping: typed by a guest, picked from the address book by a customer, a
//        shipping method change while the billing address is incomplete, the box ticked again; Back from the
//        success page lands on the cart
//   F5   customer without saved addresses: the first order saves the address, the next visit offers it; "Add New
//        Address" with and without "Save in address book"
//   F6   a cart price rule on the payment method changes the total when the method is selected
//   F7   country switch: required region, postcode format warning, free text region, optional postcode
//   F8   shipping method change (the total moves at once, then is confirmed), no rate for an address, a coupon
//        that makes shipping free refreshes the list
//   F9   Back from the success page lands on the cart (runs with the guest order of F4)
//   F10  390 px viewport: the total at load and beside Place Order, the summary bar opens
//   F11  display currency different from the base currency: the charge notice
//   F12  an item that sells out between load and order; the minimum order amount at load and after a coupon
//   F13  no Content Security Policy violation while each gateway row is selected
//   F14  --with-braintree: a card order through the Braintree hosted fields, guest and customer (sandbox test card)
//
// Fixtures (e2e/fixtures/): checkout-flow-fixture.php (three coupons, the customers), payment-rule-fixture.php,
// stock-zero-fixture.php. Settings changed for one scenario (Bank Transfer for F6, the minimum order amount for
// F12, the coupon reCAPTCHA with --with-recaptcha) are snapshotted and put back as they were found, also when the
// run is interrupted. Customers are created with a unique email per run and stay, like the orders they place.
// Prints numbered PASS / FAIL lines and a JSON summary, exit code 1 on any failure, page error or HTTP 5xx.
// Clear the customer_login reCAPTCHA type for the run beforehand (see docs/development.md), as for pw-suite.mjs.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeConfigSnapshot } from './lib/config-snapshot.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
// PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host
// that is not in /etc/hosts yet (Chromium host resolver rules).
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <slotDir> [--only F3,F5] [--shots dir] [--with-recaptcha] [--with-braintree]');
    process.exit(2);
}
const u = makeUrl(await resolveUrlSuffix(base));
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const slot = args.find((a, i) => !a.startsWith('http') && !a.startsWith('--') && !['--only', '--shots'].includes(args[i - 1])) ?? '.';
const slotDir = path.resolve(slot);
const only = (valueOf('--only') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const shotsDir = valueOf('--shots') ? path.resolve(valueOf('--shots')) : null;
const WITH_RECAPTCHA = args.includes('--with-recaptcha');
const WITH_BRAINTREE = args.includes('--with-braintree');
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const RUN = Date.now();
const PASSWORD = 'Flow-Check-' + String(RUN).slice(-6) + '-aB1';
const COUPON = { full: 'HYPFLOW100', sixty: 'HYPFLOW60', shipping: 'HYPFLOWSHIP' };
const STOCK_ITEM = { sku: '24-UG07', path: '/dual-handle-cardio-ball.html' };
const VIRTUAL = { path: '/hyperion-gift-wrapping-service.html', qty: 11 };
const DOWNLOADABLE = { path: '/yoga-adventure.html', qty: 5 };
const MINIMUM_AMOUNT = 50;
// Pairs of simple products whose prices add up to more than 100, one pair per order so no item sells out.
const PAIRS = {
    reloadGuest: ['/fusion-backpack.html', '/push-it-messenger-bag.html'],
    reloadCustomer: ['/impulse-duffle.html', '/joust-duffle-bag.html'],
    coupon: ['/dash-digital-watch.html', '/crown-summit-backpack.html'],
    billingGuest: ['/didi-sport-watch.html', '/strive-shoulder-pack.html'],
    billingCustomer: ['/summit-watch.html', '/cruise-dual-analog-watch.html'],
    firstAddress: ['/clamber-watch.html', '/endurance-watch.html'],
    newAddressUnsaved: ['/bolo-sport-watch.html', '/luma-analog-watch.html', '/voyage-yoga-bag.html'],
    newAddressSaved: ['/aim-analog-watch.html', '/wayfarer-messenger-bag.html', '/compete-track-tote.html'],
    paymentRule: ['/fusion-backpack.html', '/impulse-duffle.html'],
    countries: ['/joust-duffle-bag.html', '/impulse-duffle.html'],
    // One item: with the Luma sample rules in place a free shipping coupon turned the rates of a one item cart to
    // zero and left those of a two item cart charged (core's own estimate answer). No order is placed.
    methods: ['/impulse-duffle.html'],
    phone: ['/fusion-backpack.html', '/joust-duffle-bag.html'],
    currency: ['/impulse-duffle.html', '/push-it-messenger-bag.html'],
    stock: ['/impulse-duffle.html', '/fusion-backpack.html', STOCK_ITEM.path],
    minimumBelow: ['/zing-jump-rope.html'],
    minimumCoupon: ['/fusion-backpack.html', '/push-it-messenger-bag.html'],
    csp: ['/joust-duffle-bag.html', '/push-it-messenger-bag.html', '/fusion-backpack.html'],
    cardGuest: ['/rival-field-messenger.html', '/overnight-duffle.html', '/savvy-shoulder-tote.html'],
    cardCustomer: ['/driven-backpack.html', '/endeavor-daytrip-backpack.html', '/harmony-lumaflex-trade-strength-band-kit.html', '/sprite-foam-roller.html'],
};
const MICHIGAN = { firstname: 'Flow', lastname: 'Checker', country: 'US', street: '1 Flow Street', postcode: '49628', city: 'Calder', region: 'Michigan', telephone: '5552293326' };
const DETROIT = { firstname: 'Billing', lastname: 'Checker', country: 'US', street: '9 Invoice Road', postcode: '48201', city: 'Detroit', region: 'Michigan', telephone: '5552293327' };
const OHIO = { firstname: 'Flow', lastname: 'Checker', country: 'US', street: '5 New Address Lane', postcode: '43004', city: 'Blacklick', region: 'Ohio', telephone: '5552293328' };
const TEXAS = { firstname: 'Flow', lastname: 'Checker', country: 'US', street: '7 Saved Address Way', postcode: '73301', city: 'Austin', region: 'Texas', telephone: '5552293329' };

const results = [];
const created = { orders: [], customers: [] };
let scenario = '';
const check = (name, ok, detail = '') => {
    const title = `${scenario} ${name}`;
    results.push({ name: title, ok: !!ok, detail: String(detail).slice(0, 300) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(results.length).padStart(3)}  ${title}${detail ? '  -- ' + String(detail).slice(0, 300) : ''}`);
};

// ---------------------------------------------------------------- the install
function compose(service, cmd, user) {
    const userArgs = user ? ['-u', user] : [];
    return execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...userArgs, service, 'bash', '-c', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const sql = (query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`).trim();
const { configSnapshot, restoreConfig, describe } = makeConfigSnapshot(sql);
const cleanConfigCache = () => magento('cache:clean config >/dev/null');
const setConfig = (configPath, value) => sql(`insert into core_config_data (scope, scope_id, path, value) values ('default', 0, '${configPath}', '${value}') on duplicate key update value = '${value}'`);
const lastJsonLine = (text) => JSON.parse(text.trim().split('\n').filter((l) => l.startsWith('{')).pop() ?? 'null');
const copyFixture = (name) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', path.join(FIXTURE_DIR, name), `php-fpm:/tmp/${name}`], { stdio: 'ignore' });
const runFixture = (name, fixtureArgs) => lastJsonLine(compose('php-fpm', `cd /var/www/html && php /tmp/${name} /var/www/html ${fixtureArgs}`, 'www-data'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Everything a scenario changes on the install registers its way back here; the list runs at the end of the
// scenario, at the end of the run and when the run is interrupted.
const cleanups = [];
function runCleanups() {
    while (cleanups.length > 0) {
        const { label, undo } = cleanups.pop();
        try { undo(); console.log(`restored: ${label}`); } catch (e) { console.error(`RESTORE FAILED: ${label}: ${String(e.message).slice(0, 200)}`); }
    }
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { console.error(`\n${signal}: restoring the install`); runCleanups(); process.exit(130); });
}
for (const event of ['uncaughtException', 'unhandledRejection']) {
    process.on(event, (error) => { console.error(`\n${event}: ${String(error?.stack ?? error).slice(0, 600)}\nrestoring the install`); runCleanups(); process.exit(1); });
}

/** Changes settings for a scenario; returns the function that puts back what was stored (row, SQL NULL or no row). */
function withConfig(label, values) {
    const before = Object.keys(values).map((configPath) => [configPath, configSnapshot(configPath)]);
    const entry = {
        label: `${label} (${before.map(([p, s]) => `${p} was ${describe(s)}`).join(', ')})`,
        undo: () => { for (const [configPath, snapshot] of before) restoreConfig(configPath, snapshot); cleanConfigCache(); },
    };
    cleanups.push(entry);
    for (const [configPath, value] of Object.entries(values)) setConfig(configPath, value);
    cleanConfigCache();
    return () => {
        const index = cleanups.indexOf(entry);
        if (index >= 0) { cleanups.splice(index, 1); entry.undo(); console.log(`restored: ${entry.label}`); }
    };
}

function withFixture(label, name, applyArgs, removeArgs) {
    copyFixture(name);
    const entry = { label, undo: () => { runFixture(name, removeArgs); } };
    cleanups.push(entry);
    const applied = runFixture(name, applyArgs);
    return {
        applied,
        remove: () => {
            const index = cleanups.indexOf(entry);
            if (index >= 0) { cleanups.splice(index, 1); entry.undo(); console.log(`restored: ${label}`); }
        },
    };
}

function createCustomer(tag, addresses) {
    const email = `e2e.checkout-flow.${tag}.${RUN}@example.com`;
    const data = runFixture('checkout-flow-fixture.php', `customer ${email} '${PASSWORD}' ${addresses}`);
    created.customers.push(email);
    return { email, password: PASSWORD, id: data.customer_id, addressIds: data.address_ids };
}

const lastOrder = (email) => {
    const row = sql(`select o.entity_id, o.increment_id, o.grand_total, ifnull(o.coupon_code, ''), p.method from sales_order o join sales_order_payment p on p.parent_id = o.entity_id where o.customer_email = '${email}' order by o.entity_id desc limit 1`);
    if (row === '') return null;
    const [id, increment, total, coupon, method] = row.split('\t');
    return { id: Number(id), increment, total: Number(total), coupon: coupon === '' ? null : coupon, method };
};
const orderAddress = (orderId, type) => {
    const row = sql(`select concat('id:', ifnull(customer_address_id, '')), ifnull(street, ''), ifnull(city, ''), ifnull(region, ''), ifnull(postcode, ''), country_id from sales_order_address where parent_id = ${orderId} and address_type = '${type}'`);
    if (row === '') return null;
    const [customerAddressId, street, city, region, postcode, country] = row.split('\t');
    return { customerAddressId: customerAddressId.slice(3), street, city, region, postcode, country };
};
const savedAddressCount = (customerId) => Number(sql(`select count(*) from customer_address_entity where parent_id = ${customerId}`));
const quoteShippingAddress = (customerId) => {
    const row = sql(`select concat('id:', ifnull(a.customer_address_id, '')), ifnull(a.city, ''), ifnull(a.shipping_method, '') from quote q join quote_address a on a.quote_id = q.entity_id and a.address_type = 'shipping' where q.customer_id = ${customerId} and q.is_active = 1 order by q.entity_id desc limit 1`);
    const [customerAddressId, city, method] = row.split('\t');
    return { customerAddressId: (customerAddressId ?? '').slice(3), city: city ?? '', method: method ?? '' };
};
const minimumOrderActive = () => sql("select ifnull(value, '') from core_config_data where scope = 'default' and scope_id = 0 and path = 'sales/minimum_order/active'") === '1';
/** Waits while another check has the minimum order amount switched on (a zero total order would bounce). */
async function waitForNoMinimumOrder() {
    for (let i = 0; i < 90 && minimumOrderActive(); i++) await sleep(2000);
    return !minimumOrderActive();
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch({ headless: true, ...launchOptions() });
const restName = (url) => url.replace(/\?.*$/, '').replace(/^.*\/V1\//, '').replace(/^guest-carts\/[^/]+\//, '').replace(/^carts\/mine\//, '').replace(/^guest-carts\/[^/]+$/, 'guest-cart').replace(/^carts\/mine$/, 'cart');

// Runs in the page before any script of it: the paint mark, the moment Place Order becomes usable, every REST
// request with its start time (all on the page clock), and the Content Security Policy violations.
function pageProbe() {
    const flow = { fcp: null, gate: null, rest: [], csp: [] };
    window.__hyperionFlow = flow;
    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') flow.fcp = entry.startTime;
        }).observe({ type: 'paint', buffered: true });
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (/\/rest\//.test(entry.name)) flow.rest.push({ url: entry.name, start: entry.startTime });
        }).observe({ type: 'resource', buffered: true });
    } catch { /* an observer type the browser does not have */ }
    const usable = () => {
        const button = document.querySelector('[data-hyperion-place-order] button');
        return button !== null && button.getAttribute('aria-disabled') !== 'true' && !button.disabled;
    };
    const observer = new MutationObserver(() => {
        if (flow.gate === null && usable()) { flow.gate = performance.now(); observer.disconnect(); }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-disabled', 'disabled'] });
    document.addEventListener('securitypolicyviolation', (e) => {
        flow.csp.push({ directive: e.violatedDirective, blocked: String(e.blockedURI).slice(0, 120), disposition: e.disposition });
    });
}

async function newJourney(options = {}) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 }, ...options });
    await ctx.addInitScript(pageProbe);
    const page = await ctx.newPage();
    const j = { ctx, page, problems: [], rest: [], inflight: 0, lastRest: Date.now(), injected: new Set() };
    page.on('pageerror', (e) => j.problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 140)}`));
    page.on('response', (r) => {
        if (r.status() >= 500 && !j.injected.has(r.url())) j.problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`);
    });
    page.on('request', (r) => {
        if (!/\/rest\//.test(r.url())) return;
        j.inflight++;
        j.lastRest = Date.now();
        let body = null;
        try { body = JSON.parse(r.postData() ?? 'null'); } catch { /* not JSON */ }
        j.rest.push({ method: r.method(), name: restName(r.url()), body, at: Date.now() });
    });
    const done = (r) => { if (/\/rest\//.test(r.url())) { j.inflight = Math.max(0, j.inflight - 1); j.lastRest = Date.now(); } };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    /** Resolves when no REST request ran for `quiet` ms, counted from this call at the earliest (debounced saves included). */
    j.settled = async (quiet = 1900, timeout = 45000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (j.inflight === 0 && Date.now() - Math.max(j.lastRest, start) >= quiet) return true;
            await sleep(150);
        }
        return false;
    };
    j.restSince = (mark) => j.rest.slice(mark);
    j.close = async () => { await ctx.close().catch(() => {}); };
    return j;
}

async function shot(page, name) {
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: true }).catch(() => {});
}

async function addToCart(page, productPath, qty = 1) {
    await page.goto(base + u(productPath), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#product_addtocart_form button[type="submit"]', { timeout: 30000 });
    await page.waitForFunction(() => window.htmx !== undefined && document.querySelector('#product_addtocart_form input[name="form_key"]')?.value, null, { timeout: 30000 }).catch(() => {});
    if (qty !== 1) await page.fill('#product_addtocart_form input[name="qty"]', String(qty));
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/add/.test(r.url()), { timeout: 40000 }).catch(() => null),
        page.click('#product_addtocart_form button[type="submit"]'),
    ]);
    await page.waitForFunction(() => {
        const n = document.querySelector('#hyperion-notification');
        return n && !n.hidden && n.innerText.trim().length > 0;
    }, null, { timeout: 15000 }).catch(() => {});
    return response !== null && response.status() < 400;
}
async function fillCart(page, paths) {
    for (const productPath of paths) {
        if (!(await addToCart(page, productPath))) throw new Error(`add to cart failed for ${productPath}`);
    }
}

async function login(page, customer) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', customer.email);
    await page.fill('#pass', customer.password);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
    if (page.url().includes('/login')) throw new Error(`login failed for ${customer.email}`);
}

async function openCheckout(j) {
    await j.page.goto(base + '/checkout/', { waitUntil: 'load' });
    await j.page.waitForSelector('checkout-app', { timeout: 40000 });
    await j.page.waitForSelector('[data-hyperion-place-order] button', { timeout: 20000 });
}

/** Fills the address form of a mode; `skip` names fields to leave alone. The telephone goes last. */
async function fillAddress(page, mode, address, skip = []) {
    const id = (name) => `#hc-${mode}-${name}`;
    const type = async (name, value) => {
        if (skip.includes(name) || value === undefined) return;
        await page.fill(id(name), value);
    };
    await type('firstname', address.firstname);
    await type('lastname', address.lastname);
    if (!skip.includes('country')) await page.selectOption(id('country_id'), address.country);
    await type('street_0', address.street);
    await type('postcode', address.postcode);
    await type('city', address.city);
    if (!skip.includes('region') && address.region !== undefined) {
        if (await page.locator(`select${id('region_id')}`).count()) await page.selectOption(id('region_id'), { label: address.region });
        else await page.fill(id('region'), address.region);
    }
    await type('telephone', address.telephone);
    if (!skip.includes('telephone')) await page.locator(id('telephone')).blur();
}
const fillEmail = async (page, email) => { await page.fill('#hc-contact-email', email); await page.locator('#hc-contact-email').blur(); };

const waitForRates = (page, timeout = 40000) => page.waitForFunction(() => document.querySelector('shipping-method-list [data-estimate-state="ready"]') !== null
    && document.querySelector('shipping-method-row input:checked') !== null, null, { timeout }).then(() => true, () => false);
const gateOpen = (page) => page.evaluate(() => {
    const button = document.querySelector('[data-hyperion-place-order] button');
    return button !== null && button.getAttribute('aria-disabled') !== 'true' && !button.disabled;
});
const waitForGate = (page, open = true, timeout = 30000) => page.waitForFunction((wanted) => {
    const button = document.querySelector('[data-hyperion-place-order] button');
    return button !== null && (button.getAttribute('aria-disabled') !== 'true' && !button.disabled) === wanted;
}, open, { timeout }).then(() => true, () => false);
async function selectPayment(j, code) {
    await j.page.waitForSelector(`#hc-pay-${code}`, { timeout: 40000 });
    await j.page.check(`#hc-pay-${code}`);
    await j.settled(1200);
}
const money = (text) => { const m = String(text ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m === null ? NaN : Number(m[0]); };
const totalRow = (page, code) => page.evaluate((c) => document.querySelector(`summary-totals [data-total="${c}"] dd`)?.textContent.trim() ?? null, code);
const grandTotal = async (page) => money(await totalRow(page, 'grand_total'));
const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? null, selector);
const sectionStatus = (page, section) => page.evaluate((s) => {
    const box = document.querySelector(`hc-section-status[section="${s}"] [data-section-status]`);
    if (box === null) return null;
    const action = box.querySelector('[data-section-status-action]');
    return { kind: box.getAttribute('data-kind'), text: box.querySelector('p')?.textContent.trim() ?? '', action: action?.textContent.trim() ?? null, href: action?.getAttribute('href') ?? null };
}, section);
const visibleErrors = (page) => page.evaluate(() => [...document.querySelectorAll('[data-error-banner], hc-section-status [data-section-status]')]
    .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '));

/** Presses Place Order and waits for the success page; returns the order of that email, or null. */
async function placeOrder(j, email, label) {
    const before = lastOrder(email)?.id ?? 0;
    await j.page.locator('[data-hyperion-place-order] button').click();
    await j.page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 60000 }).catch(() => {});
    const onSuccess = j.page.url().includes('/checkout/onepage/success');
    const order = onSuccess ? lastOrder(email) : null;
    const placed = order !== null && order.id > before;
    check(`${label}: order placed`, placed, placed ? `order ${order.increment}, total ${order.total}, ${order.method}` : `${j.page.url().replace(base, '')} ${onSuccess ? '' : await visibleErrors(j.page)}`);
    if (placed) created.orders.push(`${order.increment} (${scenario} ${label}, ${email})`);
    else await shot(j.page, `order-failed-${label.replace(/[^a-z0-9]+/gi, '-')}`);
    return placed ? order : null;
}

async function applyCoupon(j, code) {
    const { page } = j;
    if (await page.locator('coupon-form input[name="coupon_code"]').count() === 0) await page.locator('coupon-form button').first().click();
    await page.fill('coupon-form input[name="coupon_code"]', code);
    const mark = j.rest.length;
    await page.locator('coupon-form hc-button[variant="primary"] button').click();
    await page.waitForFunction(() => document.querySelector('coupon-form code') !== null
        || (document.querySelector('coupon-form input[name="coupon_code"]')?.getAttribute('aria-invalid') === 'true')
        || document.querySelector('hc-section-status[section="coupon"] [data-section-status]') !== null, null, { timeout: 30000 }).catch(() => {});
    await j.settled(1500);
    return j.restSince(mark);
}
const appliedCoupon = (page) => text(page, 'coupon-form code');

const noProblems = (j, label) => check(`${label}: no page errors / HTTP 5xx`, j.problems.length === 0, j.problems.slice(0, 4).join(' | '));

// ---------------------------------------------------------------- scenarios
const scenarios = {};

scenarios.F1 = async () => {
    // Guest, virtual product only: no shipping step, the billing address is typed.
    {
        const j = await newJourney();
        const { page } = j;
        try {
            const email = `e2e.checkout-flow.virtual.${RUN}@example.com`;
            if (!(await addToCart(page, VIRTUAL.path, VIRTUAL.qty))) throw new Error('virtual product not added');
            await openCheckout(j);
            check('guest: a virtual quote shows no shipping step', await page.locator('checkout-shipping, shipping-method-list').count() === 0);
            await fillEmail(page, email);
            await fillAddress(page, 'billing', MICHIGAN);
            await j.settled();
            check('guest: the billing address of a virtual quote is saved on its own', j.rest.some((r) => r.name === 'billing-address' && r.method === 'POST')
                && !j.rest.some((r) => r.name === 'shipping-information' || r.name === 'estimate-shipping-methods'), j.rest.map((r) => r.name).join(', '));
            await selectPayment(j, 'checkmo');
            check('guest: Place Order usable for the virtual quote', await waitForGate(page), await visibleErrors(page));
            const order = await placeOrder(j, email, 'guest virtual');
            check('guest: the order has no shipping address and the typed billing address', order !== null && orderAddress(order.id, 'shipping') === null && orderAddress(order.id, 'billing')?.city === MICHIGAN.city,
                order ? JSON.stringify({ shipping: orderAddress(order.id, 'shipping'), billing: orderAddress(order.id, 'billing') }) : '');
            noProblems(j, 'guest');
        } finally { await j.close(); }
    }
    // Customer with a saved address, downloadable product only.
    {
        const j = await newJourney();
        const { page } = j;
        try {
            const customer = createCustomer('download', 2);
            await login(page, customer);
            if (!(await addToCart(page, DOWNLOADABLE.path, DOWNLOADABLE.qty))) throw new Error('downloadable product not added');
            await openCheckout(j);
            check('customer: a downloadable quote shows no shipping step', await page.locator('checkout-shipping, shipping-method-list').count() === 0);
            await j.settled();
            await selectPayment(j, 'checkmo');
            check('customer: Place Order usable with the default billing address', await waitForGate(page), await visibleErrors(page));
            const order = await placeOrder(j, customer.email, 'customer downloadable');
            check('customer: the order is billed to the default saved address', order !== null && orderAddress(order.id, 'shipping') === null
                && orderAddress(order.id, 'billing')?.customerAddressId === String(customer.addressIds[0]), order ? JSON.stringify(orderAddress(order.id, 'billing')) : '');
            noProblems(j, 'customer');
        } finally { await j.close(); }
    }
};

scenarios.F2 = async () => {
    let restoreRecaptcha = null;
    if (WITH_RECAPTCHA) restoreRecaptcha = withConfig('coupon reCAPTCHA', { 'recaptcha_frontend/type_for/coupon_code': 'recaptcha_v3' });
    const j = await newJourney();
    const { page } = j;
    try {
        const email = `e2e.checkout-flow.coupon.${RUN}@example.com`;
        await fillCart(page, PAIRS.coupon);
        await openCheckout(j);
        await fillEmail(page, email);
        await fillAddress(page, 'shipping', MICHIGAN);
        check('rates for the typed address', await waitForRates(page));
        await j.settled();
        const before = await grandTotal(page);

        await applyCoupon(j, 'HYPFLOW-NO-SUCH-CODE');
        const bogusState = await page.evaluate(() => {
            const input = document.querySelector('coupon-form input[name="coupon_code"]');
            return { invalid: input?.getAttribute('aria-invalid'), message: document.querySelector('coupon-form hc-text-input p[data-tone]')?.textContent.trim() ?? '', value: input?.value ?? null };
        });
        const couponStatus = await sectionStatus(page, 'coupon');
        check('an unknown code shows a message at the coupon field and keeps the typed code', (bogusState.message !== '' || couponStatus !== null) && bogusState.value === 'HYPFLOW-NO-SUCH-CODE'
            && !/No such entity|Failed to fetch|\{|%1/.test(bogusState.message + (couponStatus?.text ?? '')), JSON.stringify({ bogusState, couponStatus }));
        check('an unknown code leaves the total alone', await grandTotal(page) === before && (await appliedCoupon(page)) === null, `${before} -> ${await grandTotal(page)}`);

        const tokenHeaders = [];
        page.on('request', (r) => { if (/\/coupons\//.test(r.url()) && r.method() === 'PUT') tokenHeaders.push(r.headers()['x-recaptcha'] ?? ''); });
        const fullRequests = await applyCoupon(j, COUPON.full);
        if (WITH_RECAPTCHA) check('reCAPTCHA: the coupon request carries the token header', tokenHeaders.length > 0 && tokenHeaders.every((h) => h.length > 20), `${tokenHeaders.length} requests, token lengths ${tokenHeaders.map((h) => h.length).join(',')}`);
        check('the 100 percent code shows as applied', (await appliedCoupon(page)) === COUPON.full, `${await appliedCoupon(page)}; ${await visibleErrors(page)}`);
        check('the 100 percent code brings the total to zero', await grandTotal(page) === 0, await totalRow(page, 'grand_total'));
        const freeState = await page.evaluate(() => ({
            rows: [...document.querySelectorAll('payment-method-row input[type="radio"]')].map((i) => i.id.replace('hc-pay-', '')),
            selectable: [...document.querySelectorAll('payment-method-row input[type="radio"]')].filter((i) => !i.disabled).map((i) => i.id.replace('hc-pay-', '')),
            checked: document.querySelector('payment-method-row input:checked')?.id.replace('hc-pay-', '') ?? null,
        }));
        check('a zero total selects the "free" payment method', freeState.checked === 'free', JSON.stringify(freeState));
        // Core refuses every other method at a zero total ("The requested Payment Method is not available.").
        check('at a zero total "free" is the only payment method that can be selected', freeState.selectable.length === 1 && freeState.selectable[0] === 'free', `selectable: ${freeState.selectable.join(', ')}`);
        check('a coupon change asks the rates again', fullRequests.some((r) => r.name === 'estimate-shipping-methods'), fullRequests.map((r) => `${r.method} ${r.name}`).join(', '));
        check('Place Order usable at a zero total', await waitForGate(page), await visibleErrors(page));

        const mark = j.rest.length;
        await page.locator('coupon-form hc-button[variant="ghost"] button').click();
        await page.waitForFunction(() => document.querySelector('coupon-form code') === null, null, { timeout: 30000 }).catch(() => {});
        await j.settled(1500);
        const afterRemoval = await page.evaluate(() => ({
            free: document.querySelector('#hc-pay-free') !== null,
            checked: document.querySelector('payment-method-row input:checked')?.id.replace('hc-pay-', '') ?? null,
            rows: document.querySelectorAll('payment-method-row').length,
        }));
        check('removing the code restores the total', await grandTotal(page) === before && j.restSince(mark).some((r) => r.method === 'DELETE' && r.name === 'coupons'), `${await grandTotal(page)} vs ${before}; ${j.restSince(mark).map((r) => `${r.method} ${r.name}`).join(', ')}`);
        check('removing the code takes "free" away and leaves the choice to the shopper', !afterRemoval.free && afterRemoval.checked !== 'free' && afterRemoval.rows > 0, JSON.stringify(afterRemoval));

        await applyCoupon(j, COUPON.full);
        check('the code applies again', (await appliedCoupon(page)) === COUPON.full && await grandTotal(page) === 0);
        const clear = await waitForNoMinimumOrder();
        if (!clear) console.log('F2: the minimum order amount stayed switched on, the free order may be refused');
        await waitForGate(page);
        const order = await placeOrder(j, email, 'guest free');
        check('the order is free and carries the coupon', order !== null && order.total === 0 && order.coupon === COUPON.full && order.method === 'free', JSON.stringify(order));
        noProblems(j, 'guest');
    } finally {
        await j.close();
        restoreRecaptcha?.();
    }
};

/** Five reloads of a checkout whose quote already holds a method: the request counters and the gate timing. */
async function measureReloads(j, label) {
    const { page } = j;
    const runs = [];
    for (let i = 0; i < 5; i++) {
        const mark = j.rest.length;
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.__hyperionFlow?.gate !== null && window.__hyperionFlow?.fcp !== null, null, { timeout: 25000 }).catch(() => {});
        await sleep(2500);
        await j.settled(800, 15000);
        const flow = await page.evaluate(() => window.__hyperionFlow);
        const names = j.restSince(mark).map((r) => r.name);
        const before = flow.gate === null ? flow.rest : flow.rest.filter((r) => r.start < flow.gate);
        runs.push({
            ms: flow.gate === null || flow.fcp === null ? null : Math.round(flow.gate - flow.fcp),
            fcp: flow.fcp === null ? null : Math.round(flow.fcp),
            gate: flow.gate === null ? null : Math.round(flow.gate),
            before: before.length,
            beforeNames: before.map((r) => r.url.replace(/^.*\/V1\//, '').replace(/^guest-carts\/[^/]+\//, '').replace(/^carts\/mine\//, '')),
            estimatesAfter: flow.gate === null ? 0 : flow.rest.filter((r) => r.start >= flow.gate && /estimate-shipping-methods/.test(r.url)).length,
            names,
        });
    }
    const times = runs.map((r) => r.ms).filter((ms) => ms !== null).sort((a, b) => a - b);
    const median = times.length === 5 ? times[2] : null;
    const max = times.length === 5 ? times[4] : null;
    const allNames = runs.flatMap((r) => r.names);
    // A negative time: Place Order was usable in the frame the browser reports as the first contentful paint.
    console.log(`GATE  ${label} reload: REST calls before a usable Place Order ${runs.map((r) => r.before).join(' ')}; ms from first contentful paint ${runs.map((r) => r.ms).join(' ')}; median ${median} max ${max}`
        + ` (first contentful paint at ${runs.map((r) => r.fcp).join(' ')} ms, usable at ${runs.map((r) => r.gate).join(' ')} ms of the navigation)`);
    check(`${label}: Place Order became usable on each of five reloads`, times.length === 5, JSON.stringify(runs.map((r) => r.ms)));
    check(`${label}: zero REST calls before Place Order is usable`, times.length === 5 && runs.every((r) => r.before === 0), runs.map((r) => `${r.before} [${r.beforeNames.join(',')}]`).join(' '));
    check(`${label}: exactly one background rate refresh per reload, after Place Order is usable`, runs.every((r) => r.estimatesAfter === 1 && r.names.filter((n) => n === 'estimate-shipping-methods').length === 1), runs.map((r) => `${r.estimatesAfter} after / ${r.names.filter((n) => n === 'estimate-shipping-methods').length} sent`).join(' '));
    check(`${label}: a reload sends no shipping-information, payment-information or billing-address`, !allNames.some((n) => /^(shipping-information|payment-information|set-payment-information|billing-address)$/.test(n)), runs.map((r, i) => `${i + 1}: ${r.names.join(' + ')}`).join('; '));
    check(`${label}: usable Place Order under 300 ms after first contentful paint (median ${median}, max ${max})`, median !== null && median < 300, runs.map((r) => r.ms).join(' '));
    return { label, before: runs.map((r) => r.before), ms: runs.map((r) => r.ms), median, max, fcp: runs.map((r) => r.fcp), usableAt: runs.map((r) => r.gate) };
}
const gateNumbers = [];

scenarios.F3 = async () => {
    {
        const j = await newJourney();
        const { page } = j;
        try {
            const email = `e2e.checkout-flow.reload.${RUN}@example.com`;
            await fillCart(page, PAIRS.reloadGuest);
            await openCheckout(j);
            await fillEmail(page, email);
            await fillAddress(page, 'shipping', MICHIGAN);
            check('guest: rates for the typed address', await waitForRates(page));
            await j.settled();
            const entry = j.rest.map((r) => r.name);
            check('guest: a first address entry with the telephone last sends one estimate and one shipping save', entry.filter((n) => n === 'estimate-shipping-methods').length === 1
                && entry.filter((n) => n === 'shipping-information').length === 1 && entry.length <= 3, entry.join(', '));
            await selectPayment(j, 'checkmo');
            check('guest: Place Order usable before the reload', await waitForGate(page), await visibleErrors(page));
            await j.settled();
            const methodBefore = await page.evaluate(() => document.querySelector('shipping-method-row input:checked')?.id ?? null);
            const totalBefore = await grandTotal(page);

            gateNumbers.push(await measureReloads(j, 'guest'));
            const after = await page.evaluate(() => {
                const value = (id) => document.querySelector(id)?.value ?? null;
                return {
                    email: value('#hc-contact-email'), firstname: value('#hc-shipping-firstname'), lastname: value('#hc-shipping-lastname'), street: value('#hc-shipping-street_0'),
                    postcode: value('#hc-shipping-postcode'), city: value('#hc-shipping-city'), country: value('#hc-shipping-country_id'), telephone: value('#hc-shipping-telephone'),
                    region: document.querySelector('#hc-shipping-region_id')?.selectedOptions[0]?.textContent.trim() ?? null,
                    method: document.querySelector('shipping-method-row input:checked')?.id ?? null,
                    payment: document.querySelector('payment-method-row input:checked')?.id ?? null,
                };
            });
            check('guest: the typed email and address are back after the reload', after.email === email && after.firstname === MICHIGAN.firstname && after.lastname === MICHIGAN.lastname && after.street === MICHIGAN.street
                && after.postcode === MICHIGAN.postcode && after.city === MICHIGAN.city && after.country === 'US' && after.region === MICHIGAN.region && after.telephone === MICHIGAN.telephone, JSON.stringify(after));
            check('guest: the shipping method, the payment method and the total are back', after.method === methodBefore && after.payment === 'hc-pay-checkmo' && await grandTotal(page) === totalBefore, `${after.method} ${after.payment} ${await grandTotal(page)} vs ${totalBefore}`);
            const order = await placeOrder(j, email, 'guest reload');
            check('guest: the order placed after the reloads ships to the typed address', order !== null && orderAddress(order.id, 'shipping')?.street === MICHIGAN.street, order ? JSON.stringify(orderAddress(order.id, 'shipping')) : '');
            noProblems(j, 'guest');
        } finally { await j.close(); }
    }
    {
        const j = await newJourney();
        const { page } = j;
        try {
            const customer = createCustomer('reload', 2);
            const [defaultId, otherId] = customer.addressIds;
            await login(page, customer);
            await fillCart(page, PAIRS.reloadCustomer);
            await openCheckout(j);
            check('customer: rates for the default saved address', await waitForRates(page));
            await j.settled();
            check('customer: the default address card is selected at first', await page.evaluate((id) => document.querySelector(`[data-hyperion-address-card="${id}"] input`)?.checked === true, defaultId));
            const mark = j.rest.length;
            await page.check(`[data-hyperion-address-card="${otherId}"] input`);
            await waitForRates(page);
            await j.settled();
            check('customer: choosing the other saved address saves it on the quote', j.restSince(mark).some((r) => r.name === 'shipping-information') && quoteShippingAddress(customer.id).customerAddressId === String(otherId),
                `${j.restSince(mark).map((r) => r.name).join(', ')}; quote ${JSON.stringify(quoteShippingAddress(customer.id))}`);
            await selectPayment(j, 'checkmo');
            check('customer: Place Order usable before the reload', await waitForGate(page), await visibleErrors(page));
            await j.settled();
            const quoteBefore = quoteShippingAddress(customer.id);

            gateNumbers.push(await measureReloads(j, 'customer'));
            const cards = await page.evaluate(() => [...document.querySelectorAll('[data-hyperion-address-card]')].map((c) => `${c.getAttribute('data-hyperion-address-card')}:${c.querySelector('input')?.checked}`));
            check('customer: the saved address that is not the default is still the selected card after the reload', cards.includes(`${otherId}:true`) && cards.includes(`${defaultId}:false`), cards.join(' '));
            const initialId = await page.evaluate(() => JSON.parse(document.querySelector('#checkout-config').textContent).hyperion?.initial?.quoteAddresses?.shipping?.customer_address_id ?? null);
            check('customer: the page is told the saved address the quote holds, not the default one', String(initialId) === String(otherId), `initial ${initialId}, chosen ${otherId}, default ${defaultId}`);

            // A new tab has no draft in its session storage: the card can only come from what the server printed.
            const tab = await j.ctx.newPage();
            const tabRest = [];
            tab.on('request', (r) => { if (/\/rest\//.test(r.url())) tabRest.push(restName(r.url())); });
            await tab.goto(base + '/checkout/', { waitUntil: 'load' });
            await tab.waitForSelector('[data-hyperion-address-card]', { timeout: 40000 }).catch(() => {});
            await sleep(4000);
            const tabCards = await tab.evaluate(() => [...document.querySelectorAll('checkout-shipping [data-hyperion-address-card]')].map((c) => `${c.getAttribute('data-hyperion-address-card')}:${c.querySelector('input')?.checked}`));
            const tabMethod = await tab.evaluate(() => document.querySelector('shipping-method-row input:checked')?.id ?? null);
            await tab.close();
            check('customer: a new tab selects the chosen address and its method without a draft', tabCards.includes(`${otherId}:true`) && tabMethod === `hc-ship-${quoteBefore.method.replace('_', '-')}`, `${tabCards.join(' ')}; ${tabMethod}`);
            check('customer: a new tab saves nothing over the quote', !tabRest.some((n) => /^(shipping-information|billing-address)$/.test(n)), tabRest.join(', '));
            const quoteAfter = quoteShippingAddress(customer.id);
            check('customer: the quote still holds the chosen address and method after the reloads', quoteAfter.customerAddressId === String(otherId) && quoteAfter.city === 'Anchorage' && quoteAfter.method === quoteBefore.method, JSON.stringify({ quoteBefore, quoteAfter }));
            const order = await placeOrder(j, customer.email, 'customer reload');
            const shipping = order ? orderAddress(order.id, 'shipping') : null;
            check('customer: the order ships to the chosen address, not the default one', shipping !== null && shipping.customerAddressId === String(otherId) && shipping.city === 'Anchorage', JSON.stringify(shipping));
            noProblems(j, 'customer');
        } finally { await j.close(); }
    }
};

scenarios.F4 = async () => {
    {
        const j = await newJourney();
        const { page } = j;
        try {
            const email = `e2e.checkout-flow.billing.${RUN}@example.com`;
            await fillCart(page, PAIRS.billingGuest);
            await openCheckout(j);
            await fillEmail(page, email);
            await fillAddress(page, 'shipping', MICHIGAN);
            check('guest: rates for the typed address', await waitForRates(page));
            await j.settled();
            await page.uncheck('input[name="billing_same_as_shipping"]');
            await page.waitForSelector('#hc-billing-firstname', { timeout: 15000 });
            const ids = await page.evaluate(() => { const all = [...document.querySelectorAll('checkout-app [id]')].map((e) => e.id); return all.filter((id, i) => all.indexOf(id) !== i); });
            check('guest: two address forms on the page share no id', ids.length === 0, ids.slice(0, 6).join(', '));
            await fillAddress(page, 'billing', DETROIT, ['postcode', 'city', 'telephone']);
            await page.locator('#hc-billing-street_0').blur();

            // The other shipping method while the billing address is still incomplete.
            const mark = j.rest.length;
            const otherMethod = await page.evaluate(() => [...document.querySelectorAll('shipping-method-row input')].find((i) => !i.checked && !i.disabled)?.id ?? null);
            if (otherMethod === null) throw new Error('a second shipping method is needed');
            await page.check(`#${otherMethod}`);
            await j.settled();
            const saves = j.restSince(mark).filter((r) => r.name === 'shipping-information');
            check('guest: a method change with an incomplete billing address is saved without a billing address', saves.length >= 1 && saves.every((r) => !r.body?.addressInformation?.billing_address)
                && saves.at(-1)?.body?.addressInformation?.shipping_method_code === otherMethod.split('-').pop(), JSON.stringify(saves.map((r) => ({ method: r.body?.addressInformation?.shipping_method_code, billing: !!r.body?.addressInformation?.billing_address }))));
            check('guest: no error shown for the incomplete billing address', (await visibleErrors(page)) === '', await visibleErrors(page));
            await selectPayment(j, 'checkmo');
            check('guest: Place Order waits for the billing address', !(await gateOpen(page)));

            const mark2 = j.rest.length;
            await fillAddress(page, 'billing', DETROIT, ['firstname', 'lastname', 'country', 'street_0', 'region']);
            await j.settled();
            const billingSaves = j.restSince(mark2);
            check('guest: the completed billing address travels with one shipping save, no billing-address request', billingSaves.filter((r) => r.name === 'shipping-information' && r.body?.addressInformation?.billing_address?.city === DETROIT.city).length >= 1
                && !billingSaves.some((r) => r.name === 'billing-address'), billingSaves.map((r) => r.name).join(', '));
            if (await page.locator('#hc-pay-checkmo:checked').count() === 0) await selectPayment(j, 'checkmo');
            check('guest: Place Order usable with both addresses', await waitForGate(page), await visibleErrors(page));
            const order = await placeOrder(j, email, 'guest billing');
            const addresses = order ? { shipping: orderAddress(order.id, 'shipping'), billing: orderAddress(order.id, 'billing') } : null;
            check('guest: the order has the typed billing address and the typed shipping address', addresses !== null && addresses.billing?.city === DETROIT.city && addresses.billing?.street === DETROIT.street
                && addresses.shipping?.city === MICHIGAN.city && addresses.shipping?.street === MICHIGAN.street, JSON.stringify(addresses));
            const method = order ? sql(`select shipping_method from sales_order where entity_id = ${order.id}`) : '';
            check('guest: the order has the shipping method chosen last', order !== null && method.replace('_', '-') === otherMethod.replace('hc-ship-', ''), `${method} vs ${otherMethod}`);

            // Back from the success page.
            if (order !== null) {
                await page.goBack({ waitUntil: 'load' }).catch(() => {});
                await page.waitForURL((url) => /\/checkout\/cart\/?/.test(url.toString()), { timeout: 30000 }).catch(() => {});
                await page.waitForLoadState('networkidle').catch(() => {});
                check('guest: Back from the success page lands on the cart', /\/checkout\/cart\/?$/.test(page.url().replace(/[?#].*$/, '')) && await page.locator('checkout-app').count() === 0, page.url().replace(base, ''));
            }
            noProblems(j, 'guest');
        } finally { await j.close(); }
    }
    {
        const j = await newJourney();
        const { page } = j;
        try {
            const customer = createCustomer('billing', 2);
            const [defaultId, otherId] = customer.addressIds;
            await login(page, customer);
            await fillCart(page, PAIRS.billingCustomer);
            await openCheckout(j);
            check('customer: rates for the default saved address', await waitForRates(page));
            await j.settled();
            await page.uncheck('input[name="billing_same_as_shipping"]');
            const billingCard = `checkout-payment [data-hyperion-address-card="${otherId}"] input`;
            await page.waitForSelector(billingCard, { timeout: 15000 });
            const mark = j.rest.length;
            await page.check(billingCard);
            await j.settled();
            const picks = j.restSince(mark).filter((r) => r.name === 'shipping-information');
            check('customer: a billing address picked from the address book is saved with the shipping save', picks.length >= 1 && String(picks.at(-1)?.body?.addressInformation?.billing_address?.customer_address_id ?? picks.at(-1)?.body?.addressInformation?.billing_address?.id ?? '') === String(otherId)
                && !j.restSince(mark).some((r) => r.name === 'billing-address'), JSON.stringify(picks.map((r) => r.body?.addressInformation?.billing_address ?? null)).slice(0, 260));
            check('customer: the shipping card is still the default address', await page.evaluate((id) => document.querySelector(`checkout-shipping [data-hyperion-address-card="${id}"] input`)?.checked === true, defaultId));

            const mark2 = j.rest.length;
            await page.check('input[name="billing_same_as_shipping"]');
            await j.settled();
            const reticked = j.restSince(mark2).filter((r) => r.name === 'shipping-information');
            const sentBilling = reticked.at(-1)?.body?.addressInformation?.billing_address ?? null;
            check('customer: ticking the box again saves the shipping address as the billing address', reticked.length >= 1 && (sentBilling === null || sentBilling.city === 'Calder'), JSON.stringify(sentBilling).slice(0, 220));
            await selectPayment(j, 'checkmo');
            check('customer: Place Order usable', await waitForGate(page), await visibleErrors(page));
            const order = await placeOrder(j, customer.email, 'customer billing');
            const addresses = order ? { shipping: orderAddress(order.id, 'shipping'), billing: orderAddress(order.id, 'billing') } : null;
            check('customer: the order is billed to the shipping address after the box was ticked again', addresses !== null && addresses.billing?.city === 'Calder' && addresses.shipping?.city === 'Calder', JSON.stringify(addresses));
            noProblems(j, 'customer');
        } finally { await j.close(); }
    }
};

scenarios.F5 = async () => {
    const customer = createCustomer('first', 0);
    const visit = async (label, pair, steps) => {
        const j = await newJourney();
        try {
            await login(j.page, customer);
            await fillCart(j.page, pair);
            await openCheckout(j);
            await steps(j);
            noProblems(j, label);
        } finally { await j.close(); }
    };

    await visit('first order', PAIRS.firstAddress, async (j) => {
        const { page } = j;
        const seeded = await page.evaluate(() => ({
            cards: document.querySelectorAll('[data-hyperion-address-card]').length,
            firstname: document.querySelector('#hc-shipping-firstname')?.value ?? null, lastname: document.querySelector('#hc-shipping-lastname')?.value ?? null,
            save: document.querySelector('checkout-shipping input[name="save_in_address_book"]')?.checked ?? null,
            email: document.querySelector('checkout-email') !== null,
        }));
        check('first order: a customer without addresses gets the form with the account name and "Save in address book" ticked', seeded.cards === 0 && seeded.firstname === 'Flow' && seeded.lastname === 'Checker' && seeded.save === true, JSON.stringify(seeded));
        await fillAddress(page, 'shipping', MICHIGAN, ['firstname', 'lastname']);
        check('first order: rates for the typed address', await waitForRates(page));
        await selectPayment(j, 'checkmo');
        check('first order: Place Order usable', await waitForGate(page), await visibleErrors(page));
        const order = await placeOrder(j, customer.email, 'first order');
        check('first order: the address is saved in the address book', order !== null && savedAddressCount(customer.id) === 1, `${savedAddressCount(customer.id)} saved addresses`);
    });
    const firstAddressId = sql(`select entity_id from customer_address_entity where parent_id = ${customer.id} order by entity_id limit 1`);

    await visit('second visit', PAIRS.newAddressUnsaved, async (j) => {
        const { page } = j;
        const ready = await waitForRates(page);
        const state = await page.evaluate(() => ({
            cards: [...document.querySelectorAll('checkout-shipping [data-hyperion-address-card]')].map((c) => `${c.getAttribute('data-hyperion-address-card')}:${c.querySelector('input')?.checked}`),
            card: document.querySelector('checkout-shipping address-card')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
            form: document.querySelector('#hc-shipping-street_0') !== null,
        }));
        check('second visit: the saved address is offered, selected, with its rates', ready && state.cards.length === 1 && state.cards[0] === `${firstAddressId}:true` && state.card.includes(MICHIGAN.street) && !state.form, JSON.stringify(state));
        await j.settled();

        await page.locator('[data-hyperion-address-new] button').click();
        await page.waitForSelector('#hc-shipping-street_0', { timeout: 15000 });
        const hidden = await page.evaluate(() => document.querySelectorAll('shipping-method-row').length);
        check('second visit: "Add New Address" hides the rates of the previous address', hidden === 0, `${hidden} rows`);
        await page.uncheck('checkout-shipping input[name="save_in_address_book"]');
        await fillAddress(page, 'shipping', OHIO);
        check('second visit: rates for the new address', await waitForRates(page));
        await selectPayment(j, 'checkmo');
        check('second visit: Place Order usable', await waitForGate(page), await visibleErrors(page));
        const order = await placeOrder(j, customer.email, 'new address not saved');
        const shipping = order ? orderAddress(order.id, 'shipping') : null;
        check('second visit: the order ships to the new address and the address book is unchanged', shipping !== null && shipping.city === OHIO.city && savedAddressCount(customer.id) === 1, `${JSON.stringify(shipping)}; ${savedAddressCount(customer.id)} saved addresses`);
    });

    await visit('third visit', PAIRS.newAddressSaved, async (j) => {
        const { page } = j;
        await waitForRates(page);
        await j.settled();
        await page.locator('[data-hyperion-address-new] button').click();
        await page.waitForSelector('#hc-shipping-street_0', { timeout: 15000 });
        const ticked = await page.evaluate(() => document.querySelector('checkout-shipping input[name="save_in_address_book"]')?.checked ?? null);
        check('third visit: "Save in address book" is ticked for a new address', ticked === true, String(ticked));
        await fillAddress(page, 'shipping', TEXAS);
        check('third visit: rates for the new address', await waitForRates(page));
        await selectPayment(j, 'checkmo');
        check('third visit: Place Order usable', await waitForGate(page), await visibleErrors(page));
        const order = await placeOrder(j, customer.email, 'new address saved');
        const shipping = order ? orderAddress(order.id, 'shipping') : null;
        const cities = sql(`select group_concat(city order by entity_id) from customer_address_entity where parent_id = ${customer.id}`);
        check('third visit: the order ships to the new address and the address book has it', shipping !== null && shipping.city === TEXAS.city && savedAddressCount(customer.id) === 2 && cities.includes(TEXAS.city), `${JSON.stringify(shipping)}; address book: ${cities}`);
    });
};

scenarios.F6 = async () => {
    const j = await newJourney();
    const { page } = j;
    let restoreMethod = null;
    let rule = null;
    try {
        await fillCart(page, PAIRS.paymentRule);
        rule = withFixture('payment method cart rule removed', 'payment-rule-fixture.php', '--apply', '--remove');
        restoreMethod = withConfig('Bank Transfer', { 'payment/banktransfer/active': '1' });
        await openCheckout(j);
        await fillEmail(page, `e2e.checkout-flow.rule.${RUN}@example.com`);
        await fillAddress(page, 'shipping', MICHIGAN);
        check('rates for the typed address', await waitForRates(page));
        await selectPayment(j, 'checkmo');
        await j.settled();
        const subtotal = money(await totalRow(page, 'subtotal'));
        const withCheck = await grandTotal(page);
        check('no discount with Check / Money order', (await totalRow(page, 'discount')) === null, `discount row ${await totalRow(page, 'discount')}`);

        const mark = j.rest.length;
        await selectPayment(j, 'banktransfer');
        await j.settled();
        const sent = j.restSince(mark).map((r) => `${r.method} ${r.name}`);
        const discount = money(await totalRow(page, 'discount'));
        const withTransfer = await grandTotal(page);
        check('selecting Bank Transfer saves the method and reads the totals again', sent.includes('POST set-payment-information') && sent.includes('GET payment-information'), sent.join(', '));
        check('the 5 percent rule shows as a discount before Place Order', Math.abs(Math.abs(discount) - subtotal * 0.05) < 0.02 && withTransfer < withCheck, `subtotal ${subtotal}, discount ${discount}, total ${withCheck} -> ${withTransfer}`);
        const label = await text(page, '[data-hyperion-place-order] button');
        check('the Place Order label carries the discounted total', money(label) === withTransfer && await gateOpen(page), label);

        await selectPayment(j, 'checkmo');
        await j.settled();
        check('back on Check / Money order the discount is gone', await grandTotal(page) === withCheck && (await totalRow(page, 'discount')) === null, `${await grandTotal(page)} vs ${withCheck}`);
        noProblems(j, 'guest');
    } finally {
        await j.close();
        restoreMethod?.();
        rule?.remove();
    }
};

scenarios.F7 = async () => {
    const j = await newJourney();
    const { page } = j;
    try {
        await fillCart(page, PAIRS.countries);
        await openCheckout(j);
        const config = await page.evaluate(() => {
            const c = JSON.parse(document.querySelector('#checkout-config').textContent);
            const optional = (c.optionalZipCountries ?? []).filter((code) => c.directoryData?.[code] && !c.directoryData[code].regions && !c.directoryData[code].is_region_required);
            return { optional, de: c.directoryData?.DE ? { required: c.directoryData.DE.is_region_required, visible: c.directoryData.DE.is_region_visible } : null };
        });
        await fillEmail(page, `e2e.checkout-flow.country.${RUN}@example.com`);

        // United States without a state.
        await fillAddress(page, 'shipping', MICHIGAN, ['region']);
        await j.settled(2500);
        const usNoState = await page.evaluate(() => ({ required: document.querySelector('#hc-shipping-region_id')?.getAttribute('aria-required'), rows: document.querySelectorAll('shipping-method-row').length,
            state: document.querySelector('shipping-method-list [data-estimate-state]')?.getAttribute('data-estimate-state') }));
        check('US without a state: the state is required and no rate is asked', usNoState.required === 'true' && usNoState.rows === 0 && !j.rest.some((r) => r.name === 'estimate-shipping-methods'), `${JSON.stringify(usNoState)}; ${j.rest.map((r) => r.name).join(', ')}`);
        await page.locator('#hc-shipping-region_id').focus();
        await page.locator('#hc-shipping-telephone').focus();
        const regionError = await text(page, '#hc-shipping-region_id-msg');
        check('US without a state: leaving the state field shows its error', (regionError ?? '') !== '' && await page.getAttribute('#hc-shipping-region_id', 'aria-invalid') === 'true', regionError);
        check('US without a state: Place Order stays closed', !(await gateOpen(page)));

        await page.selectOption('#hc-shipping-region_id', { label: 'Michigan' });
        check('US with a state: rates arrive', await waitForRates(page));
        await j.settled();

        // A postcode that does not match the country's pattern is a warning, not an error.
        await page.fill('#hc-shipping-postcode', 'ABCDE');
        await page.locator('#hc-shipping-postcode').blur();
        await j.settled();
        const warning = await page.evaluate(() => ({ tone: document.querySelector('#hc-shipping-postcode-msg')?.getAttribute('data-tone'), text: document.querySelector('#hc-shipping-postcode-msg')?.textContent.trim() ?? '',
            invalid: document.querySelector('#hc-shipping-postcode')?.getAttribute('aria-invalid') }));
        check('a postcode outside the country pattern is a warning with an example, not an error', warning.tone === 'warning' && /Example/i.test(warning.text) && warning.invalid !== 'true', JSON.stringify(warning));
        await selectPayment(j, 'checkmo');
        check('the postcode warning does not close Place Order', await waitForGate(page), await visibleErrors(page));

        // Germany: a list of regions, none required.
        const markDe = j.rest.length;
        await page.selectOption('#hc-shipping-country_id', 'DE');
        await page.fill('#hc-shipping-postcode', '10115');
        await page.fill('#hc-shipping-city', 'Berlin');
        await page.locator('#hc-shipping-city').blur();
        const deRates = await waitForRates(page);
        await j.settled();
        const de = await page.evaluate(() => ({ required: document.querySelector('#hc-shipping-region_id')?.getAttribute('aria-required') ?? null, value: document.querySelector('#hc-shipping-region_id')?.value ?? null,
            star: document.querySelector('label[for="hc-shipping-region_id"] span[aria-hidden="true"]') !== null }));
        const deSave = j.restSince(markDe).filter((r) => r.name === 'shipping-information').at(-1)?.body?.addressInformation?.shipping_address ?? null;
        check('Germany: the state is optional (no asterisk) and rates arrive without one', deRates && de.required !== 'true' && !de.star && (de.value ?? '') === '', JSON.stringify({ de, config: config.de }));
        check('Germany: the address is saved without the state of the previous country', deSave !== null && deSave.country_id === 'DE' && !deSave.region_id && !(deSave.region && deSave.region !== ''), JSON.stringify(deSave).slice(0, 240));
        check('Germany: Place Order usable without a state', await waitForGate(page), await visibleErrors(page));

        // United Kingdom: no region list, the region is free text.
        const markGb = j.rest.length;
        await page.selectOption('#hc-shipping-country_id', 'GB');
        await page.waitForSelector('input#hc-shipping-region', { timeout: 10000 }).catch(() => {});
        const gbField = await page.evaluate(() => ({ text: document.querySelector('input#hc-shipping-region') !== null, select: document.querySelector('select#hc-shipping-region_id') !== null }));
        check('United Kingdom: the state list becomes a free text field', gbField.text && !gbField.select, JSON.stringify(gbField));
        if (gbField.text) await page.fill('#hc-shipping-region', 'Kent');
        await page.fill('#hc-shipping-postcode', 'CT1 2EH');
        await page.fill('#hc-shipping-city', 'Canterbury');
        await page.locator('#hc-shipping-city').blur();
        const gbRates = await waitForRates(page);
        await j.settled();
        const gbSave = j.restSince(markGb).filter((r) => r.name === 'shipping-information').at(-1)?.body?.addressInformation?.shipping_address ?? null;
        check('United Kingdom: the typed region travels as text', gbRates && gbSave !== null && gbSave.country_id === 'GB' && gbSave.region === 'Kent', JSON.stringify(gbSave).slice(0, 240));

        // A country whose postcode is optional.
        const optionalCountry = config.optional.find((code) => code !== 'GB') ?? null;
        if (optionalCountry === null) {
            check('optional postcode: a country with an optional postcode exists in the configuration', false, 'none of optionalZipCountries is an allowed country without regions');
        } else {
            const markOptional = j.rest.length;
            await page.selectOption('#hc-shipping-country_id', optionalCountry);
            await page.fill('#hc-shipping-postcode', '');
            await page.fill('#hc-shipping-city', 'Harbor City');
            await page.locator('#hc-shipping-city').blur();
            const rates = await waitForRates(page);
            await j.settled();
            const field = await page.evaluate(() => ({ required: document.querySelector('#hc-shipping-postcode')?.getAttribute('aria-required'), invalid: document.querySelector('#hc-shipping-postcode')?.getAttribute('aria-invalid') }));
            const estimated = j.restSince(markOptional).some((r) => r.name === 'estimate-shipping-methods');
            check(`optional postcode (${optionalCountry}): rates and Place Order without a postcode`, rates && estimated && field.required !== 'true' && field.invalid !== 'true' && await waitForGate(page), `${JSON.stringify(field)}; ${j.restSince(markOptional).map((r) => r.name).join(', ')}; ${await visibleErrors(page)}`);
        }
        noProblems(j, 'guest');
    } finally { await j.close(); }
};

scenarios.F8 = async () => {
    const j = await newJourney();
    const { page } = j;
    try {
        await fillCart(page, PAIRS.methods);
        await openCheckout(j);
        await fillEmail(page, `e2e.checkout-flow.methods.${RUN}@example.com`);
        await fillAddress(page, 'shipping', MICHIGAN);
        check('rates for the typed address', await waitForRates(page));
        await selectPayment(j, 'checkmo');
        await j.settled();
        const rows = await page.evaluate(() => [...document.querySelectorAll('shipping-method-row')].map((row) => ({ id: row.querySelector('input').id, checked: row.querySelector('input').checked,
            price: row.querySelector('[data-shipping-method-price]')?.textContent.trim() ?? '' })));
        const from = rows.find((r) => r.checked);
        const to = rows.find((r) => !r.checked && money(r.price) !== money(from?.price));
        if (!from || !to) throw new Error(`two rates with different prices are needed: ${JSON.stringify(rows)}`);
        const cheapest = Math.min(...rows.map((r) => money(r.price)));
        check('the cheapest rate is the one selected first', money(from.price) === cheapest, JSON.stringify(rows));
        const before = await grandTotal(page);

        // The save is held back so the total on screen in the meantime is the one computed in the browser.
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        await page.route('**/shipping-information', async (route) => { await held; await route.continue().catch(() => {}); });
        await page.check(`#${to.id}`);
        await sleep(700);
        const during = await page.evaluate(() => ({ total: document.querySelector('summary-totals [data-total="grand_total"] dd')?.textContent.trim() ?? '',
            provisional: document.querySelector('summary-totals [data-total="grand_total"]')?.hasAttribute('data-provisional') ?? false,
            busy: document.querySelector('summary-totals [data-total="grand_total"]')?.getAttribute('aria-busy') ?? null,
            shipping: document.querySelector('summary-totals [data-total="shipping"] dd')?.textContent.trim() ?? '',
            live: document.querySelector('[data-hyperion-grand-total-live]')?.textContent.trim() ?? '' }));
        const expectedShift = money(to.price) - money(from.price);
        const gateDuring = await gateOpen(page);
        check('a method change moves the shipping row and the total at once, marked provisional', money(during.shipping) === money(to.price) && Math.abs(money(during.total) - before - expectedShift) < 0.9 && during.provisional && during.busy === 'true',
            `before ${before}, during ${JSON.stringify(during)}, rate ${from.price} -> ${to.price}`);
        check('Place Order waits while the total is provisional', !gateDuring);
        release();
        await j.settled();
        await page.unroute('**/shipping-information');
        const after = await page.evaluate(() => ({ total: document.querySelector('summary-totals [data-total="grand_total"] dd')?.textContent.trim() ?? '',
            provisional: document.querySelector('summary-totals [data-total="grand_total"]')?.hasAttribute('data-provisional') ?? false,
            live: document.querySelector('[data-hyperion-grand-total-live]')?.textContent.trim() ?? '' }));
        check('the confirmed total replaces the provisional one', !after.provisional && Math.abs(money(after.total) - before - expectedShift) < 0.9 && await waitForGate(page), JSON.stringify(after));
        check('the live region announces the confirmed total only', money(after.live) === money(after.total) && money(during.live) !== money(during.total), `during "${during.live}", after "${after.live}"`);

        // A coupon that makes shipping free refreshes the list without a reload.
        const couponRequests = await applyCoupon(j, COUPON.shipping);
        await j.settled();
        const freeRows = await page.evaluate(() => [...document.querySelectorAll('shipping-method-row')].map((row) => `${row.querySelector('input').id}=${row.querySelector('[data-shipping-method-price]')?.textContent.trim() ?? ''}`));
        check('a free shipping coupon asks the rates again', (await appliedCoupon(page)) === COUPON.shipping && couponRequests.some((r) => r.name === 'estimate-shipping-methods'), couponRequests.map((r) => `${r.method} ${r.name}`).join(', '));
        check('the list shows a free rate without a reload', freeRows.some((r) => /=Free$/i.test(r)), freeRows.join(' '));
        check('the shipping total follows the free rate', [0, NaN].includes(money(await totalRow(page, 'shipping'))) || /free/i.test(await totalRow(page, 'shipping') ?? ''), await totalRow(page, 'shipping'));
        await page.locator('coupon-form hc-button[variant="ghost"] button').click();
        await page.waitForFunction(() => document.querySelector('coupon-form code') === null, null, { timeout: 30000 }).catch(() => {});
        await j.settled();

        // An address no carrier serves: the estimate of this one address is answered with an empty list.
        await page.route('**/estimate-shipping-methods', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await page.selectOption('#hc-shipping-country_id', 'DE');
        await page.fill('#hc-shipping-postcode', '10115');
        await page.fill('#hc-shipping-city', 'Berlin');
        await page.locator('#hc-shipping-city').blur();
        await page.waitForSelector('[data-shipping-methods-none]', { timeout: 20000 }).catch(() => {});
        await j.settled(1500);
        const empty = await page.evaluate(() => ({ state: document.querySelector('shipping-method-list [data-estimate-state]')?.getAttribute('data-estimate-state'),
            text: document.querySelector('[data-shipping-methods-none]')?.textContent.replace(/\s+/g, ' ').trim() ?? '', rows: document.querySelectorAll('shipping-method-row').length }));
        check('an address without rates shows the empty state, no stale rows', empty.state === 'empty' && /No shipping method is available/i.test(empty.text) && empty.rows === 0, JSON.stringify(empty));
        check('Place Order is closed without a rate', !(await gateOpen(page)));
        await page.unroute('**/estimate-shipping-methods');
        noProblems(j, 'guest');
    } finally { await j.close(); }
};

scenarios.F10 = async () => {
    const j = await newJourney({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const { page } = j;
    try {
        await fillCart(page, PAIRS.phone);
        await openCheckout(j);
        const inViewport = (selector) => page.evaluate((s) => {
            const el = document.querySelector(s);
            if (el === null) return null;
            const r = el.getBoundingClientRect();
            return { top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight, text: el.textContent.replace(/\s+/g, ' ').trim() };
        }, selector);
        const barTotal = await inViewport('[data-hyperion-summary-bar-total]');
        const bar = await inViewport('[data-hyperion-summary-bar]');
        check('phone: the summary bar with the total is on screen at load, before any scrolling', barTotal !== null && barTotal.visible && money(barTotal.text) > 0 && await page.evaluate(() => window.scrollY) === 0, JSON.stringify(barTotal));
        check('phone: the bar names the number of items', bar !== null && /Order summary, 2 items/i.test(bar.text), bar?.text);
        check('phone: one summary, no side rail', await page.locator('order-summary').count() === 1 && await page.locator('[data-hyperion-summary-rail]').count() === 0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check('phone: no horizontal overflow', overflow <= 0, `${overflow}px`);

        const closed = await page.evaluate(() => document.querySelector('[data-hyperion-summary-bar]')?.closest('details')?.open ?? null);
        await page.locator('[data-hyperion-summary-bar]').click();
        await sleep(400);
        const opened = await page.evaluate(() => {
            const details = document.querySelector('[data-hyperion-summary-bar]')?.closest('details');
            const item = details?.querySelector('summary-item');
            const rect = item?.getBoundingClientRect();
            return { open: details?.open ?? null, items: details?.querySelectorAll('summary-item').length ?? 0, itemVisible: !!rect && rect.height > 0, totals: details?.querySelector('summary-totals') !== null, coupon: details?.querySelector('coupon-form') !== null };
        });
        check('phone: the summary bar opens to the items, the totals and the coupon form', closed === false && opened.open === true && opened.items === 2 && opened.itemVisible && opened.totals && opened.coupon, JSON.stringify({ closed, opened }));
        await page.locator('[data-hyperion-summary-bar]').click();

        await fillEmail(page, `e2e.checkout-flow.phone.${RUN}@example.com`);
        await fillAddress(page, 'shipping', MICHIGAN);
        check('phone: rates for the typed address', await waitForRates(page));
        await selectPayment(j, 'checkmo');
        await waitForGate(page);
        await j.settled();
        await page.locator('[data-hyperion-place-order] button').scrollIntoViewIfNeeded();
        await sleep(300);
        const button = await inViewport('[data-hyperion-place-order] button');
        const beside = await inViewport('[data-hyperion-place-order-total]');
        const total = await grandTotal(page);
        check('phone: the grand total is on screen beside Place Order', button !== null && button.visible && beside !== null && beside.visible && money(beside.text) === total && Math.abs(beside.bottom - button.top) < 40,
            JSON.stringify({ button, beside, total }));
        const size = await page.evaluate(() => {
            const r = document.querySelector('[data-hyperion-place-order] button').getBoundingClientRect();
            const bar = document.querySelector('[data-hyperion-place-order-bar]');
            const style = getComputedStyle(bar);
            return { width: Math.round(r.width), height: Math.round(r.height), bar: Math.round(bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)), barOuter: Math.round(bar.getBoundingClientRect().width),
                card: Math.round(bar.parentElement.getBoundingClientRect().width), position: style.position, viewport: window.innerWidth };
        });
        check('phone: Place Order fills the bar at the bottom of the payment card and is at least 48 px high', size.height >= 48 && Math.abs(size.width - size.bar) <= 2 && size.card - size.barOuter <= 2, JSON.stringify(size));
        check('phone: the Place Order bar sticks to the bottom of the screen', size.position === 'sticky', size.position);
        check('phone: the Place Order label carries the amount', money(button?.text) === total, button?.text);
        await shot(page, 'phone-place-order');
        noProblems(j, 'guest');
    } finally { await j.close(); }
};

scenarios.F11 = async () => {
    const j = await newJourney();
    const { page } = j;
    try {
        const baseCurrency = sql("select ifnull((select value from core_config_data where path = 'currency/options/base' and scope = 'default'), 'USD')");
        const allowed = sql("select ifnull((select value from core_config_data where path = 'currency/options/allow' and scope = 'default'), '')").split(',').filter(Boolean);
        const display = allowed.find((code) => code !== baseCurrency) ?? null;
        if (display === null) {
            console.log(`SKIP  ${scenario}: the store allows one currency only (${baseCurrency})`);
            return;
        }
        await page.goto(`${base}/directory/currency/switch/?currency=${display}`, { waitUntil: 'domcontentloaded' });
        await fillCart(page, PAIRS.currency);
        await openCheckout(j);
        const codes = await page.evaluate(() => { const c = JSON.parse(document.querySelector('#checkout-config').textContent); return { base: c.totalsData?.base_currency_code, quote: c.totalsData?.quote_currency_code, pattern: c.priceFormat?.pattern, basePattern: c.basePriceFormat?.pattern }; });
        check(`the session shows ${display} while the store bills in ${baseCurrency}`, codes.quote === display && codes.base === baseCurrency, JSON.stringify(codes));
        await fillEmail(page, `e2e.checkout-flow.currency.${RUN}@example.com`);
        await fillAddress(page, 'shipping', MICHIGAN);
        check('rates for the typed address', await waitForRates(page));
        await selectPayment(j, 'checkmo');
        await j.settled();
        const notice = await text(page, '[data-base-charge-notice]');
        const totals = (await totalRow(page, 'grand_total')) ?? '';
        const baseSymbol = (codes.basePattern ?? '').replace('%s', '').trim();
        const displaySymbol = (codes.pattern ?? '').replace('%s', '').trim();
        check('the grand total is in the display currency', displaySymbol !== '' && totals.includes(displaySymbol), totals);
        check('the charge notice names the amount in the base currency', notice !== null && /will be charged/i.test(notice) && baseSymbol !== '' && notice.includes(baseSymbol) && money(notice) > 0 && money(notice) !== money(totals), `${notice} (total ${totals})`);
        const maskedId = await page.evaluate(() => String(JSON.parse(document.querySelector('#checkout-config').textContent).quoteData?.entity_id ?? ''));
        const expected = /^[A-Za-z0-9]+$/.test(maskedId) ? Number(sql(`select q.base_grand_total from quote q join quote_id_mask m on m.quote_id = q.entity_id where m.masked_id = '${maskedId}'`)) : NaN;
        check('the notice amount is the base grand total of the quote', notice !== null && Math.abs(money(notice) - expected) < 0.011, `${notice} vs ${expected}`);
        noProblems(j, 'guest');
    } finally { await j.close(); }
};

scenarios.F12 = async () => {
    // An item that sells out between the load of the checkout and the order.
    {
        const j = await newJourney();
        const { page } = j;
        let stock = null;
        try {
            const email = `e2e.checkout-flow.stock.${RUN}@example.com`;
            await fillCart(page, PAIRS.stock);
            await openCheckout(j);
            await fillEmail(page, email);
            await fillAddress(page, 'shipping', MICHIGAN);
            check('stock: rates for the typed address', await waitForRates(page));
            await selectPayment(j, 'checkmo');
            check('stock: Place Order usable while everything is in stock', await waitForGate(page), await visibleErrors(page));
            await j.settled();
            stock = withFixture(`stock of ${STOCK_ITEM.sku}`, 'stock-zero-fixture.php', `--apply ${STOCK_ITEM.sku}`, `--remove ${STOCK_ITEM.sku}`);
            const before = lastOrder(email);
            await page.locator('[data-hyperion-place-order] button').click();
            await page.waitForFunction(() => document.querySelector('hc-section-status[section="order"] [data-section-status]') !== null || location.href.includes('success'), null, { timeout: 60000 }).catch(() => {});
            await sleep(500);
            const status = await sectionStatus(page, 'order');
            const cartUrl = await page.evaluate(() => JSON.parse(document.querySelector('#checkout-config')?.textContent ?? '{}').hyperion?.cartUrl ?? null).catch(() => null);
            check('stock: no order is placed for an item that sold out', !page.url().includes('success') && (lastOrder(email)?.id ?? 0) === (before?.id ?? 0), page.url().replace(base, ''));
            check('stock: the order section says the item is not available, in plain words', status !== null && status.kind === 'stock' && status.text.length > 10 && !/No such entity|Failed to fetch|%1|\{/.test(status.text), JSON.stringify(status));
            check('stock: the message links to the cart', status !== null && status.href !== null && status.href === cartUrl && (status.action ?? '') !== '', JSON.stringify({ status, cartUrl }));
            const typed = await page.evaluate(() => ({ street: document.querySelector('#hc-shipping-street_0')?.value, email: document.querySelector('#hc-contact-email')?.value }));
            check('stock: the typed data is intact after the refusal', typed.street === MICHIGAN.street && typed.email === email, JSON.stringify(typed));
            await shot(page, 'stock-refused');
            check('stock: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        } finally {
            stock?.remove();
            await j.close();
        }
    }
    // The minimum order amount: both carts are prepared first, the setting is on only for the checks.
    {
        const below = await newJourney();
        const above = await newJourney();
        let restoreMinimum = null;
        try {
            await fillCart(below.page, PAIRS.minimumBelow);
            await fillCart(above.page, PAIRS.minimumCoupon);
            await openCheckout(above);
            await fillEmail(above.page, `e2e.checkout-flow.minimum.${RUN}@example.com`);
            await fillAddress(above.page, 'shipping', MICHIGAN);
            check('minimum: rates for the typed address', await waitForRates(above.page));
            await selectPayment(above, 'checkmo');
            await waitForGate(above.page);
            await above.settled();

            if (!(await waitForNoMinimumOrder())) console.log('F12: the minimum order amount is already switched on; what is stored now is what gets restored');
            restoreMinimum = withConfig('minimum order amount', { 'sales/minimum_order/active': '1', 'sales/minimum_order/amount': String(MINIMUM_AMOUNT) });

            await below.page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
            await below.page.waitForFunction(() => /minimum/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
            const bounced = await below.page.evaluate(() => ({ path: location.pathname, app: document.querySelector('checkout-app') !== null,
                notice: [...document.querySelectorAll('hyperion-messages, [role="alert"], [data-hyperion-minimum-order], .message')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /minimum/i.test(t))[0] ?? (document.body.innerText.match(/[^\n]*minimum order[^\n]*/i)?.[0] ?? '') }));
            check('minimum: a cart below the amount is sent from the checkout to the cart with the notice', /\/checkout\/cart\/?$/.test(bounced.path) && !bounced.app && /minimum order/i.test(bounced.notice), JSON.stringify(bounced));

            await above.page.reload({ waitUntil: 'load' });
            await above.page.waitForSelector('checkout-app', { timeout: 40000 });
            const rule = await above.page.evaluate(() => JSON.parse(document.querySelector('#checkout-config').textContent).hyperion?.minimumOrder ?? null);
            check('minimum: the checkout is told the rule', rule !== null && Number(rule.amount) === MINIMUM_AMOUNT && typeof rule.description === 'string' && rule.description !== '', JSON.stringify(rule));
            check('minimum: Place Order usable while the cart is above the amount', await waitForGate(above.page), await visibleErrors(above.page));
            await above.settled(1500);
            await applyCoupon(above, COUPON.sixty);
            await above.settled(1500);
            const subtotal = money(await totalRow(above.page, 'subtotal'));
            const discount = money(await totalRow(above.page, 'discount'));
            check('minimum: the coupon takes the cart below the amount', (await appliedCoupon(above.page)) === COUPON.sixty && subtotal + discount < MINIMUM_AMOUNT, `subtotal ${subtotal}, discount ${discount}`);
            check('minimum: Place Order closes when the coupon takes the cart below the amount', await waitForGate(above.page, false, 8000));
            const banner = await text(above.page, '[data-error-banner]');
            // The closed button is aria-disabled, which the click helper would wait on: a real pointer press goes through.
            await above.page.locator('[data-hyperion-place-order] button').click({ force: true, timeout: 10000 });
            await sleep(600);
            const hint = await text(above.page, '[data-place-order-hint]');
            check('minimum: the reason is on screen (the store notice and the hint under Place Order)', rule !== null && (banner ?? '').includes(rule.description) && (hint ?? '').includes(rule.description), JSON.stringify({ banner, hint }));
            check('minimum: no order request left', !above.rest.some((r) => r.name === 'payment-information' && r.method === 'POST'));
            await shot(above.page, 'minimum-order');

            await above.page.locator('coupon-form hc-button[variant="ghost"] button').click();
            await above.page.waitForFunction(() => document.querySelector('coupon-form code') === null, null, { timeout: 30000 }).catch(() => {});
            await above.settled(1500);
            check('minimum: removing the coupon opens Place Order again', await waitForGate(above.page, true, 15000), await visibleErrors(above.page));
            restoreMinimum();
            restoreMinimum = null;
            check('minimum: no page errors / HTTP 5xx', below.problems.length + above.problems.length === 0, [...below.problems, ...above.problems].slice(0, 4).join(' | '));
        } finally {
            restoreMinimum?.();
            await below.close();
            await above.close();
        }
    }
};

scenarios.F13 = async () => {
    const j = await newJourney();
    const { page } = j;
    try {
        await fillCart(page, PAIRS.csp);
        const [documentResponse] = await Promise.all([
            page.waitForResponse((r) => r.request().resourceType() === 'document' && /\/checkout\/?$/.test(r.url().replace(/[?#].*$/, '')), { timeout: 40000 }).catch(() => null),
            openCheckout(j),
        ]);
        const headers = documentResponse?.headers() ?? {};
        const policy = headers['content-security-policy'] ?? headers['content-security-policy-report-only'] ?? '';
        const mode = headers['content-security-policy'] ? 'enforced' : headers['content-security-policy-report-only'] ? 'report only' : 'absent';
        console.log(`F13: Content Security Policy of the checkout page: ${mode}, ${policy.length} characters`);
        check('the checkout page carries a Content Security Policy', policy !== '', mode);
        await fillEmail(page, `e2e.checkout-flow.csp.${RUN}@example.com`);
        await fillAddress(page, 'shipping', MICHIGAN);
        check('rates for the typed address', await waitForRates(page));
        await page.waitForSelector('payment-method-row', { timeout: 40000 });
        await j.settled();
        const rows = await page.evaluate(() => [...document.querySelectorAll('payment-method-row input[type="radio"]')].map((i) => ({ code: i.id.replace('hc-pay-', ''), disabled: i.disabled })));
        const offline = /^(checkmo|banktransfer|cashondelivery|purchaseorder|free)$/;
        const gateways = rows.filter((r) => !r.disabled && !offline.test(r.code));
        console.log(`F13: payment rows ${rows.map((r) => r.code + (r.disabled ? ' (not supported)' : '')).join(', ')}`);
        const atLoad = await page.evaluate(() => window.__hyperionFlow.csp.splice(0));
        check('no Content Security Policy violation at the load of the checkout', atLoad.length === 0, JSON.stringify(atLoad).slice(0, 280));
        if (gateways.length === 0) console.log('F13: no gateway row is offered by this store, only the load was watched');
        for (const row of gateways) {
            await page.check(`#hc-pay-${row.code}`);
            await sleep(6000);
            await j.settled(1000, 20000);
            const events = await page.evaluate(() => window.__hyperionFlow.csp.splice(0));
            check(`no Content Security Policy violation while ${row.code} is selected`, events.length === 0, JSON.stringify(events).slice(0, 280));
        }
        // The watch itself: an image from a host no policy lists must be reported to the same listener.
        if (/(^|;)\s*(img-src|default-src)\s/.test(policy)) {
            await page.evaluate(() => { const img = new Image(); img.src = 'https://csp-watch-control.invalid/pixel.png'; document.body.append(img); });
            await sleep(1500);
            const control = await page.evaluate(() => window.__hyperionFlow.csp.splice(0));
            check('the watch reports a violation the check provokes itself', control.some((e) => /img-src/.test(e.directive)), JSON.stringify(control).slice(0, 200));
        }
        check('no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
    } finally { await j.close(); }
};

scenarios.F14 = async () => {
    if (!WITH_BRAINTREE) {
        console.log('SKIP  F14: run with --with-braintree to place the Braintree card orders');
        return;
    }
    const active = sql("select ifnull((select value from core_config_data where path = 'payment/braintree/active' and scope = 'default'), '0')") === '1'
        && sql("select count(*) from setup_module where module = 'PayPal_Braintree'") === '1';
    if (!active) {
        console.log('SKIP  F14: the Braintree card method is not active on this store (payment/braintree/active is not 1 or PayPal_Braintree is not installed)');
        return;
    }
    const field = (page, name) => page.frameLocator(`iframe[name="braintree-hosted-field-${name}"]`);
    const payByCard = async (j, email, label) => {
        const { page } = j;
        await page.waitForSelector('#hc-pay-braintree', { timeout: 40000 });
        await page.check('#hc-pay-braintree');
        await field(page, 'number').locator('input#credit-card-number').waitFor({ timeout: 45000 });
        check(`${label}: the hosted fields render in the selected row`, await page.locator('iframe[name^="braintree-hosted-field-"]').count() >= 3);
        await field(page, 'number').locator('input#credit-card-number').pressSequentially('4111111111111111', { delay: 30 });
        await field(page, 'expirationDate').locator('input#expiration').pressSequentially('1230', { delay: 30 });
        await field(page, 'cvv').locator('input#cvv').pressSequentially('123', { delay: 30 });
        await j.settled(1500);
        check(`${label}: Place Order usable with the card typed`, await waitForGate(page), await visibleErrors(page));
        const order = await placeOrder(j, email, `${label} card`);
        check(`${label}: the order is paid with the Braintree card`, order !== null && order.method === 'braintree', JSON.stringify(order));
    };
    {
        const j = await newJourney();
        try {
            const email = `e2e.checkout-flow.card.${RUN}@example.com`;
            await fillCart(j.page, PAIRS.cardGuest);
            await openCheckout(j);
            await fillEmail(j.page, email);
            await fillAddress(j.page, 'shipping', MICHIGAN);
            check('guest: rates for the typed address', await waitForRates(j.page));
            await j.settled();
            await payByCard(j, email, 'guest');
            noProblems(j, 'guest');
        } finally { await j.close(); }
    }
    {
        const j = await newJourney();
        try {
            const customer = createCustomer('card', 2);
            await login(j.page, customer);
            await fillCart(j.page, PAIRS.cardCustomer);
            await openCheckout(j);
            check('customer: rates for the default saved address', await waitForRates(j.page));
            await j.settled();
            await payByCard(j, customer.email, 'customer');
            noProblems(j, 'customer');
        } finally { await j.close(); }
    }
};

// ---------------------------------------------------------------- run
const order = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F10', 'F11', 'F12', 'F13', 'F14'];
// Back from the success page (F9) is checked with the guest order of F4.
const wanted = only.length ? order.filter((id) => only.includes(id) || (id === 'F4' && only.includes('F9'))) : order;

try {
    copyFixture('checkout-flow-fixture.php');
    const coupons = withFixture('checkout flow coupons removed', 'checkout-flow-fixture.php', '--apply', '--remove');
    console.log(`fixtures: coupons ${JSON.stringify(coupons.applied?.rules ?? null)}; scenarios ${wanted.join(' ')}`);
    for (const id of wanted) {
        scenario = id;
        const mark = cleanups.length;
        try {
            await scenarios[id]();
        } catch (e) {
            check('scenario ran to its end', false, String(e?.message ?? e).split('\n')[0]);
        } finally {
            // Whatever the scenario left switched on goes back before the next one starts.
            while (cleanups.length > mark) {
                const { label, undo } = cleanups.pop();
                try { undo(); console.log(`restored: ${label}`); } catch (e) { console.error(`RESTORE FAILED: ${label}: ${String(e.message).slice(0, 200)}`); }
            }
        }
    }
} finally {
    await browser.close().catch(() => {});
    runCleanups();
    for (const name of ['checkout-flow-fixture.php', 'payment-rule-fixture.php', 'stock-zero-fixture.php']) {
        try { compose('php-fpm', `rm -f /tmp/${name}`); } catch { /* the container is gone */ }
    }
}

if (gateNumbers.length > 0) {
    console.log('\nReload to a usable Place Order (five reloads each):');
    for (const g of gateNumbers) console.log(`  ${g.label.padEnd(9)} REST calls before: ${g.before.join(' ')}   ms after first contentful paint: ${g.ms.join(' ')}   median ${g.median}   max ${g.max}`);
}
const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({
    base, total: results.length, passed: results.length - failed.length,
    gate: gateNumbers, orders: created.orders, customers: created.customers,
    failed: failed.map((f) => `${f.name}: ${f.detail}`),
}, null, 2));
process.exit(failed.length ? 1 : 0);

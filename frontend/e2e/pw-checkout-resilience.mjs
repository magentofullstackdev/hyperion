#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of what the checkout does when a request fails or loses its answer.
// Usage: node e2e/pw-checkout-resilience.mjs <baseUrl> <magentoDir> [--shots <dir>] [--who guest|customer] [--only <name,...>]
//   node e2e/pw-checkout-resilience.mjs https://shop.example /path/to/the/magento/install
// Every failure is injected in the browser (request routing, the offline switch,
// the page clock); nothing on the server is touched and no configuration value
// is changed. Each scenario runs as a guest and as a customer the script
// registers for the run (the expired session is a customer scenario only):
//   offline       the connection drops around a shipping method change
//   unavailable   an HTML 503 answers the shipping save
//   rate-limit    a 429 with Retry-After answers the shipping estimate
//   timeout       the shipping estimate gets no answer (the page clock is moved
//                 past the client's time limit while the request is held)
//   session       401 on the customer cart routes, then a real sign-in
//   unconfirmed   the order request and the cart read both fail
//   one-order     double click, Enter and a street edited right before the press
//   not-placed    the order request never reaches the store
//   placed        the order request reaches the store and its answer is lost
//   other-tab     the order is placed in a second tab of the same session
// In every scenario no text on the page may show a raw transport error, an
// HTTP status, core's "No such entity" phrase or HTML source.
// The shipping address of an order is read with e2e/fixtures/order-address-fixture.php
// (read only, run inside php-fpm of the install). The store must offer two
// shipping methods and Check / Money order, and the customer_login and
// customer_create reCAPTCHA must let a headless browser through (see
// docs/development.md). Eight orders are placed. Prints numbered PASS / FAIL
// lines and a JSON summary, exit code 1 on any failure, page error or HTTP 5xx
// the scenario did not inject.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
// PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host
// that is not in /etc/hosts yet (Chromium host resolver rules).
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const optionValues = new Set(['--shots', '--who', '--only'].map((name) => option(name)).filter(Boolean));
const base = (args.find((a) => a.startsWith('http')) ?? '').replace(/\/$/, '');
const magentoArg = args.find((a) => !a.startsWith('http') && !a.startsWith('--') && !optionValues.has(a));
if (!/^https?:\/\//.test(base) || !magentoArg) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <magentoDir> [--shots dir] [--who guest|customer] [--only name,...]');
    process.exit(2);
}
const magentoDir = path.resolve(magentoArg);
const shotsDir = option('--shots');
const onlyWho = option('--who');
const only = option('--only')?.split(',') ?? null;
const wanted = (name) => only === null || only.includes(name);
const u = makeUrl(await resolveUrlSuffix(base));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'order-address-fixture.php');
function compose(service, cmd, user) {
    const userArgs = user ? ['-u', user] : [];
    return execFileSync('docker', ['compose', '--project-directory', magentoDir, 'exec', '-T', ...userArgs, service, 'bash', '-c', cmd],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
execFileSync('docker', ['compose', '--project-directory', magentoDir, 'cp', FIXTURE, 'php-fpm:/tmp/order-address-fixture.php'], { stdio: ['ignore', 'pipe', 'pipe'] });
const orderAddress = (incrementId) => {
    try {
        return JSON.parse(compose('php-fpm', `cd /var/www/html && php /tmp/order-address-fixture.php /var/www/html ${incrementId}`, 'www-data').trim().split('\n').pop());
    } catch (e) {
        return { found: false, error: String(e.message).slice(0, 120) };
    }
};

// The English texts of the checkout catalog the scenarios expect.
const TEXT = {
    offline: 'You appear to be offline. Check your connection and try again.',
    unavailable: 'The store is temporarily unavailable. Please try again in a moment.',
    rateLimited: 'Too many requests. Please wait 3 seconds.',
    timeout: 'The store is taking too long to answer. Please try again.',
    sessionExpired: 'Your session has expired. Sign in again to continue. What you entered has been kept.',
    quoteGone: 'Your cart has changed or expired.',
    notPlaced: 'We could not reach the store. Your order was not placed. Please try again.',
    unknown: 'We could not confirm whether your order was placed. Please do not pay again yet.',
    confirming: 'Confirming your order',
    retry: 'Try again',
    checkAgain: 'Check again',
    returnToCart: 'Return to cart',
};
const HTML_BODY_MARKER = 'Backend fetch failed';
// What no shopper may ever read: transport errors of the browser, a bare HTTP
// status, core's missing entity phrase, the body of an injected answer, markup.
const FORBIDDEN = [
    ['Failed to fetch', ''], ['Load failed', ''], ['NetworkError', ''], ['HTTP 5', ''], ['No such entity', ''],
    [HTML_BODY_MARKER, ''], ['<\\/?(?:html|head|body|title|h1|div|script)\\b[^>]*>', 'i'],
];
const DRAFT_PREFIX = 'hyperion.checkout.draft.v1';
const PASSWORD = `Rs-${Date.now().toString(36)}-Kq7!x`;
const ADDRESS = { firstname: 'Resilience', lastname: 'Check', street: '1 Test Street', city: 'Calder', region: 'Michigan', postcode: '49628', telephone: '5552293326' };
// Simple products of the sample data; two or three of them make a cart above 100.
const PRODUCTS = [
    '/dash-digital-watch.html', '/fusion-backpack.html', '/didi-sport-watch.html', '/impulse-duffle.html',
    '/summit-watch.html', '/cruise-dual-analog-watch.html', '/clamber-watch.html', '/endurance-watch.html',
    '/bolo-sport-watch.html', '/push-it-messenger-bag.html', '/overnight-duffle.html', '/wayfarer-messenger-bag.html',
    '/rival-field-messenger.html', '/aim-analog-watch.html', '/luma-analog-watch.html', '/joust-duffle-bag.html',
];
let productCursor = 0;
const CART_MINIMUM = 100;

const results = [];
const orders = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail).slice(0, 600) });
    console.log(`${String(results.length).padStart(3, '0')} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).replace(/\s+/g, ' ').slice(0, 600) : ''}`);
};

const browser = await chromium.launch({ headless: true, ...launchOptions() });

const isOrderPost = (request) => request.method() === 'POST' && /\/payment-information(\?|$)/.test(request.url());
const isShippingSave = (request) => request.method() === 'POST' && /\/shipping-information(\?|$)/.test(request.url());
const isEstimate = (request) => request.method() === 'POST' && /\/estimate-shipping-methods(-by-address-id)?(\?|$)/.test(request.url());
const CART_READ = /\/V1\/(guest-carts\/[^/?]+|carts\/mine)(\?.*)?$/;
const isCartRead = (request) => request.method() === 'GET' && CART_READ.test(request.url());
const onSuccessPage = (url) => url.toString().includes('/checkout/onepage/success');

// A browser context with the collectors every scenario reads: page errors and
// HTTP 5xx answers that were not injected, the requests, and every forbidden
// text the checkout showed at any moment (a mutation observer in the page).
async function newJourney(label, { clock = false } = {}) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const j = { ctx, label, problems: [], injected5xx: [], leaks: [], requests: [], page: null };
    await ctx.exposeBinding('__hcLeak', (_source, text) => { j.leaks.push(String(text)); });
    await ctx.addInitScript((patterns) => {
        if (window.top !== window || !location.pathname.includes('/checkout')) return;
        const tests = patterns.map(([source, flags]) => new RegExp(source, flags));
        const seen = new Set();
        const scan = () => {
            const text = document.body ? document.body.innerText : '';
            for (const test of tests) {
                const match = test.exec(text);
                if (!match) continue;
                const snippet = text.slice(Math.max(0, match.index - 60), match.index + 100).replace(/\s+/g, ' ');
                if (seen.has(snippet)) continue;
                seen.add(snippet);
                window.__hcLeak(snippet);
            }
        };
        window.__hcScan = scan;
        new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true });
    }, FORBIDDEN);
    if (clock) await ctx.clock.install();
    j.attach = (page) => {
        page.on('pageerror', (e) => j.problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 140)}`));
        page.on('request', (r) => j.requests.push(r));
        page.on('response', (r) => {
            if (r.status() < 500) return;
            const expected = j.injected5xx.findIndex((fragment) => r.url().includes(fragment));
            if (expected >= 0) { j.injected5xx.splice(expected, 1); return; }
            j.problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`);
        });
        return page;
    };
    j.page = j.attach(await ctx.newPage());
    return j;
}

let shotIndex = 0;
async function shot(page, name) {
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${String(++shotIndex).padStart(2, '0')}-${name}.png`), fullPage: true }).catch(() => {});
}

// The forbidden texts seen since `from` (an index into the journey's list), after one more scan of the open pages.
async function leaksSince(j, from) {
    for (const page of j.ctx.pages()) await page.evaluate(() => window.__hcScan?.()).catch(() => {});
    return j.leaks.slice(from);
}

async function addProduct(page) {
    for (let attempt = 0; attempt < PRODUCTS.length; attempt++) {
        const product = PRODUCTS[productCursor++ % PRODUCTS.length];
        const response = await page.goto(base + u(product), { waitUntil: 'networkidle' });
        if (!response || response.status() !== 200 || await page.locator('#product_addtocart_form button[type="submit"]').count() === 0) continue;
        const added = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/checkout/cart/add'), { timeout: 30000 }).catch(() => null);
        await page.click('#product_addtocart_form button[type="submit"]');
        await added;
        await page.waitForFunction(() => {
            const n = document.querySelector('#hyperion-notification');
            return n && !n.hidden && n.innerText.trim().length > 0;
        }, null, { timeout: 25000 }).catch(() => {});
        if (await page.evaluate(() => document.querySelector('#hyperion-notification')?.getAttribute('data-tone')) === 'success') return product;
    }
    throw new Error('no product of the list could be added to the cart');
}

const readConfig = (page) => page.evaluate(() => {
    try { return JSON.parse(document.querySelector('#checkout-config').textContent); } catch { return null; }
});
const draftKeys = (page) => page.evaluate((prefix) => Object.keys(sessionStorage).filter((key) => key.startsWith(prefix)), DRAFT_PREFIX);

// Opens the checkout with a cart above the minimum, adding products while it is below.
async function openCheckout(page) {
    for (let round = 0; round < 5; round++) {
        await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
        const config = /\/checkout\/?(\?|#|$)/.test(page.url()) ? await readConfig(page) : null;
        const subtotal = Number(config?.totalsData?.subtotal ?? 0);
        if (config && subtotal > CART_MINIMUM) {
            await page.waitForSelector('checkout-app [data-hyperion-place-order] button', { timeout: 30000 });
            return config;
        }
        await addProduct(page);
    }
    throw new Error('the cart did not reach the minimum the scenarios need');
}

async function fillAddress(page, { email = null, street = ADDRESS.street, postcode = ADDRESS.postcode } = {}) {
    const fill = async (selector, value) => {
        const input = page.locator(selector).first();
        if (await input.inputValue() !== value) await input.fill(value);
    };
    if (email) {
        await fill('checkout-email input[type="email"]', email);
        await page.locator('checkout-email input[type="email"]').first().blur();
    }
    await page.waitForSelector('checkout-shipping input[name="firstname"]', { timeout: 30000 });
    await fill('checkout-shipping input[name="firstname"]', ADDRESS.firstname);
    await fill('checkout-shipping input[name="lastname"]', ADDRESS.lastname);
    const country = page.locator('checkout-shipping select[name="country_id"]').first();
    if (await country.inputValue() !== 'US') await country.selectOption('US');
    await fill('checkout-shipping input[name="street_0"]', street);
    await fill('checkout-shipping input[name="postcode"]', postcode);
    await fill('checkout-shipping input[name="city"]', ADDRESS.city);
    await page.waitForSelector('checkout-shipping select[name="region_id"]', { timeout: 15000 });
    await page.locator('checkout-shipping select[name="region_id"]').first().selectOption({ label: ADDRESS.region });
    await fill('checkout-shipping input[name="telephone"]', ADDRESS.telephone);
    await page.locator('checkout-shipping input[name="telephone"]').first().blur();
}

const placeOrderButton = (page) => page.locator('[data-hyperion-place-order] button');
const placeOrderUsable = (page, timeout = 40000) => page.waitForFunction(() => {
    const button = document.querySelector('[data-hyperion-place-order] button');
    return !!button && button.getAttribute('aria-disabled') !== 'true' && !button.disabled;
}, null, { timeout }).then(() => true).catch(() => false);

// Rates on screen, Check / Money order selected, Place Order usable.
async function makeReady(page) {
    await page.waitForSelector('shipping-method-row input[name="shipping_method"]:not([disabled])', { timeout: 40000 });
    await page.waitForSelector('#hc-pay-checkmo', { timeout: 40000 });
    if (!await page.locator('#hc-pay-checkmo').isChecked()) await page.locator('#hc-pay-checkmo').check();
    return placeOrderUsable(page);
}

// What the shopper entered and chose, as the page shows it.
const snapshot = (page) => page.evaluate(() => {
    const value = (selector) => document.querySelector(selector)?.value ?? null;
    return {
        email: value('checkout-email input[type="email"]'),
        firstname: value('checkout-shipping input[name="firstname"]'),
        lastname: value('checkout-shipping input[name="lastname"]'),
        street: value('checkout-shipping input[name="street_0"]'),
        city: value('checkout-shipping input[name="city"]'),
        postcode: value('checkout-shipping input[name="postcode"]'),
        region: value('checkout-shipping select[name="region_id"]'),
        country: value('checkout-shipping select[name="country_id"]'),
        telephone: value('checkout-shipping input[name="telephone"]'),
        savedAddress: document.querySelector('checkout-shipping input[name="saved-shipping-address"]:checked')?.closest('[data-hyperion-address-card]')?.getAttribute('data-hyperion-address-card') ?? null,
        shipping: document.querySelector('input[name="shipping_method"]:checked')?.id ?? null,
        payment: document.querySelector('input[name="payment_method"]:checked')?.id ?? null,
    };
});
const sameInput = (before, after, { ignore = [] } = {}) => Object.keys(before).filter((key) => !ignore.includes(key) && before[key] !== after[key]);

// The failure message of one part of the page (`scope` is a CSS selector), null when there is none.
const statusIn = (page, scope) => page.evaluate((selector) => {
    const status = document.querySelector(`${selector} [data-section-status]`);
    if (!status) return null;
    const action = status.querySelector('[data-section-status-action]');
    return {
        kind: status.getAttribute('data-kind'),
        role: status.getAttribute('role'),
        text: status.querySelector('p')?.textContent.trim() ?? '',
        action: action ? action.textContent.trim() : null,
        actionHref: action?.getAttribute('href') ?? null,
        actionHeld: action?.getAttribute('aria-disabled') === 'true',
        focused: document.activeElement === status,
    };
}, scope);
const waitStatus = async (page, scope, kind, timeout = 20000) => {
    await page.waitForSelector(`${scope} [data-section-status]${kind ? `[data-kind="${kind}"]` : ''}`, { timeout }).catch(() => {});
    return statusIn(page, scope);
};
const waitNoStatus = (page, scope, timeout = 20000) => page.waitForFunction((selector) => !document.querySelector(`${selector} [data-section-status]`), scope, { timeout }).then(() => true).catch(() => false);
const SHIPPING = 'checkout-shipping';
const ORDER = 'hc-section-status[section="order"]';
const bannerText = (page) => page.evaluate(() => (document.querySelector('error-banner')?.innerText ?? '').trim());

// Selects the shipping method that is not selected and returns the id of its radio.
async function changeShippingMethod(page) {
    const other = page.locator('input[name="shipping_method"]:not(:checked):not([disabled])').first();
    const id = await other.getAttribute('id');
    await other.check();
    return id;
}

async function orderNumberOnPage(page) {
    await page.waitForLoadState('networkidle').catch(() => {});
    return page.evaluate(() => ((document.querySelector('main') ?? document.body).innerText.match(/\b(\d{9,})\b/) || [])[1] || '');
}

async function register(page, email) {
    await page.goto(base + '/customer/account/create/', { waitUntil: 'networkidle' });
    await page.fill('#firstname', ADDRESS.firstname);
    await page.fill('#lastname', ADDRESS.lastname);
    await page.fill('#email_address', email);
    await page.fill('#password', PASSWORD);
    await page.fill('#password-confirmation', PASSWORD);
    await page.click('#form-validate button[type="submit"], form.form-create-account button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes('/account/create'), { timeout: 40000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    return /\/customer\/account\/?$/.test(page.url());
}

async function submitLogin(page, email) {
    await page.fill('#email', email);
    await page.fill('#pass', PASSWORD);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes('/account/login'), { timeout: 40000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    return !page.url().includes('/account/login');
}
async function login(page, email) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    return submitLogin(page, email);
}

// A journey with the checkout open and ready for an order: a guest with a typed
// address, or the customer signed in (who types one too while the account has
// no saved address, because the checkout then shows the form).
async function readyJourney(who, account, { clock = false } = {}) {
    const j = await newJourney(who, { clock });
    if (who === 'customer' && !await login(j.page, account.email)) throw new Error('the customer could not sign in: ' + j.page.url());
    j.config = await openCheckout(j.page);
    j.email = who === 'guest' ? `resilience.guest.${Date.now()}@example.com` : account.email;
    const typed = who === 'guest' || await j.page.locator('checkout-shipping [data-hyperion-address-card]').count() === 0;
    if (typed) await fillAddress(j.page, { email: who === 'guest' ? j.email : null });
    j.ready = await makeReady(j.page);
    if (!j.ready) throw new Error('Place Order did not become usable before the scenario');
    return j;
}

async function closeJourney(j, title) {
    check(`${title}: no page errors, no HTTP 5xx that was not injected`, j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
    await j.ctx.close();
}

// ---------------------------------------------------------------- scenarios

// The connection drops, the shopper picks another shipping method, the connection comes back.
async function offlineScenario(j, who) {
    const { page, ctx } = j;
    const title = `${who} offline during a shipping save`;
    const leaksFrom = j.leaks.length;
    const before = await snapshot(page);
    await ctx.setOffline(true);
    const chosen = await changeShippingMethod(page);
    const status = await waitStatus(page, SHIPPING, 'offline');
    await shot(page, `${who}-offline`);
    check(`${title}: the shipping section shows the translated offline message`, status?.kind === 'offline' && status.text === TEXT.offline, JSON.stringify(status));
    const during = await snapshot(page);
    const changed = sameInput(before, during, { ignore: ['shipping'] });
    check(`${title}: the email and the address are intact`, changed.length === 0 && during.shipping === chosen, `changed: ${changed.join(',') || 'nothing'}; method ${during.shipping}`);
    const savesBefore = j.requests.filter(isShippingSave).length;
    const saved = page.waitForResponse((r) => isShippingSave(r.request()) && r.status() === 200, { timeout: 30000 }).then(() => true).catch(() => false);
    await ctx.setOffline(false);
    const retried = await saved;
    const cleared = await waitNoStatus(page, SHIPPING) && await waitNoStatus(page, ORDER);
    check(`${title}: back online the save is sent again without a click and the message disappears`, retried && cleared,
        `saved ${retried}, messages gone ${cleared}, ${j.requests.filter(isShippingSave).length - savesBefore} save requests after the reconnect`);
    check(`${title}: Place Order is usable again`, await placeOrderUsable(page) && (await snapshot(page)).shipping === chosen);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// A proxy answers the shipping save with an HTML error page.
async function unavailableScenario(j, who) {
    const { page } = j;
    const title = `${who} HTML 503 on the shipping save`;
    const leaksFrom = j.leaks.length;
    const before = await snapshot(page);
    j.injected5xx.push('/shipping-information');
    await page.route('**/shipping-information*', (route) => route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: `<html><body><h1>503 Service Unavailable</h1><p>${HTML_BODY_MARKER}</p></body></html>`,
    }), { times: 1 });
    const chosen = await changeShippingMethod(page);
    const status = await waitStatus(page, SHIPPING, 'unavailable');
    await shot(page, `${who}-unavailable`);
    const banner = await bannerText(page);
    check(`${title}: the shipping section shows the translated unavailable message with "${TEXT.retry}"`,
        status?.kind === 'unavailable' && status.text === TEXT.unavailable && status.action === TEXT.retry && banner === '', `${JSON.stringify(status)} banner "${banner}"`);
    check(`${title}: the body of the answer is nowhere in the document`, !(await page.content()).includes(HTML_BODY_MARKER));
    const saved = page.waitForResponse((r) => isShippingSave(r.request()) && r.status() === 200, { timeout: 30000 }).then(() => true).catch(() => false);
    await page.locator(`${SHIPPING} [data-section-status-action]`).click({ timeout: 5000 }).catch(() => {});
    const retried = await saved;
    const cleared = await waitNoStatus(page, SHIPPING);
    check(`${title}: "${TEXT.retry}" saves and the message disappears`, retried && cleared, `saved ${retried}, message gone ${cleared}`);
    const after = await snapshot(page);
    const changed = sameInput(before, after, { ignore: ['shipping'] });
    check(`${title}: the input is intact and Place Order is usable`, changed.length === 0 && after.shipping === chosen && await placeOrderUsable(page), `changed: ${changed.join(',') || 'nothing'}; method ${after.shipping}`);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// Types another postcode, which asks the store for the rates of the new address.
async function changePostcode(page, postcode) {
    const input = page.locator('checkout-shipping input[name="postcode"]').first();
    await input.fill(postcode);
    await input.blur();
}

// The rate limiter answers the shipping estimate once.
async function rateLimitScenario(j, who) {
    const { page } = j;
    const title = `${who} 429 on the shipping estimate`;
    const leaksFrom = j.leaks.length;
    const times = [];
    const onRequest = (request) => { if (isEstimate(request)) times.push(Date.now()); };
    page.on('request', onRequest);
    await page.route(/\/estimate-shipping-methods/, (route) => route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '3' },
        body: JSON.stringify({ message: 'Too many requests.' }),
    }), { times: 1 });
    await changePostcode(page, '49629');
    const status = await waitStatus(page, SHIPPING, 'rate-limited');
    await shot(page, `${who}-rate-limit`);
    check(`${title}: the shipping section shows the wait with the seconds of Retry-After`, status?.kind === 'rate-limited' && status.text === TEXT.rateLimited, JSON.stringify(status));
    const answered = await page.waitForResponse((r) => isEstimate(r.request()) && r.status() === 200, { timeout: 15000 }).then(() => true).catch(() => false);
    const waited = times.length >= 2 ? times[1] - times[0] : -1;
    check(`${title}: the estimate is sent again by itself after about three seconds`, answered && waited >= 2500 && waited <= 6000, `${times.length} estimate requests, ${waited} ms between the first two`);
    const cleared = await waitNoStatus(page, SHIPPING);
    const rows = await page.locator('shipping-method-row input[name="shipping_method"]:not([disabled])').count();
    check(`${title}: the rates appear and the message disappears`, cleared && rows > 0, `${rows} rates, message gone ${cleared}`);
    page.off('request', onRequest);
    await page.unroute(/\/estimate-shipping-methods/).catch(() => {});
    await placeOrderUsable(page);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// The shipping estimate gets no answer. The request is held by the route and
// the page clock jumps past the client's time limit, once per attempt the
// client makes, so no part of the product has to know about the test.
async function timeoutScenario(j, who) {
    const { page, ctx } = j;
    const title = `${who} shipping estimate without an answer`;
    const leaksFrom = j.leaks.length;
    const held = [];
    await page.route(/\/estimate-shipping-methods/, (route) => { held.push(route); });
    await changePostcode(page, '49630');
    let status = null;
    let jumps = 0;
    for (let attempt = 0; attempt < 5 && status?.kind !== 'timeout'; attempt++) {
        const expected = attempt + 1;
        const deadline = Date.now() + 8000;
        while (held.length < expected && Date.now() < deadline) await sleep(100);
        if (held.length < expected) break;
        await ctx.clock.fastForward(16000);
        jumps++;
        await page.waitForSelector(`${SHIPPING} [data-section-status][data-kind="timeout"]`, { timeout: 2500 }).catch(() => {});
        status = await statusIn(page, SHIPPING);
    }
    await shot(page, `${who}-timeout`);
    check(`${title}: the shipping section shows the translated timeout message with "${TEXT.retry}"`,
        status?.kind === 'timeout' && status.text === TEXT.timeout && status.action === TEXT.retry, `${JSON.stringify(status)} after ${held.length} held requests and ${jumps} clock jumps of 16 s`);
    await page.unroute(/\/estimate-shipping-methods/).catch(() => {});
    for (const route of held) await route.abort().catch(() => {});
    const answered = page.waitForResponse((r) => isEstimate(r.request()) && r.status() === 200, { timeout: 20000 }).then(() => true).catch(() => false);
    await page.locator(`${SHIPPING} [data-section-status-action]`).click({ timeout: 5000 }).catch(() => {});
    const retried = await answered;
    const cleared = await waitNoStatus(page, SHIPPING);
    const rows = await page.locator('shipping-method-row input[name="shipping_method"]:not([disabled])').count();
    check(`${title}: "${TEXT.retry}" gets the rates and the message disappears`, retried && cleared && rows > 0, `answered ${retried}, ${rows} rates, message gone ${cleared}`);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// The customer's session ends while an address is being typed.
async function sessionScenario(j, account) {
    const { page, ctx } = j;
    const title = 'customer expired session';
    const leaksFrom = j.leaks.length;
    const storeCode = j.config.storeCode;
    const handoffKey = `${DRAFT_PREFIX}:handoff:${storeCode}`;
    const typedStreet = `${String(Date.now()).slice(-5)} Restored Road`;
    await page.route('**/carts/mine/**', (route) => route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'The consumer isn\'t authorized to access %resources.', parameters: { resources: 'self' } }),
    }));
    const street = page.locator('checkout-shipping input[name="street_0"]').first();
    await street.fill(typedStreet);
    await street.blur();
    await page.waitForSelector('dialog[data-session-expired][open]', { timeout: 20000 }).catch(() => {});
    await page.keyboard.press('Escape');
    await sleep(300);
    const dialog = await page.evaluate(() => {
        const element = document.querySelector('dialog[data-session-expired]');
        return element ? { open: element.open, text: element.innerText.replace(/\s+/g, ' ').trim(), href: element.querySelector('[data-session-expired-login]')?.getAttribute('href') ?? '' } : null;
    });
    await shot(page, 'customer-session-expired');
    check(`${title}: a dialog that Escape does not close asks to sign in again`, !!dialog && dialog.open && dialog.text.includes(TEXT.sessionExpired) && dialog.href.includes('/customer/account/login'), JSON.stringify(dialog));
    const raw = await page.evaluate((key) => sessionStorage.getItem(key), handoffKey);
    const secrets = ['password', PASSWORD, 'paymentMethodData', 'nonce', 'public_hash', 'cc_number', 'cc_cid', 'form_key', 'po_number'].filter((word) => (raw ?? '').includes(word));
    check(`${title}: session storage holds the handoff draft with the typed street and no password or payment key`,
        !!raw && raw.includes(typedStreet) && secrets.length === 0, raw ? `${raw.length} characters; found: ${secrets.join(',') || 'none'}; street ${raw.includes(typedStreet)}` : `no ${handoffKey}`);
    // The session really ends here: without its cookies the sign-in page asks for the password.
    await page.unroute('**/carts/mine/**');
    await ctx.clearCookies();
    await page.locator('[data-session-expired-login]').click({ timeout: 5000 }).catch(() => {});
    await page.waitForURL((url) => url.toString().includes('/customer/account/login'), { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    const signedIn = page.url().includes('/customer/account/login') && await submitLogin(page, account.email);
    const landed = page.url().replace(base, '');
    check(`${title}: the sign-in through the dialog's link returns to the checkout`, signedIn && /^\/checkout\/?(\?|#|$)/.test(landed), `signed in ${signedIn}, landed on ${landed}`);
    if (!/^\/checkout\/?(\?|#|$)/.test(landed)) await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
    await page.waitForSelector('checkout-shipping input[name="street_0"]', { timeout: 30000 }).catch(() => {});
    await sleep(1000);
    const restored = await snapshot(page);
    const handoffLeft = await page.evaluate((key) => sessionStorage.getItem(key) !== null, handoffKey);
    check(`${title}: the typed address is back after the sign-in and the handoff draft is gone`,
        restored.street === typedStreet && restored.city === ADDRESS.city && restored.postcode === ADDRESS.postcode && !handoffLeft, `${JSON.stringify(restored)} handoff left ${handoffLeft}`);
    const ready = await makeReady(page);
    check(`${title}: the checkout is usable again`, ready);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// The order request and the read of the cart both fail: nobody knows whether an order exists.
async function unconfirmedScenario(j, who) {
    const { page } = j;
    const title = `${who} order outcome that cannot be confirmed`;
    const leaksFrom = j.leaks.length;
    const before = await snapshot(page);
    const count = (test) => j.requests.filter(test).length;
    const postsBefore = count(isOrderPost);
    await page.route(/\/payment-information(\?|$)/, (route) => (isOrderPost(route.request()) ? route.abort('connectionreset') : route.fallback()));
    await page.route(CART_READ, (route) => (isCartRead(route.request()) ? route.abort('connectionreset') : route.fallback()));
    await placeOrderButton(page).click();
    const status = await waitStatus(page, ORDER, 'order-unknown', 30000);
    await shot(page, `${who}-unconfirmed`);
    check(`${title}: the order section says so and offers "${TEXT.checkAgain}"`, status?.kind === 'order-unknown' && status.text === TEXT.unknown && status.action === TEXT.checkAgain, JSON.stringify(status));
    const latched = await placeOrderButton(page).getAttribute('aria-disabled');
    await placeOrderButton(page).click({ force: true, timeout: 5000 }).catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    const readsAtStatus = count(isCartRead);
    await sleep(7000);
    const posts = count(isOrderPost) - postsBefore;
    check(`${title}: Place Order is latched (aria-disabled, a press sends nothing)`, latched === 'true' && posts === 1, `aria-disabled ${latched}, ${posts} order requests`);
    check(`${title}: the cart is read again by itself while the outcome is unknown`, count(isCartRead) > readsAtStatus, `${count(isCartRead) - readsAtStatus} more reads in 7 s`);
    await page.unroute(/\/payment-information(\?|$)/);
    await page.unroute(CART_READ);
    await page.locator(`${ORDER} [data-section-status-action]`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForFunction((selector) => document.querySelector(`${selector} [data-section-status]`)?.getAttribute('data-kind') !== 'order-unknown', ORDER, { timeout: 20000 }).catch(() => {});
    const resolved = await statusIn(page, ORDER);
    const after = await snapshot(page);
    const changed = sameInput(before, after);
    const usable = await placeOrderUsable(page, 15000);
    check(`${title}: with the store reachable "${TEXT.checkAgain}" finds no order, says so and gives the checkout back`,
        resolved?.text === TEXT.notPlaced && usable && changed.length === 0 && !onSuccessPage(page.url()), `${JSON.stringify(resolved)} usable ${usable}, changed: ${changed.join(',') || 'nothing'}`);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// The street changes and Place Order is pressed twice, then Enter, before any save started.
async function oneOrderScenario(j, who) {
    const { page } = j;
    const title = `${who} double click, Enter and an edit right before Place Order`;
    const leaksFrom = j.leaks.length;
    const postsBefore = j.requests.filter(isOrderPost).length;
    const editedStreet = `${String(Date.now()).slice(-5)} Edited Lane`;
    // The page itself times the edit and the first press; the pointer is sent
    // to where the button is, with no wait for it in between.
    await page.evaluate(() => {
        const times = { edit: 0, press: 0 };
        window.__hcTimes = times;
        document.querySelector('checkout-shipping input[name="street_0"]').addEventListener('input', () => { times.edit = performance.now(); });
        document.querySelector('[data-hyperion-place-order] button').addEventListener('click', () => { times.press ||= performance.now(); }, true);
    });
    await page.locator('checkout-shipping input[name="street_0"]').first().fill(editedStreet);
    const box = await page.evaluate(() => {
        const button = document.querySelector('[data-hyperion-place-order] button');
        button.scrollIntoView({ block: 'center', behavior: 'instant' });
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    const pressedAfter = await page.evaluate(() => Math.round(window.__hcTimes.press - window.__hcTimes.edit)).catch(() => -1);
    for (let press = 0; press < 3; press++) await page.keyboard.press('Enter').catch(() => {});
    await page.waitForURL(onSuccessPage, { timeout: 60000 }).catch(() => {});
    const posts = j.requests.filter(isOrderPost).length - postsBefore;
    const placed = onSuccessPage(page.url());
    const number = placed ? await orderNumberOnPage(page) : '';
    await shot(page, `${who}-one-order`);
    check(`${title}: pressed within 300 ms of the edit, one order request, the success page follows`, placed && posts === 1 && pressedAfter >= 0 && pressedAfter <= 300, `${posts} order requests, pressed ${pressedAfter} ms after the edit, ${page.url().replace(base, '')} ${placed ? '' : JSON.stringify(await statusIn(page, ORDER))}`);
    const address = number ? orderAddress(number) : { found: false };
    if (number) orders.push({ who, scenario: 'one-order', number });
    check(`${title}: the shipping street of the order is the edited one`, address.found && address.street?.[0] === editedStreet, `order ${number || 'not found'}: ${JSON.stringify(address.street ?? address)}; typed "${editedStreet}"`);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// The order request never reaches the store.
async function notPlacedScenario(j, who) {
    const { page } = j;
    const title = `${who} order request that never reached the store`;
    const leaksFrom = j.leaks.length;
    const before = await snapshot(page);
    const count = (test) => j.requests.filter(test).length;
    const postsBefore = count(isOrderPost);
    const readsBefore = count(isCartRead);
    await page.route(/\/payment-information(\?|$)/, (route) => (isOrderPost(route.request()) ? route.abort('connectionreset') : route.fallback()));
    await placeOrderButton(page).click();
    const status = await waitStatus(page, ORDER, null, 30000);
    await sleep(1500);
    const settled = await statusIn(page, ORDER);
    await shot(page, `${who}-not-placed`);
    check(`${title}: the cart is read once and the order section says no order was placed`,
        status?.text === TEXT.notPlaced && count(isCartRead) - readsBefore === 1 && !onSuccessPage(page.url()), `${JSON.stringify(status)}; ${count(isCartRead) - readsBefore} cart reads`);
    check(`${title}: the message has the keyboard focus`, settled?.focused === true, JSON.stringify(settled));
    const after = await snapshot(page);
    const changed = sameInput(before, after);
    check(`${title}: every field, the shipping method and the payment method are intact`, changed.length === 0, `changed: ${changed.join(',') || 'nothing'} ${JSON.stringify(after)}`);
    await page.unroute(/\/payment-information(\?|$)/);
    const usable = await placeOrderUsable(page, 15000);
    if (usable) await placeOrderButton(page).click();
    await page.waitForURL(onSuccessPage, { timeout: 60000 }).catch(() => {});
    const placed = onSuccessPage(page.url());
    const number = placed ? await orderNumberOnPage(page) : '';
    if (number) orders.push({ who, scenario: 'not-placed', number });
    check(`${title}: a second press places the order`, placed && number !== '' && count(isOrderPost) - postsBefore === 2, `usable ${usable}, ${count(isOrderPost) - postsBefore} order requests, order ${number || 'none'}, ${page.url().replace(base, '')}`);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// The store places the order and the answer is lost on its way back.
async function placedScenario(j, who) {
    const { page } = j;
    const title = `${who} order placed, answer lost`;
    const leaksFrom = j.leaks.length;
    const count = (test) => j.requests.filter(test).length;
    const postsBefore = count(isOrderPost);
    let serverStatus = 0;
    await page.route(/\/payment-information(\?|$)/, async (route) => {
        if (!isOrderPost(route.request())) return route.fallback();
        const response = await route.fetch({ timeout: 120000 });
        serverStatus = response.status();
        return route.abort('connectionreset');
    });
    // The read of the cart is slowed down so the confirming state can be observed.
    await page.route(CART_READ, async (route) => {
        if (isCartRead(route.request())) await sleep(1500);
        return route.fallback();
    });
    const confirming = page.waitForFunction((text) => (document.querySelector('[data-loading-overlay]')?.innerText ?? '').includes(text), TEXT.confirming, { timeout: 90000, polling: 50 }).then(() => true).catch(() => false);
    await placeOrderButton(page).click();
    const sawConfirming = await confirming;
    await shot(page, `${who}-placed-confirming`);
    await page.waitForURL(onSuccessPage, { timeout: 60000 }).catch(() => {});
    const placed = onSuccessPage(page.url());
    const number = placed ? await orderNumberOnPage(page) : '';
    if (number) orders.push({ who, scenario: 'placed', number });
    await shot(page, `${who}-placed-success`);
    check(`${title}: the overlay says "${TEXT.confirming}..." while the cart is read`, sawConfirming, `store answered the order request with ${serverStatus}`);
    check(`${title}: the success page with the order number follows without a second press`, placed && number !== '', `${page.url().replace(base, '')} order ${number || 'none'} ${placed ? '' : JSON.stringify(await statusIn(page, ORDER))}`);
    check(`${title}: exactly one order request was sent`, count(isOrderPost) - postsBefore === 1, `${count(isOrderPost) - postsBefore} order requests`);
    const drafts = await draftKeys(page);
    check(`${title}: session storage holds no checkout draft after the order`, placed && drafts.length === 0, drafts.join(', '));
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// The same cart is ordered in a second tab, then the first tab changes the shipping method.
async function otherTabScenario(j, who) {
    const { page, ctx } = j;
    const title = `${who} cart ordered in another tab`;
    const leaksFrom = j.leaks.length;
    const second = j.attach(await ctx.newPage());
    // The second tab never opens its success page, so the session still holds the order for the first tab.
    await second.route(/\/checkout\/onepage\/success/, (route) => route.abort());
    await second.goto(base + '/checkout/', { waitUntil: 'networkidle' });
    const secondReady = await makeReady(second);
    const answered = second.waitForResponse((r) => isOrderPost(r.request()), { timeout: 60000 }).then((r) => r.status()).catch(() => 0);
    if (secondReady) await placeOrderButton(second).click();
    const orderStatus = await answered;
    await sleep(1500);
    await second.close();
    check(`${title}: the second tab places the order`, secondReady && orderStatus === 200, `ready ${secondReady}, order request answered ${orderStatus}`);
    const trail = [];
    page.on('response', (r) => { if (/\/rest\/|\/checkout\//.test(r.url()) && ['document', 'fetch', 'xhr'].includes(r.request().resourceType())) trail.push(`${r.request().method()} ${r.status()} ${r.url().replace(base, '').replace(/guest-carts\/[^/?]+/, 'guest-carts/<id>').slice(0, 70)}`); });
    const successRequested = page.waitForRequest((r) => onSuccessPage(r.url()), { timeout: 30000 }).then(() => true).catch(() => false);
    await changeShippingMethod(page);
    await Promise.race([successRequested, page.waitForSelector(`${ORDER} [data-section-status][data-kind="quote-gone"]`, { timeout: 30000 }).catch(() => {})]);
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(500);
    const landed = page.url().replace(base, '');
    const notice = onSuccessPage(page.url()) || !landed.startsWith('/checkout') ? null : await statusIn(page, ORDER);
    const number = onSuccessPage(page.url()) ? await orderNumberOnPage(page) : '';
    if (orderStatus === 200) orders.push({ who, scenario: 'other-tab', number: number || '(placed in the second tab)' });
    await shot(page, `${who}-other-tab`);
    const wentToSuccess = onSuccessPage(page.url()) && number !== '';
    const sawNotice = notice?.kind === 'quote-gone' && notice.text === TEXT.quoteGone && notice.action === TEXT.returnToCart && (notice.actionHref ?? '').includes('/checkout/cart');
    check(`${title}: the first tab goes to the success page, or says the cart changed with "${TEXT.returnToCart}"`, wentToSuccess || sawNotice,
        wentToSuccess ? `success page, order ${number}` : `landed on ${landed}; ${JSON.stringify(notice)}; ${trail.join(', ')}`);
    const leaks = await leaksSince(j, leaksFrom);
    check(`${title}: no raw error text was shown`, leaks.length === 0, leaks.join(' | '));
}

// ---------------------------------------------------------------- runs

// One journey: prepared, its scenarios run in order, a script error is a failed check of its own.
async function run(who, names, prepare, scenarios) {
    if (!names.some(wanted)) return;
    const title = `${who} journey (${names.join(', ')})`;
    let j = null;
    try {
        j = await prepare();
        for (const [name, scenario] of scenarios) {
            if (!names.includes(name) || !wanted(name)) continue;
            try {
                await scenario(j);
            } catch (e) {
                await shot(j.page, `${who}-${name}-error`);
                check(`${who} ${name}: the scenario ran to its end`, false, String(e.message ?? e).split('\n')[0]);
            }
        }
    } catch (e) {
        if (j) await shot(j.page, `${who}-prepare-error`);
        check(`${title}: the checkout was ready for the scenarios`, false, String(e.message ?? e).split('\n')[0]);
    }
    if (j) await closeJourney(j, title);
}

async function actor(who) {
    if (onlyWho && onlyWho !== who) return;
    const account = { email: `resilience.customer.${Date.now()}@example.com` };
    if (who === 'customer') {
        const j = await newJourney('customer registration');
        const registered = await register(j.page, account.email).catch(() => false);
        check('customer: an account without a saved address is registered for the run', registered, `${account.email} ${j.page.url().replace(base, '')}`);
        await j.ctx.close();
        if (!registered) return;
    }
    // While the account has no order yet the customer types an address, like a guest.
    await run(who, ['timeout'], () => readyJourney(who, account, { clock: true }), [
        ['timeout', (j) => timeoutScenario(j, who)],
    ]);
    await run(who, [...(who === 'customer' ? ['session'] : []), 'offline', 'unavailable', 'rate-limit', 'unconfirmed', 'one-order'], () => readyJourney(who, account), [
        ['session', (j) => sessionScenario(j, account)],
        ['offline', (j) => offlineScenario(j, who)],
        ['unavailable', (j) => unavailableScenario(j, who)],
        ['rate-limit', (j) => rateLimitScenario(j, who)],
        ['unconfirmed', (j) => unconfirmedScenario(j, who)],
        ['one-order', (j) => oneOrderScenario(j, who)],
    ]);
    // From here on the customer has the address the first order saved.
    await run(who, ['not-placed'], () => readyJourney(who, account), [['not-placed', (j) => notPlacedScenario(j, who)]]);
    await run(who, ['placed'], () => readyJourney(who, account), [['placed', (j) => placedScenario(j, who)]]);
    await run(who, ['other-tab'], () => readyJourney(who, account), [['other-tab', (j) => otherTabScenario(j, who)]]);
}

try {
    await actor('guest');
    await actor('customer');
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, orders, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
process.exit(failed.length ? 1 : 0);

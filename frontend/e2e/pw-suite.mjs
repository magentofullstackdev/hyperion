#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// End-to-end Playwright suite for a Hyperion storefront (any install).
// Usage: node e2e/pw-suite.mjs <baseUrl> [--shots <dir>] [--skip-order]
//   node e2e/pw-suite.mjs https://shop.example --shots /tmp/shots
// Runs the guest and the logged-in customer journeys (the Luma sample data
// customer) and prints one PASS / FAIL line per check plus a JSON
// summary. Exit code 1 when a check fails. Page errors and HTTP >= 500
// responses are collected per journey and count as failures.
import { createRequire } from 'node:module';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
// PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host
// that is not in /etc/hosts yet (Chromium host resolver rules).
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) ?? '').replace(/\/$/, '');
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> [--shots dir] [--skip-order]');
    process.exit(2);
}
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const skipOrder = args.includes('--skip-order');
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail).slice(0, 220) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 220) : ''}`);
};

const browser = await chromium.launch({ headless: true, ...launchOptions() });

async function newJourney(label) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const problems = [];
    // URL fragments of the 5xx answers a check injects on purpose (one entry per answer).
    const injected5xx = [];
    page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => {
        if (r.status() < 500) return;
        const expected = injected5xx.findIndex((fragment) => r.url().includes(fragment));
        if (expected >= 0) { injected5xx.splice(expected, 1); return; }
        problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`);
    });
    return { ctx, page, problems, injected5xx, label };
}

async function shot(page, name) {
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true }).catch(() => {});
}

async function toast(page) {
    await page.waitForFunction(() => {
        const n = document.querySelector('#hyperion-notification');
        return n && !n.hidden && n.innerText.trim().length > 0;
    }, null, { timeout: 25000 }).catch(() => {});
    return page.evaluate(() => {
        const n = document.querySelector('#hyperion-notification');
        return n ? { tone: n.getAttribute('data-tone'), text: n.innerText.trim().replace(/\s+/g, ' ').slice(0, 140) } : null;
    });
}

// Pages whose <head> carries a RequireJS init script (the theme has no RequireJS to run it).
const headInitPages = [];
const headInitCount = (page) => page.evaluate(() => document.head.querySelectorAll('script[type="text/x-magento-init"]').length);

// Accessible names of the tile controls that still show an HTML entity: a name escaped twice.
const doubleEscapedTileLabels = (page) => page.evaluate(() => {
    const labels = [...document.querySelectorAll('[data-hyperion-tiles] [aria-label]')].map((el) => el.getAttribute('aria-label') || '');
    return { total: labels.length, bad: labels.filter((label) => label.includes('&#x') || label.includes('&amp;')) };
});

async function pageBasics(page, path, name) {
    const resp = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
    if (await headInitCount(page) > 0) headInitPages.push(path);
    const info = await page.evaluate(() => ({
        undefinedEls: [...new Set([...document.querySelectorAll('*')].map((e) => e.localName)
            .filter((n) => n.startsWith('hyperion-') && !customElements.get(n)))],
        deadInit: document.querySelectorAll('script[type="text/x-magento-init"]').length,
        h1: document.querySelectorAll('h1').length,
        exception: (document.body.innerText.match(/Exception #0[^\n]{0,160}/) || [''])[0],
    }));
    check(`${name}: HTTP 200`, resp && resp.status() === 200, `${resp?.status()} ${info.exception}`);
    check(`${name}: all <hyperion-*> elements defined`, info.undefinedEls.length === 0, info.undefinedEls.join(','));
    return info;
}

async function addToCartFromPdp(page, path, name, prepare) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    if (prepare) await prepare(page);
    await page.click('#product_addtocart_form button[type="submit"]');
    const t = await toast(page);
    check(`${name}: add to cart`, t?.tone === 'success', JSON.stringify(t));
}

async function selectSwatches(page) {
    // <hyperion-swatches> renders option buttons in its shadow root; pick the first enabled option of every group.
    await page.waitForFunction(() => !!customElements.get('hyperion-swatches'), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(async () => {
        const el = document.querySelector('hyperion-swatches');
        if (!el) return;
        const root = el.shadowRoot || el;
        for (let i = 0; i < 4; i++) {
            const groups = [...root.querySelectorAll('[role="radiogroup"], fieldset, [part="attribute-group"]')];
            const group = groups[i];
            if (!group) break;
            const option = [...group.querySelectorAll('button, [role="radio"]')].find((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
            if (option) option.click();
            await new Promise((r) => setTimeout(r, 250));
        }
    });
}

// ---------------------------------------------------------------- guest
{
    const j = await newJourney('guest');
    const { page } = j;

    await pageBasics(page, '/', 'home');
    await shot(page, 'home');
    const plp = await pageBasics(page, u('/women/tops-women.html'), 'category');
    check('category: product cards rendered', await page.locator('[data-product-id], article').count() > 0);
    await shot(page, 'category');
    const categoryLabels = await doubleEscapedTileLabels(page);
    check('category: no tile control name is escaped twice', categoryLabels.total > 0 && categoryLabels.bad.length === 0, `${categoryLabels.total} names; ${categoryLabels.bad.slice(0, 2).join(' | ')}`);

    // The footer newsletter form posts natively and core redirects back to the
    // category page: its message must show there, inside <hyperion-messages>.
    const subscribed = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/newsletter/subscriber/new'), { timeout: 30000 }).catch(() => null);
    await page.fill('#newsletter-subscribe', `suite.news.${Date.now()}@example.com`);
    await page.click('#newsletter-validate-detail button[type="submit"]');
    await subscribed;
    await page.waitForFunction(() => !!document.querySelector('hyperion-messages [role="alert"]'), null, { timeout: 20000 }).catch(() => {});
    const newsletter = await page.evaluate(() => ({
        path: location.pathname,
        alerts: [...document.querySelectorAll('hyperion-messages [role="alert"]')].map((a) => ({ tone: a.getAttribute('data-tone'), text: a.innerText.trim().replace(/\s+/g, ' ').slice(0, 100) })),
    }));
    check('category: the newsletter success message shows in <hyperion-messages> on the category page',
        newsletter.path.includes('tops-women') && newsletter.alerts.some((a) => a.tone === 'success'), JSON.stringify(newsletter));

    await pageBasics(page, '/catalogsearch/result/?q=jacket', 'search');
    const searchLabels = await doubleEscapedTileLabels(page);
    check('search: no tile control name is escaped twice', searchLabels.total > 0 && searchLabels.bad.length === 0, `${searchLabels.total} names; ${searchLabels.bad.slice(0, 2).join(' | ')}`);
    await pageBasics(page, '/catalogsearch/advanced/result/?name=bag', 'advanced search result');
    await pageBasics(page, u('/juno-jacket.html'), 'configurable PDP');
    await shot(page, 'pdp-configurable');
    await pageBasics(page, '/customer/account/login/', 'login page');
    await pageBasics(page, '/customer/account/create/', 'register page');
    await pageBasics(page, '/contact/', 'contact page');
    await pageBasics(page, '/sales/guest/form/', 'guest order form');
    void plp;

    await addToCartFromPdp(page, u('/fusion-backpack.html'), 'simple product');
    await addToCartFromPdp(page, u('/juno-jacket.html'), 'configurable product', selectSwatches);
    await addToCartFromPdp(page, u('/set-of-sprite-yoga-straps.html'), 'grouped product', async (p) => {
        const inputs = await p.$$('input[name^="super_group"]');
        if (inputs[0]) await inputs[0].fill('1');
    });
    await addToCartFromPdp(page, u('/hyperion-travel-kit.html'), 'bundle product');
    await addToCartFromPdp(page, u('/hyperion-engraved-bottle.html'), 'custom options product', async (p) => {
        await p.fill('input[name^="options["][type="text"]', 'SUITE');
        const sel = await p.$('select[name^="options["]');
        if (sel) await sel.selectOption({ index: 1 });
    });

    // compare + wishlist toggles (guest wishlist redirects to login: only compare is asserted)
    await page.goto(base + u('/fusion-backpack.html'), { waitUntil: 'networkidle' });
    await page.click('hyperion-list-toggle[kind="compare"] button[type="submit"]');
    const cmp = await toast(page);
    check('compare: add from PDP', cmp?.tone === 'success', JSON.stringify(cmp));

    // cart page
    await pageBasics(page, '/checkout/cart/', 'cart page');
    const cart = await page.evaluate(() => ({
        lines: document.querySelectorAll('[data-cart-item], [data-hyperion-cart-item], #hyperion-cart-items article, #hyperion-cart-items li').length,
        totals: [...document.querySelectorAll('[data-hyperion-cart-totals] [data-total]')].map((r) => r.getAttribute('data-total')),
        text: document.body.innerText,
    }));
    check('cart: totals rows rendered', cart.totals.includes('grand_total'), cart.totals.join(','));
    check('cart: custom option shown', /SUITE/.test(cart.text));
    await shot(page, 'cart');

    // mini-cart
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const count = await page.evaluate(() => (document.querySelector('#hyperion-mini-cart-count') || {}).innerText || '');
    check('mini-cart: counter shows items', Number(count) > 0, `count=${count}`);

    // guest checkout
    if (!skipOrder) {
        await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
        await page.waitForSelector('checkout-app, hyperion-checkout', { timeout: 30000 }).catch(() => {});
        const checkoutHead = { init: await headInitCount(page), sri: await page.evaluate(() => typeof window.sriHashes) };
        check('guest checkout: no RequireJS init script in the head, window.sriHashes undefined', checkoutHead.init === 0 && checkoutHead.sri === 'undefined', JSON.stringify(checkoutHead));
        const fill = async (sel, value) => { const el = page.locator(sel).first(); if (await el.count()) await el.fill(value); };
        const guestEmail = `suite.${Date.now()}@example.com`;
        await fill('input[type="email"][name="email"], checkout-email input[type="email"]', guestEmail);
        await fill('input[name="firstname"]', 'Suite');
        await fill('input[name="lastname"]', 'Tester');
        await fill('input[name="street_0"]', '1 Test Street');
        await fill('input[name="city"]', 'Calder');
        const country = page.locator('select[name="country_id"]').first();
        if (await country.count()) await country.selectOption('US');
        await page.waitForTimeout(600);
        const region = page.locator('select[name="region_id"]').first();
        if (await region.count()) await region.selectOption({ label: 'Michigan' }).catch(() => {});
        await fill('input[name="postcode"]', '49628');
        await fill('input[name="telephone"]', '5552293326');
        await page.locator('input[name="telephone"]').first().blur().catch(() => {});
        await page.waitForSelector('shipping-method-row', { timeout: 40000 }).catch(() => {});
        check('guest checkout: shipping methods loaded', await page.locator('shipping-method-row').count() > 0);
        await page.waitForSelector('payment-method-row', { timeout: 40000 }).catch(() => {});
        check('guest checkout: payment methods loaded', await page.locator('payment-method-row').count() > 0);
        await shot(page, 'checkout-guest');

        // A proxy or the origin answers the next shipping save with an HTML 503:
        // the shopper reads a translated sentence, never the body, and the next
        // address change saves again.
        const shippingSave = (r) => r.request().method() === 'POST' && r.url().includes('/shipping-information');
        const unavailable = 'The store is temporarily unavailable. Please try again in a moment.';
        j.injected5xx.push('/shipping-information');
        await page.route('**/shipping-information*', (route) => route.fulfill({
            status: 503,
            contentType: 'text/html',
            body: '<html><body><h1>503 Service Unavailable</h1><p>Backend fetch failed</p></body></html>',
        }), { times: 1 });
        const refused = page.waitForResponse((r) => shippingSave(r) && r.status() === 503, { timeout: 30000 }).catch(() => null);
        await fill('input[name="city"]', 'Calder City');
        await page.locator('input[name="city"]').first().blur().catch(() => {});
        await refused;
        await page.locator('error-banner').filter({ hasText: unavailable }).first().waitFor({ timeout: 15000 }).catch(() => {});
        const unavailableBanner = await page.evaluate(() => (document.querySelector('error-banner') || {}).innerText || '');
        check('guest checkout: an HTML 503 on the shipping save shows the translated unavailable message',
            unavailableBanner.includes(unavailable) && !/Backend fetch failed|<h1>/.test(unavailableBanner), unavailableBanner.replace(/\s+/g, ' '));
        const saved = page.waitForResponse((r) => shippingSave(r) && r.status() === 200, { timeout: 30000 }).catch(() => null);
        await fill('input[name="city"]', 'Calder');
        await page.locator('input[name="city"]').first().blur().catch(() => {});
        check('guest checkout: the next address change saves the shipping information again', !!(await saved));

        const pay = page.locator('#hc-pay-checkmo');
        if (await pay.count()) await pay.click();
        await page.waitForTimeout(1500);
        // The street changes and Place Order is pressed before the debounced
        // estimate starts: the order must carry the street on the screen.
        const editedStreet = `${String(Date.now()).slice(-4)} Edited Lane`;
        await fill('input[name="street_0"]', editedStreet);
        const editedAt = Date.now();
        await page.locator('place-order-button button').click().catch(() => {});
        const pressedAfter = Date.now() - editedAt;
        await page.waitForURL((u) => u.toString().includes('success'), { timeout: 45000 }).catch(() => {});
        const banner = await page.evaluate(() => (document.querySelector('error-banner') || {}).innerText || '');
        check('guest checkout: order placed', page.url().includes('success'), banner || page.url());
        await shot(page, 'checkout-success');
        const guestOrderNumber = await page.evaluate(() => (document.body.innerText.match(/#\s*(\d{6,})/) || [])[1] || '');

        // Guest "Create an Account" offer: core's checkout.registration block with Hyperion's template. The link
        // is core's checkout/account/delegateCreate, which seeds the registration form from the order.
        const offer = await page.evaluate(() => {
            const card = document.querySelector('[data-hyperion-guest-registration]');
            const link = card?.querySelector('a[data-hyperion-guest-register]');
            return card ? { text: card.innerText.replace(/\s+/g, ' ').trim(), href: link?.getAttribute('href') || '' } : null;
        });
        check('guest success: Create an Account offer shows the guest email', !!offer && offer.text.includes(guestEmail), offer ? offer.text : 'no offer card');
        check('guest success: offer links to checkout/account/delegateCreate', !!offer && /\/checkout\/account\/delegateCreate\/?(\?|$)/.test(offer.href), offer?.href || '');
        if (offer) {
            await page.click('a[data-hyperion-guest-register]');
            await page.waitForURL((u) => u.toString().includes('customer/account/create'), { timeout: 30000 }).catch(() => {});
            const form = await page.evaluate(() => ({
                firstname: document.querySelector('#firstname')?.value || '',
                lastname: document.querySelector('#lastname')?.value || '',
                email: document.querySelector('#email_address')?.value || '',
            }));
            const prefilled = page.url().includes('customer/account/create') && form.firstname === 'Suite' && form.lastname === 'Tester' && form.email === guestEmail;
            check('guest success: delegated registration form pre-filled', prefilled, `${page.url().replace(base, '')} ${JSON.stringify(form)}`);
        } else {
            check('guest success: delegated registration form pre-filled', false, 'no offer card');
        }

        // The order as the store holds it, through Orders and Returns.
        // Its shipping address block (the whole page when the block is not found).
        let guestOrderText = '';
        if (guestOrderNumber) {
            await page.goto(base + '/sales/guest/form/', { waitUntil: 'networkidle' });
            await page.fill('form[name="guest_post"] [name="oar_order_id"]', guestOrderNumber);
            await page.fill('form[name="guest_post"] [name="oar_billing_lastname"]', 'Tester');
            await page.selectOption('form[name="guest_post"] [name="oar_type"]', 'email').catch(() => {});
            await page.fill('form[name="guest_post"] [name="oar_email"]', guestEmail);
            await page.click('form[name="guest_post"] button[type="submit"]');
            await page.waitForURL((u) => u.toString().includes('/sales/guest/view'), { timeout: 30000 }).catch(() => {});
            guestOrderText = page.url().includes('/sales/guest/view')
                ? await page.evaluate(() => {
                    const shipping = [...document.querySelectorAll('address')].find((a) => /shipping address/i.test(a.previousElementSibling?.textContent || ''));
                    return (shipping || document.body).innerText;
                })
                : '';
        }
        check('guest checkout: a street edited right before Place Order is the shipping street of the order',
            guestOrderText.includes(editedStreet) && !guestOrderText.includes('1 Test Street'),
            `order ${guestOrderNumber || 'not found'}, pressed ${pressedAfter} ms after the edit, ${page.url().replace(base, '')}`);
    }

    check('guest journey: no RequireJS init script in the head of any visited page', headInitPages.length === 0, headInitPages.join(' '));
    headInitPages.length = 0;
    check('guest journey: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
    await j.ctx.close();
}

// ---------------------------------------------------------------- customer
{
    const j = await newJourney('customer');
    const { page } = j;
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', CUSTOMER.email);
    await page.fill('#pass', CUSTOMER.password);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
    const loggedIn = !page.url().includes('/login');
    check('customer: login', loggedIn, page.url().replace(base, ''));

    if (loggedIn) {
        for (const [path, name] of [
            ['/customer/account/', 'dashboard'], ['/customer/account/edit/', 'account edit'], ['/customer/address/', 'address book'],
            ['/sales/order/history/', 'order history'], ['/wishlist/', 'wishlist'], ['/review/customer/', 'my reviews'],
            ['/downloadable/customer/products/', 'my downloads'], ['/newsletter/manage/', 'newsletter'], ['/vault/cards/listaction/', 'stored payment methods'],
        ]) {
            await pageBasics(page, path, `account ${name}`);
        }
        await shot(page, 'account-last');

        await page.goto(base + '/sales/order/history/', { waitUntil: 'networkidle' });
        const orderId = await page.evaluate(() => (document.querySelector('a[href*="/sales/order/view/order_id/"]')?.href.match(/order_id\/(\d+)/) || [])[1]);
        if (orderId) {
            for (const t of ['view', 'invoice', 'shipment', 'creditmemo', 'print']) {
                await pageBasics(page, `/sales/order/${t}/order_id/${orderId}/`, `order ${t}`);
            }
        } else {
            check('customer: has an order to open', false, 'no order link on the history page');
        }

        // wishlist toggle from the PDP, header counter follows
        await page.goto(base + u('/fusion-backpack.html'), { waitUntil: 'networkidle' });
        await page.click('hyperion-list-toggle[kind="wishlist"] button[type="submit"]');
        const w = await toast(page);
        check('customer: wishlist toggle', !!w && w.tone !== 'error', JSON.stringify(w));

        await addToCartFromPdp(page, u('/fusion-backpack.html'), 'customer: simple product');
        await pageBasics(page, '/checkout/cart/', 'customer cart');
        check('customer cart: not empty (depersonalization guard)', !/no items in your shopping cart/i.test(await page.evaluate(() => document.body.innerText)));

        if (!skipOrder) {
            await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
            await page.waitForSelector('shipping-method-row', { timeout: 40000 }).catch(() => {});
            check('customer checkout: rates for the default address', await page.locator('shipping-method-row').count() > 0);
            await page.waitForSelector('payment-method-row', { timeout: 40000 }).catch(() => {});
            const pay = page.locator('#hc-pay-checkmo');
            if (await pay.count()) await pay.click();
            await page.waitForTimeout(1500);
            // A double click: the second press must neither send a second order
            // nor surface an error while the first one is on its way.
            let orderPosts = 0;
            page.on('request', (r) => { if (r.method() === 'POST' && /\/payment-information(\?|$)/.test(r.url())) orderPosts++; });
            await page.locator('place-order-button button').dblclick().catch(() => {});
            await page.waitForURL((u) => u.toString().includes('success'), { timeout: 45000 }).catch(() => {});
            const banner = await page.evaluate(() => (document.querySelector('error-banner') || {}).innerText || '');
            check('customer checkout: order placed', page.url().includes('success'), banner || page.url());
            check('customer checkout: a double click on Place Order sends one order and shows no error', page.url().includes('success') && orderPosts === 1 && banner.trim() === '', `${orderPosts} order requests; ${banner.replace(/\s+/g, ' ')}`);
        }
    }
    check('customer journey: no RequireJS init script in the head of any visited page', headInitPages.length === 0, headInitPages.join(' '));
    check('customer journey: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
    await j.ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
process.exit(failed.length ? 1 : 0);

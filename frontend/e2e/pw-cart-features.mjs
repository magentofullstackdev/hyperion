#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live checks of the cart features: cart shipping estimator, move to wishlist, VAT field on the
// address form, gift message and shipping policy inside the Lit checkout, FPT display.
// Also the coupon form: translated labels, the coupon_code reCAPTCHA
// rendered inside the form (config switched on for the run), the token in the HTMX body.
// Cart money: estimator rates in a non-base display currency equal the Shipping totals row, a
// carrier error rate is text and cannot be posted, unit price and row total follow the cart tax
// display (e2e/fixtures/tax-display-fixture.php), a decimal quantity survives an update of another
// line (e2e/fixtures/decimal-qty-fixture.php). Every setting and fixture is put back at the end.
// Quantities: a change posts the cart by itself (no "Update Cart" click, one request for a burst of
// changes, a newer change replaces the request in flight, the focus stays on the edited line).
// Minimum order amount (switched on at 50 for the shortest possible window): the checkout link of
// the cart and of the mini-cart is disabled with the reason, a quantity change that crosses the
// amount enables it without a reload, a direct visit to the checkout comes back with a notice.
// A refused coupon keeps the form open with the code and the message. A virtual cart has no
// estimator; a grouped child line links to its parent; item options print as label / value pairs.
// A customer with a default address gets its rates when the estimate panel opens, not before.
// The estimator answers 429 with Retry-After above its request budget (last check of the run: the
// budget of this client stays spent for the window).
// Usage: node e2e/pw-cart-features.mjs <baseUrl> <slotDir> [--with-fpt] [--with-custom-total] [--keep-recaptcha] [--only=<part,...>]
//   node e2e/pw-cart-features.mjs https://shop.example <slotDir> --with-fpt
// Toggles the needed store settings for the run (VAT visibility, shipping policy, coupon
// reCAPTCHA v3, carrier and tax display settings, the minimum order amount) and restores them
// through e2e/lib/config-snapshot.mjs. The customer journeys use a customer created for the run
// (e2e/fixtures/customer-fixture.php) and deleted at the end.
//   --with-fpt           expects the FPT demo attribute to be in place (e2e/fixtures/weee-demo.php, then a price
//                        reindex); turns `tax/weee/*` on for the run, checks the FPT lines of the cart, the mini-cart
//                        and the checkout and the price box of the product page and of the listing in each of the
//                        four FPT display modes, and puts the settings back.
//   --with-custom-total  installs a quote total the theme does not know (e2e/fixtures/custom-total-fixture.php: a
//                        module written into the install, enabled and COMPILED, removed and compiled again at the
//                        end; the storefront is down while it compiles) and checks that the cart and the checkout
//                        summary list the same row with the same amount at the same place.
//   --keep-recaptcha     leaves `recaptcha_frontend/type_for/coupon_code` as it is (the coupon reCAPTCHA checks then
//                        follow the setting found).
//   --only=<part,...>    runs only the named parts (guest, quantity, minimum order, lines, multi-currency, error rate,
//                        tax display, decimal quantity, customer, custom total, fpt display, rate limit).
// Clear the customer_login reCAPTCHA type for the run beforehand (see docs/development.md),
// as for pw-suite.mjs. Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeConfigSnapshot } from './lib/config-snapshot.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) ?? '').replace(/\/$/, '');
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <slotDir> ...');
    process.exit(2);
}
const slot = args.find((a) => !a.startsWith('http') && !a.startsWith('--')) ?? '.';
const withFpt = args.includes('--with-fpt');
const withCustomTotal = args.includes('--with-custom-total');
const keepRecaptcha = args.includes('--keep-recaptcha');
const only = (args.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length).split(',').map((part) => part.trim()).filter(Boolean);
const slotDir = path.resolve(slot);
// The customer of the run: created by the fixture, deleted at the end.
const CUSTOMER = { email: `hyperion.e2e.cart.${Date.now()}@example.com`, password: `Hyp-${Date.now().toString(36)}-Cart9!` };
const POLICY = 'Orders placed before noon ship the <b>same day</b>.';
const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
// The simple product whose quantity becomes decimal for the run, and the destination of the estimates.
const DECIMAL = { sku: '24-UG06', path: '/affirm-water-bottle.html', name: 'Affirm Water Bottle' };
const DESTINATION = { country: 'US', region: 'Michigan', postcode: '49628' };
// The minimum order amount of the run and the product whose line starts below it and crosses it at quantity 2.
const MINIMUM = { amount: 50, path: '/joust-duffle-bag.html' };
const GROUPED = { path: '/set-of-sprite-yoga-straps.html' };
const CONFIGURABLE_SKU = 'MH01';
// A configurable sample product whose variants carry their own image (Juno Jacket: parent purple, XS / Blue child blue).
const VARIANT_IMAGE = { parent: 'WJ06', child: 'WJ06-XS-Blue', options: ['XS', 'Blue'] };
const VIRTUAL_SKU = 'HYP-VIRTUAL-GIFT-WRAP';
const CUSTOM_TOTAL = { code: 'hyperion_test_fee', title: 'Test fee', amount: 2.5 };
const FPT_SETTINGS = ['tax/weee/enable', 'tax/weee/include_in_subtotal', 'tax/weee/display', 'tax/weee/display_list', 'tax/weee/display_sales'];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail).slice(0, 220) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 220) : ''}`);
};

function compose(service, cmd, user) {
    const userArgs = user ? ['-u', user] : [];
    return execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...userArgs, service, 'bash', '-c', cmd], { encoding: 'utf8' });
}
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const sql = (query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`).trim();
const { configSnapshot, configValue, restoreConfig } = makeConfigSnapshot(sql);
// Writes a value for the run through the same statement the restore uses (no bin/magento start per setting).
const setConfig = (configPath, value) => restoreConfig(configPath, { state: 'value', value: String(value) });
const sameSnapshot = (a, b) => a.state === b.state && a.value === b.value;
const lastJsonLine = (output) => JSON.parse(output.trim().split('\n').pop());
const copyFixture = (name) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', path.join(FIXTURE_DIR, name), `php-fpm:/tmp/${name}`]);
const runFixture = (name, fixtureArgs = '') => lastJsonLine(compose('php-fpm', `cd /var/www/html && php /tmp/${name} /var/www/html ${fixtureArgs}`, 'www-data'));
const previous = Object.fromEntries([
    'customer/create_account/vat_frontend_visibility',
    'shipping/shipping_policy/enable_shipping_policy',
    'shipping/shipping_policy/shipping_policy_content',
    ...(keepRecaptcha ? [] : ['recaptcha_frontend/type_for/coupon_code']),
    ...(withFpt ? FPT_SETTINGS : []),
].map((configPath) => [configPath, configSnapshot(configPath)]));
const firstLine = (e) => String(e?.message ?? e).split('\n')[0];
// Runs one part of the script: an error thrown inside is a failed check of that part, the parts after it still run.
async function block(label, run) {
    if (only.length && !only.includes(label)) return;
    try {
        await run();
    } catch (e) {
        check(`${label}: the block ran to its end`, false, firstLine(e));
    }
}
// Runs every restore step even when one throws; a step that fails is a failed check.
async function restoreAll(steps) {
    for (const [label, step] of steps) {
        try {
            await step();
        } catch (e) {
            check(`restore: ${label}`, false, firstLine(e));
        }
    }
}
// An install without reCAPTCHA keys: the form must still render, the token checks are skipped.
// With --keep-recaptcha the coupon form is protected only when the store already protects it.
const hasV3Key = configValue('recaptcha_frontend/type_recaptcha_v3/public_key') !== null
    && (!keepRecaptcha || configValue('recaptcha_frontend/type_for/coupon_code') === 'recaptcha_v3');
// The public path of a product, from its URL rewrite on the default store view.
const productPath = (sku) => {
    const requestPath = sql(`select u.request_path from url_rewrite u join catalog_product_entity e on e.entity_id = u.entity_id where u.entity_type = 'product' and e.sku = '${sku}' and u.redirect_type = 0 and u.metadata is null order by u.store_id limit 1`);
    return requestPath ? '/' + requestPath : '';
};

let browser = null;

async function newJourney() {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
    return { ctx, page, problems };
}
async function toast(page) {
    await page.waitForFunction(() => { const n = document.querySelector('#hyperion-notification'); return n && !n.hidden && n.innerText.trim().length > 0; }, null, { timeout: 25000 }).catch(() => {});
    return page.evaluate(() => { const n = document.querySelector('#hyperion-notification'); return n ? { tone: n.getAttribute('data-tone'), text: n.innerText.trim().replace(/\s+/g, ' ').slice(0, 140) } : null; });
}
async function addToCart(page, urlPath) {
    await page.goto(base + urlPath, { waitUntil: 'networkidle' });
    await page.click('#product_addtocart_form button[type="submit"]');
    await toast(page);
}
async function login(page) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', CUSTOMER.email);
    await page.fill('#pass', CUSTOMER.password);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
    return !page.url().includes('/login');
}
const grandTotal = (page) => page.evaluate(() => document.querySelector('[data-hyperion-cart-totals] [data-total="grand_total"] dd')?.textContent?.trim() ?? '');
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
// The text of a totals row; the first of the given codes that is rendered.
const totalsRow = (page, ...codes) => page.evaluate((list) => {
    for (const code of list) {
        const dd = document.querySelector(`[data-hyperion-cart-totals] [data-total="${code}"] dd`);
        if (dd) return dd.textContent.replace(/\s+/g, ' ').trim();
    }
    return '';
}, codes);
const waitEstimate = (page) => page.waitForResponse((r) => r.url().includes('/hyperion/cart/estimate'), { timeout: 30000 });
async function estimate(page, destination = DESTINATION) {
    await page.evaluate(() => { const d = document.querySelector('[data-hyperion-cart-estimate]'); if (d) d.open = true; });
    await page.selectOption('[data-hyperion-cart-estimate-form] select[name="country_id"]', destination.country);
    await page.waitForTimeout(500);
    await page.selectOption('[data-hyperion-cart-estimate-form] select[name="region_id"]', { label: destination.region }).catch(() => {});
    await page.fill('[data-hyperion-cart-estimate-form] input[name="postcode"]', destination.postcode);
    await Promise.all([waitEstimate(page), page.click('[data-hyperion-cart-estimate-form] button[type="submit"]')]);
    await page.waitForTimeout(800);
}
// The selectable rates of the estimator: code, the amount printed beside the radio, checked.
const readRates = (page) => page.locator('[data-hyperion-cart-estimate-rates] label').evaluateAll((labels) => labels.map((label) => ({
    code: label.querySelector('input[name="estimate_method"]')?.value ?? '',
    amount: (label.querySelector('[data-hyperion-cart-estimate-amount]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    checked: !!label.querySelector('input[name="estimate_method"]')?.checked,
})));
async function pickRate(page, code) {
    const radio = page.locator(`[data-hyperion-cart-estimate-rates] input[value="${code}"]`);
    if (await radio.isChecked()) return;
    await Promise.all([waitEstimate(page), radio.check()]);
    await page.waitForTimeout(800);
}
// The amount of a formatted price as a number, whatever the symbols of the store view.
const amountOf = (text) => {
    const digits = String(text).replace(/[^\d.,]/g, '');
    const decimal = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
    return decimal === -1 ? Number(digits) : Number(digits.slice(0, decimal).replace(/[.,]/g, '') + '.' + digits.slice(decimal + 1));
};
const cartLine = (page, name) => page.evaluate((needle) => {
    const li = [...document.querySelectorAll('[data-hyperion-cart-item]')].find((el) => el.textContent.includes(needle));
    if (!li) return null;
    const text = (selector) => (li.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const input = li.querySelector('input[name$="[qty]"]');
    return {
        price: text('[data-hyperion-cart-item-price]'),
        rowTotal: text('[data-hyperion-cart-item-row-total]'),
        qty: input?.value ?? '',
        qtyName: input?.getAttribute('name') ?? '',
        step: input?.getAttribute('step') ?? '',
        min: input?.getAttribute('min') ?? '',
        inputmode: input?.getAttribute('inputmode') ?? '',
    };
}, name);
const isUpdatePost = (r) => r.url().includes('/checkout/cart/updatePost');
// Types a quantity and leaves the field: the cart posts itself after its short pause, the answer replaces the cart.
async function setQty(page, qtyName, value) {
    const field = page.locator(`input[name="${qtyName}"]`);
    await field.fill(String(value));
    await Promise.all([
        page.waitForResponse(isUpdatePost, { timeout: 30000 }),
        field.blur(),
    ]);
    await page.waitForTimeout(800);
}
// Where the keyboard focus is: the item id of the cart line that holds it and the stepper control, if any.
const focusFacts = (page) => page.evaluate(() => {
    const active = document.activeElement;
    return {
        itemId: active?.closest?.('[data-hyperion-cart-item]')?.getAttribute('data-item-id') ?? '',
        control: active?.matches?.('[data-hyperion-qty]') ? 'input' : active?.getAttribute?.('data-hyperion-qty-step') ?? '',
        inStepper: !!active?.closest?.('[data-hyperion-qty-control]'),
    };
});
// The lines of the cart: item id, name, quantity field, amounts.
const cartLines = (page) => page.evaluate(() => [...document.querySelectorAll('[data-hyperion-cart-item]')].map((li) => {
    const input = li.querySelector('[data-hyperion-qty]');
    const text = (selector) => (li.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { id: li.getAttribute('data-item-id') ?? '', qtyName: input?.getAttribute('name') ?? '', qty: input?.value ?? '', price: text('[data-hyperion-cart-item-price]'), rowTotal: text('[data-hyperion-cart-item-row-total]') };
}));
// The checkout affordances of the cart page: the status box, the link of the summary card and the link of the phone bar.
const checkoutState = (page) => page.evaluate(() => {
    const link = (selector) => {
        const a = document.querySelector(selector);
        return a ? { href: a.getAttribute('href') ?? '', disabled: a.getAttribute('aria-disabled') ?? '', describedBy: a.getAttribute('aria-describedby') ?? '', tabindex: a.getAttribute('tabindex') ?? '' } : null;
    };
    const box = document.querySelector('[data-hyperion-cart-totals] [data-hyperion-checkout-blocker]');
    return {
        reason: box?.getAttribute('data-hyperion-checkout-blocker') ?? '',
        boxId: box?.id ?? '',
        boxRole: box?.getAttribute('role') ?? '',
        boxText: (box?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        boxVisible: !!box && box.getBoundingClientRect().height > 0,
        card: link('[data-hyperion-cart-totals] [data-hyperion-checkout-link]'),
        bar: link('[data-hyperion-checkout-bar] [data-hyperion-checkout-bar-link]'),
        // Any other live link to the checkout inside the cart (the configure links of the lines are cart URLs).
        liveLinks: [...document.querySelectorAll('#hyperion-cart-items a[href]')].filter((a) => /^\/checkout(\/index(\/index)?)?\/?$/.test(new URL(a.href).pathname)).length,
        expressButtons: document.querySelectorAll('[data-hyperion-cart-totals] hyperion-paypal-buttons').length,
    };
});
// The checkout affordances of the opened mini-cart drawer.
async function miniCartState(page) {
    await page.evaluate(() => document.querySelector('hyperion-mini-cart')?.openPanel?.());
    await page.waitForFunction(() => {
        const host = document.querySelector('hyperion-mini-cart');
        return !!(host?.shadowRoot ?? host)?.querySelector('[data-hyperion-checkout-link]');
    }, null, { timeout: 20000 }).catch(() => {});
    const state = await page.evaluate(() => {
        const host = document.querySelector('hyperion-mini-cart');
        const root = host?.shadowRoot ?? host;
        const a = root?.querySelector('[data-hyperion-checkout-link]');
        const box = root?.querySelector('[data-hyperion-checkout-blocker]');
        return {
            reason: box?.getAttribute('data-hyperion-checkout-blocker') ?? '',
            boxText: (box?.textContent ?? '').replace(/\s+/g, ' ').trim(),
            boxVisible: !!box && box.getBoundingClientRect().height > 0,
            link: a ? { href: a.getAttribute('href') ?? '', disabled: a.getAttribute('aria-disabled') ?? '', describedBy: a.getAttribute('aria-describedby') ?? '', visible: a.getBoundingClientRect().height > 0 } : null,
            boxId: box?.id ?? '',
        };
    });
    await page.evaluate(() => document.querySelector('hyperion-mini-cart')?.close?.());
    await page.waitForTimeout(300);
    return state;
}
// The rows of the cart totals in their order: code, label, amount text.
const cartTotalRows = (page) => page.evaluate(() => [...document.querySelectorAll('[data-hyperion-cart-totals] [data-total]')].map((row) => ({
    code: row.getAttribute('data-total') ?? '',
    label: (row.querySelector('dt')?.firstChild?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    value: (row.querySelector('dd')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
})));

try {
    magento('config:set customer/create_account/vat_frontend_visibility 1');
    magento('config:set shipping/shipping_policy/enable_shipping_policy 1');
    magento(`config:set shipping/shipping_policy/shipping_policy_content ${JSON.stringify(POLICY)}`);
    if (!keepRecaptcha) magento('config:set recaptcha_frontend/type_for/coupon_code recaptcha_v3');
    if (withFpt) {
        // The FPT demo attribute carries no configuration: FPT on, kept out of the subtotal, shown with its description and the final price.
        for (const [configPath, value] of [['tax/weee/enable', 1], ['tax/weee/include_in_subtotal', 0], ['tax/weee/display', 2], ['tax/weee/display_list', 2], ['tax/weee/display_sales', 2]]) setConfig(configPath, value);
    }
    magento('cache:flush');
    console.log(`config set: VAT visible, shipping policy on, coupon reCAPTCHA ${keepRecaptcha ? 'left as found' : 'v3'} (${hasV3Key ? 'keys present' : 'token checks skipped'})`);
    copyFixture('customer-fixture.php');
    console.log('customer fixture:', JSON.stringify(runFixture('customer-fixture.php', `${CUSTOMER.email} '${CUSTOMER.password}' --apply`)));

    browser = await chromium.launch({ headless: true, ...launchOptions() });
    // ------------------------------------------------------------ guest: the FPT lines of the price box in each display mode
    if (withFpt) {
        await block('fpt display', async () => {
            // Core's four values of `tax/weee/display` (product page) and `tax/weee/display_list` (listings).
            const MODES = [
                { value: 0, name: 'including FPT only', weee: false, final: false },
                { value: 1, name: 'including FPT and FPT description', weee: true, final: false },
                { value: 2, name: 'excluding FPT, FPT description and final price', weee: true, final: true },
                { value: 3, name: 'excluding FPT', weee: false, final: false },
            ];
            const j = await newJourney();
            const { page } = j;
            // The price box of the FPT demo product: on its page, or in its tile of the listing.
            const priceFacts = (where) => page.evaluate((place) => {
                const box = place === 'product'
                    ? document.querySelector('[data-hyperion-pdp-price] .price-box')
                    : [...document.querySelectorAll('[data-hyperion-tile]')].find((tile) => tile.textContent.includes('Joust Duffle Bag'))?.querySelector('.price-box');
                const container = box?.querySelector('.price-container');
                if (!container) return null;
                // The container itself carries a `weee` class: the FPT lines are the ones inside it.
                const lines = (name) => [...container.querySelectorAll(`.${name}`)];
                const amount = [...container.querySelectorAll('.price')].find((price) => !lines('weee').some((l) => l.contains(price)) && !lines('price-final').some((l) => l.contains(price)));
                const amountRect = amount?.getBoundingClientRect();
                const facts = (line) => {
                    const style = getComputedStyle(line);
                    return {
                        label: line.getAttribute('data-label') ?? '',
                        before: getComputedStyle(line, '::before').content,
                        ownLine: !!amountRect && line.getBoundingClientRect().height > 0 && line.getBoundingClientRect().top >= amountRect.bottom - 1,
                        smaller: !!amount && parseFloat(style.fontSize) < parseFloat(getComputedStyle(amount).fontSize),
                        priceWeight: getComputedStyle(line.querySelector('.price') ?? line).fontWeight,
                    };
                };
                return { amount: (amount?.textContent ?? '').trim(), weee: lines('weee').map(facts), final: lines('price-final').map(facts) };
            }, where);
            const labeled = (line) => line.label !== '' && line.before.includes(line.label) && line.ownLine && line.smaller;
            try {
                for (const mode of MODES) {
                    setConfig('tax/weee/display', mode.value);
                    setConfig('tax/weee/display_list', mode.value);
                    magento('cache:flush');
                    for (const [where, target] of [['product', u('/joust-duffle-bag.html')], ['listing', u('/gear/bags.html')]]) {
                        await page.goto(base + target, { waitUntil: 'networkidle' });
                        const facts = await priceFacts(where);
                        const ok = !!facts && facts.amount !== ''
                            && (mode.weee ? facts.weee.length > 0 && facts.weee.every((line) => labeled(line) && line.priceWeight === '400') : facts.weee.length === 0)
                            && (mode.final ? facts.final.length === 1 && labeled(facts.final[0]) : facts.final.length === 0);
                        check(
                            `fpt display (${where}, ${mode.name}): ${mode.weee ? `the FPT line${mode.final ? ' and the final price' : ''} under the amount, small, with the label from data-label` : 'the amount alone, no FPT line'}`,
                            ok,
                            JSON.stringify(facts)
                        );
                    }
                }
            } finally {
                // The cart, mini-cart and checkout checks of the run read the mode with the description and the final price.
                await restoreAll([
                    ['FPT display mode of the run set again', () => { setConfig('tax/weee/display', 2); setConfig('tax/weee/display_list', 2); }],
                    ['cache flushed after the FPT display modes', () => magento('cache:flush')],
                ]);
            }
            check('fpt display: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
            await j.ctx.close();
        });
    }

    // ------------------------------------------------------------ guest: estimator + FPT
    await block('guest', async () => {
        const j = await newJourney();
        const { page } = j;
        await addToCart(page, u('/joust-duffle-bag.html'));
        await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        const estimator = page.locator('[data-hyperion-cart-estimate]');
        check('estimator: panel rendered in the summary card', await estimator.count() === 1);
        const before = await grandTotal(page);
        await estimator.locator('summary').click().catch(() => {});
        await page.selectOption('[data-hyperion-cart-estimate-form] select[name="country_id"]', 'US');
        await page.waitForTimeout(500);
        await page.selectOption('[data-hyperion-cart-estimate-form] select[name="region_id"]', { label: 'Michigan' }).catch(() => {});
        await page.fill('[data-hyperion-cart-estimate-form] input[name="postcode"]', '49628');
        await Promise.all([
            page.waitForResponse((r) => r.url().includes('/hyperion/cart/estimate'), { timeout: 30000 }),
            page.click('[data-hyperion-cart-estimate-form] button[type="submit"]'),
        ]);
        await page.waitForTimeout(800);
        const rates = page.locator('[data-hyperion-cart-estimate-rates] input[name="estimate_method"]');
        const rateCount = await rates.count();
        check('estimator: rates listed after the estimate', rateCount > 0, `rates ${rateCount}`);
        const codes = await rates.evaluateAll((els) => els.map((e) => [e.value, e.checked]));
        const pick = codes.find(([, c]) => !c)?.[0] ?? codes[0]?.[0];
        if (pick) {
            const totalBefore = await grandTotal(page);
            await Promise.all([
                page.waitForResponse((r) => r.url().includes('/hyperion/cart/estimate'), { timeout: 30000 }),
                page.check(`[data-hyperion-cart-estimate-rates] input[value="${pick}"]`),
            ]);
            await page.waitForTimeout(800);
            const nowChecked = await page.evaluate((v) => document.querySelector(`input[name="estimate_method"][value="${v}"]`)?.checked ?? false, pick);
            const totalAfter = await grandTotal(page);
            check('estimator: picking a rate applies it (checked after the swap)', nowChecked, JSON.stringify(codes));
            check('estimator: shipping row in the totals after the pick', await page.locator('[data-hyperion-cart-totals] [data-total^="shipping"]').count() > 0);
            check('estimator: grand total follows the picked rate', totalAfter !== totalBefore, `${totalBefore} -> ${totalAfter}`);
        }
        check('estimator: grand total changed from the un-estimated cart', before !== await grandTotal(page), `${before} -> ${await grandTotal(page)}`);
        if (withFpt) {
            check('fpt: cart item shows the FPT line', await page.locator('#hyperion-cart-items [data-hyperion-fpt]').count() > 0);
            check('fpt: cart totals show the FPT row', await page.locator('[data-hyperion-cart-totals] [data-total="weee_tax"]').count() === 1);
            await page.goto(base + '/', { waitUntil: 'networkidle' });
            await page.click('[data-hyperion-minicart-toggle], hyperion-mini-cart button, #hyperion-mini-cart-count').catch(() => {});
            await page.waitForTimeout(1500);
            const miniFpt = await page.evaluate(() => {
                const host = document.querySelector('hyperion-mini-cart');
                const root = host?.shadowRoot ?? host;
                return root ? root.querySelectorAll('[data-hyperion-fpt]').length : -1;
            });
            check('fpt: mini-cart item shows the FPT line', miniFpt > 0, `lines ${miniFpt}`);
        }
        // ------------------------------------------------------------ coupon form
        await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!document.querySelector('hyperion-coupon-form form'), null, { timeout: 15000 }).catch(() => {});
        const couponLabels = await page.evaluate(() => {
            const host = document.querySelector('hyperion-coupon-form');
            const form = host?.querySelector('form[data-hyperion-coupon-form]');
            return {
                attrs: ['heading-label', 'placeholder-label', 'apply-label', 'cancel-label', 'input-label'].map((a) => host?.getAttribute(a) ?? null),
                heading: host?.querySelector('summary')?.textContent?.trim(),
                placeholder: form?.querySelector('input[name="coupon_code"]')?.getAttribute('placeholder'),
                inputLabel: form?.querySelector('input[name="coupon_code"]')?.getAttribute('aria-label'),
                button: form?.querySelector('button[type="submit"]')?.textContent?.trim(),
                template: host?.querySelectorAll(':scope > template').length ?? -1,
                removeFlag: form?.querySelector('input[name="remove"]')?.value ?? null,
                recaptchaInForm: form?.querySelectorAll('hyperion-recaptcha').length ?? -1,
                tokenInput: form?.querySelectorAll('input[name="g-recaptcha-response"]').length ?? -1,
                recaptchaAnywhere: host?.querySelectorAll('hyperion-recaptcha').length ?? -1,
            };
        });
        check('coupon: the five translated labels travel as attributes', couponLabels.attrs.every((v) => typeof v === 'string' && v.length > 0), JSON.stringify(couponLabels.attrs));
        check('coupon: labels rendered from the attributes', couponLabels.heading === couponLabels.attrs[0] && couponLabels.placeholder === couponLabels.attrs[1] && couponLabels.button === couponLabels.attrs[2] && couponLabels.inputLabel === couponLabels.attrs[4], JSON.stringify(couponLabels));
        check('coupon: apply request carries no remove flag', couponLabels.removeFlag === null && couponLabels.template === 0, `remove ${couponLabels.removeFlag} templates ${couponLabels.template}`);
        if (hasV3Key) {
            check('coupon: <hyperion-recaptcha> moved inside the form, once, with its token input', couponLabels.recaptchaInForm === 1 && couponLabels.tokenInput === 1 && couponLabels.recaptchaAnywhere === 1, JSON.stringify(couponLabels));
        } else {
            check('coupon: no reCAPTCHA rendered without keys, form intact', couponLabels.recaptchaAnywhere === 0 && couponLabels.button, JSON.stringify(couponLabels));
        }
        await page.click('hyperion-coupon-form summary');
        await page.fill('hyperion-coupon-form input[name="coupon_code"]', 'HYPERION-034-BOGUS');
        const [couponRequest] = await Promise.all([
            page.waitForRequest((r) => r.url().includes('/checkout/cart/couponPost') && r.method() === 'POST', { timeout: 30000 }).catch(() => null),
            page.click('hyperion-coupon-form button[type="submit"]'),
        ]);
        const couponResponse = couponRequest ? await couponRequest.response() : null;
        const couponBody = new URLSearchParams(couponRequest?.postData() ?? '');
        const couponToast = await toast(page);
        await page.waitForTimeout(500);
        check('coupon: HTMX POST sent with the code and without remove', couponRequest !== null && couponRequest.headers()['hx-request'] === 'true' && couponBody.get('coupon_code') === 'HYPERION-034-BOGUS' && !couponBody.has('remove'), couponRequest?.postData() ?? '(no request)');
        if (hasV3Key) {
            check('coupon: g-recaptcha-response token in the request body', (couponBody.get('g-recaptcha-response') ?? '').length > 20, `token length ${(couponBody.get('g-recaptcha-response') ?? '').length}`);
        }
        check('coupon: fragment answer (200, no redirect followed)', couponResponse?.status() === 200 && (couponResponse?.url() ?? '').includes('/checkout/cart/couponPost'), `${couponResponse?.status()} ${couponResponse?.url()?.replace(base, '')}`);
        check('coupon: the server answers that the code is not valid (not the reCAPTCHA failure)', couponToast?.tone === 'error' && /not valid/i.test(couponToast?.text ?? '') && !/recaptcha/i.test(couponToast?.text ?? ''), JSON.stringify(couponToast));
        const afterSwap = await page.evaluate(() => {
            const host = document.querySelector('hyperion-coupon-form');
            const form = host?.querySelector('form[data-hyperion-coupon-form]');
            return { forms: document.querySelectorAll('hyperion-coupon-form').length, recaptchaInForm: form?.querySelectorAll('hyperion-recaptcha').length ?? -1, recaptchaInHost: host?.querySelectorAll('hyperion-recaptcha').length ?? -1, button: form?.querySelector('button[type="submit"]')?.textContent?.trim(), disabled: form?.querySelector('button[type="submit"]')?.disabled };
        });
        check('coupon: the swapped form carries the children again and stays usable', afterSwap.forms === 1 && afterSwap.recaptchaInForm === (hasV3Key ? 1 : 0) && afterSwap.recaptchaInHost === (hasV3Key ? 1 : 0) && afterSwap.button === couponLabels.attrs[2] && afterSwap.disabled === false, JSON.stringify(afterSwap));
        const refused = await page.evaluate(() => {
            const host = document.querySelector('hyperion-coupon-form');
            const field = host?.querySelector('form[data-hyperion-coupon-form] input[name="coupon_code"]');
            const message = document.getElementById(field?.getAttribute('aria-describedby') || 'no-such-id');
            return {
                open: host?.querySelector('details')?.open ?? false,
                value: field?.value ?? '',
                invalid: field?.getAttribute('aria-invalid') ?? '',
                message: (message?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                marked: !!message?.hasAttribute('data-hyperion-coupon-error'),
                insideForm: !!message && !!host?.contains(message),
                underField: !!message && !!field && message.getBoundingClientRect().height > 0 && message.getBoundingClientRect().top >= field.getBoundingClientRect().bottom - 1,
                fields: document.querySelectorAll('input[name="coupon_code"]').length,
                fallbackForms: host?.querySelectorAll('noscript').length ?? -1,
                focused: !!field && document.activeElement === field,
            };
        });
        check('coupon: a refused code keeps the form open with the code in the field and the focus on it', refused.open && refused.value === 'HYPERION-034-BOGUS' && refused.focused, JSON.stringify(refused));
        check('coupon: the field is invalid and described by the message printed under it', refused.invalid === 'true' && refused.marked && refused.insideForm && refused.underField && /not valid/i.test(refused.message), JSON.stringify(refused));
        check('coupon: exactly one coupon_code field on the page after the answer', refused.fields === 1 && refused.fallbackForms === 0, `fields ${refused.fields}, noscript ${refused.fallbackForms}`);
        // ------------------------------------------------------------ register form: one VAT field
        await page.goto(base + '/customer/account/create/', { waitUntil: 'networkidle' });
        // The address fields (and the VAT field with them) show only on a store whose register
        // block asks for them: none is fine, two is the defect.
        const registerVat = await page.evaluate(() => ({
            ids: document.querySelectorAll('#vat_id').length,
            names: document.querySelectorAll('[name="vat_id"]').length,
        }));
        check(
            'register: at most one VAT field (#vat_id, name vat_id) on the form while VAT is visible',
            registerVat.ids <= 1 && registerVat.names <= 1,
            `#vat_id ${registerVat.ids}, [name="vat_id"] ${registerVat.names}${registerVat.ids === 0 ? ' (address fields are not shown on this store)' : ''}`
        );
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    });

    // ------------------------------------------------------------ guest: a quantity change posts the cart by itself
    await block('quantity', async () => {
        const j = await newJourney();
        const { page } = j;
        await addToCart(page, u('/joust-duffle-bag.html'));
        await addToCart(page, u('/fusion-backpack.html'));
        const response = await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        const serverHtml = await response.text();
        const formHtml = serverHtml.slice(Math.max(0, serverHtml.indexOf('id="hyperion-cart-form"')));
        const visibleSubmits = await page.evaluate(() => [...document.querySelectorAll('button[type="submit"]')]
            .filter((button) => button.form?.id === 'hyperion-cart-form' && button.getClientRects().length > 0).length);
        check('quantity: no "Update Cart" button with scripting on, the fallback button sits in <noscript>', visibleSubmits === 0 && /<noscript>\s*<button type="submit"/.test(formHtml), `visible submit buttons of the cart form ${visibleSubmits}`);

        const posts = [];
        page.on('request', (request) => { if (request.method() === 'POST' && isUpdatePost(request)) posts.push({ request, body: request.postData() ?? '', answered: false, failed: false }); });
        page.on('requestfailed', (request) => { const post = posts.find((p) => p.request === request); if (post) post.failed = true; });
        page.on('response', (r) => { const post = posts.find((p) => p.request === r.request()); if (post) post.answered = true; });
        const line = (id) => `[data-hyperion-cart-item][data-item-id="${id}"]`;
        const [first, second] = await cartLines(page);
        if (!first || !second) throw new Error('the cart does not hold the two lines of the check');
        await page.evaluate(() => { window.hyperionCartCheckLoaded = true; });
        const grandBefore = await grandTotal(page);

        // Three quick steps on one line.
        const plusFirst = page.locator(`${line(first.id)} [data-hyperion-qty-step="1"]`);
        const burstAnswer = page.waitForResponse(isUpdatePost, { timeout: 30000 });
        await plusFirst.click();
        await plusFirst.click();
        await plusFirst.click();
        await burstAnswer;
        await page.waitForTimeout(1200);
        const afterBurst = (await cartLines(page)).find((l) => l.id === first.id);
        const burstBody = new URLSearchParams(posts[0]?.body ?? '');
        check(
            'quantity: three quick steps send one request that carries every line of the cart',
            posts.length === 1 && burstBody.get(first.qtyName) === String(Number(first.qty) + 3) && burstBody.get(second.qtyName) === second.qty,
            `requests ${posts.length}, body ${first.qtyName}=${burstBody.get(first.qtyName)} ${second.qtyName}=${burstBody.get(second.qtyName)}`
        );
        check(
            'quantity: the cart follows without a click and without a reload (quantity, row total, order total)',
            afterBurst?.qty === String(Number(first.qty) + 3) && Math.abs(amountOf(afterBurst.rowTotal) - amountOf(afterBurst.price) * Number(afterBurst.qty)) < 0.011
                && await grandTotal(page) !== grandBefore && await page.evaluate(() => window.hyperionCartCheckLoaded === true),
            JSON.stringify({ afterBurst, grand: `${grandBefore} -> ${await grandTotal(page)}` })
        );
        const burstFocus = await focusFacts(page);
        check(
            'quantity: the focus is on the stepper of the edited line after the swap, the page did not scroll',
            burstFocus.itemId === first.id && burstFocus.inStepper && await page.evaluate(() => window.scrollY) === 0,
            JSON.stringify(burstFocus)
        );

        // A typed quantity, with the answer held back so the busy state can be read.
        let hold = 900;
        await page.route(/\/checkout\/cart\/updatePost/, async (route) => {
            await new Promise((resolve) => { setTimeout(resolve, hold); });
            await route.continue().catch(() => {});
        });
        posts.length = 0;
        await page.locator(`input[name="${second.qtyName}"]`).fill('2');
        const typedAnswer = page.waitForResponse(isUpdatePost, { timeout: 30000 });
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.querySelector('[data-hyperion-cart-lines]')?.classList.contains('htmx-request'), null, { timeout: 5000 }).catch(() => {});
        const busy = await page.evaluate(([editedId, otherId]) => {
            const steppers = (id) => [...document.querySelectorAll(`[data-hyperion-cart-item][data-item-id="${id}"] [data-hyperion-qty-step]`)].map((button) => button.disabled);
            const list = document.querySelector('[data-hyperion-cart-lines]');
            return {
                indicator: !!list?.classList.contains('htmx-request'),
                edited: steppers(editedId),
                other: steppers(otherId),
                fieldDisabled: document.querySelector(`[data-hyperion-cart-item][data-item-id="${editedId}"] [data-hyperion-qty]`)?.disabled ?? null,
            };
        }, [second.id, first.id]);
        await typedAnswer;
        await page.waitForTimeout(1200);
        const dimmedRule = await page.evaluate(() => {
            // The rule that dims the list while it is the indicator of the request, read from the style sheets.
            const list = document.querySelector('[data-hyperion-cart-lines]');
            list.classList.add('htmx-request');
            list.style.transition = 'none';
            const opacity = Number(getComputedStyle(list).opacity);
            list.classList.remove('htmx-request');
            list.style.transition = '';
            return opacity;
        });
        check(
            'quantity: while the request runs the list of lines is its indicator and only the steppers of the edited line are disabled',
            busy.indicator && busy.edited.length === 2 && busy.edited.every(Boolean) && busy.other.length === 2 && busy.other.every((disabled) => !disabled) && busy.fieldDisabled === false && dimmedRule < 1,
            JSON.stringify({ ...busy, dimmedOpacity: dimmedRule })
        );
        const typedFocus = await focusFacts(page);
        const afterTyped = (await cartLines(page)).find((l) => l.id === second.id);
        check(
            'quantity: a typed quantity posts once when the field is left, and the focus comes back to that line',
            posts.length === 1 && afterTyped?.qty === '2' && typedFocus.itemId === second.id && typedFocus.inStepper,
            JSON.stringify({ requests: posts.length, qty: afterTyped?.qty, focus: typedFocus })
        );

        // A change on another line while a request is on its way: the newer request replaces it.
        posts.length = 0;
        hold = 2000;
        const sent = page.waitForRequest(isUpdatePost, { timeout: 30000 });
        await page.locator(`${line(second.id)} [data-hyperion-qty-step="1"]`).click();
        await sent;
        const replaced = page.waitForResponse((r) => isUpdatePost(r) && posts.length >= 2 && r.request() === posts[1].request, { timeout: 30000 }).catch(() => null);
        await page.locator(`${line(first.id)} [data-hyperion-qty-step="1"]`).click();
        await replaced;
        await page.waitForTimeout(1500);
        await page.unroute(/\/checkout\/cart\/updatePost/);
        const settled = await cartLines(page);
        const tone = await page.evaluate(() => { const n = document.querySelector('#hyperion-notification'); return n && !n.hidden ? n.getAttribute('data-tone') : ''; });
        check(
            'quantity: a newer change replaces the request in flight, both quantities are saved and no error shows',
            posts.length === 2 && posts[0].answered === false && posts[1].answered === true
                && settled.find((l) => l.id === first.id)?.qty === String(Number(first.qty) + 4) && settled.find((l) => l.id === second.id)?.qty === '3' && tone !== 'error',
            JSON.stringify({ requests: posts.map((p) => ({ answered: p.answered, failed: p.failed })), lines: settled.map((l) => `${l.id}=${l.qty}`), tone })
        );
        check('quantity: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    });

    // ------------------------------------------------------------ guest: minimum order amount
    await block('minimum order', async () => {
        const settings = Object.fromEntries(['sales/minimum_order/active', 'sales/minimum_order/amount'].map((configPath) => [configPath, configSnapshot(configPath)]));
        const j = await newJourney();
        const { page } = j;
        // Everything that needs no setting happens before the switch, so the amount is on for the checks only.
        await addToCart(page, u(MINIMUM.path));
        await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        const [only1] = await cartLines(page);
        const lineAmount = amountOf(only1?.rowTotal ?? '');
        const open = await checkoutState(page);
        check(
            `minimum order: the cart of the check starts below ${MINIMUM.amount} and reaches it at quantity 2, with a live checkout link`,
            !!only1 && only1.qty === '1' && lineAmount > 0 && lineAmount < MINIMUM.amount * 0.8 && lineAmount * 2 > MINIMUM.amount * 1.2 && !!open.card?.href && open.reason === '',
            JSON.stringify({ line: only1, card: open.card, reason: open.reason })
        );
        try {
            setConfig('sales/minimum_order/active', 1);
            setConfig('sales/minimum_order/amount', MINIMUM.amount);
            magento('cache:clean config');

            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            const blocked = await checkoutState(page);
            check(
                'minimum order: the summary card shows the reason in a status box',
                blocked.reason === 'minimum_amount' && blocked.boxRole === 'status' && blocked.boxVisible && blocked.boxText.includes(String(MINIMUM.amount)),
                JSON.stringify({ reason: blocked.reason, role: blocked.boxRole, text: blocked.boxText })
            );
            check(
                'minimum order: the checkout link of the card is disabled, keeps the focus order and points at the reason',
                !!blocked.card && blocked.card.href === '' && blocked.card.disabled === 'true' && blocked.card.tabindex === '0' && blocked.boxId !== '' && blocked.card.describedBy === blocked.boxId,
                JSON.stringify(blocked.card)
            );
            check(
                'minimum order: the phone bar link is in the same state, and no other live checkout link or express button is left in the cart',
                !!blocked.bar && blocked.bar.href === '' && blocked.bar.disabled === 'true' && blocked.bar.describedBy === blocked.boxId && blocked.liveLinks === 0 && blocked.expressButtons === 0,
                JSON.stringify({ bar: blocked.bar, liveLinks: blocked.liveLinks, expressButtons: blocked.expressButtons })
            );
            const drawer = await miniCartState(page);
            check(
                'minimum order: the mini-cart shows the reason and its checkout link is disabled',
                drawer.reason === 'minimum_amount' && drawer.boxVisible && drawer.boxText.includes(String(MINIMUM.amount))
                    && !!drawer.link && drawer.link.visible && drawer.link.href === '' && drawer.link.disabled === 'true' && drawer.link.describedBy === drawer.boxId,
                JSON.stringify(drawer)
            );

            // A direct visit to the checkout comes back to the cart and says why.
            await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
            await page.waitForFunction(() => (document.querySelector('[data-hyperion-messages]')?.textContent ?? '').trim().length > 0, null, { timeout: 15000 }).catch(() => {});
            const bounce = await page.evaluate(() => {
                const messages = [...document.querySelectorAll('[data-hyperion-messages] [role="alert"], [data-hyperion-messages] [role="status"]')];
                return {
                    path: location.pathname,
                    messages: messages.filter((m) => m.getBoundingClientRect().height > 0).map((m) => m.textContent.replace(/\s+/g, ' ').trim()),
                };
            });
            check(
                'minimum order: a direct visit to the checkout lands on the cart with one visible notice that names the amount',
                bounce.path.replace(/\/$/, '').endsWith('/checkout/cart') && bounce.messages.filter((text) => text.includes(String(MINIMUM.amount))).length === 1,
                JSON.stringify(bounce)
            );
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            const repeated = await page.evaluate(() => (document.querySelector('[data-hyperion-messages]')?.textContent ?? '').replace(/\s+/g, ' ').trim());
            check('minimum order: the notice is not shown again on the next page', repeated === '', repeated);

            // Crossing the amount through the quantity: the card and the bar are swapped with the cart.
            await page.evaluate(() => { window.hyperionCartCheckLoaded = true; });
            await Promise.all([
                page.waitForResponse(isUpdatePost, { timeout: 30000 }),
                page.locator('[data-hyperion-cart-item] [data-hyperion-qty-step="1"]').first().click(),
            ]);
            await page.waitForTimeout(1200);
            const crossed = await checkoutState(page);
            check(
                'minimum order: a quantity change that crosses the amount enables the card and the bar link without a reload',
                crossed.reason === '' && !!crossed.card?.href && crossed.card.disabled === '' && !!crossed.bar?.href && crossed.bar.disabled === ''
                    && await page.evaluate(() => window.hyperionCartCheckLoaded === true),
                JSON.stringify({ reason: crossed.reason, card: crossed.card, bar: crossed.bar })
            );
            const drawerOpen = await miniCartState(page);
            check('minimum order: the mini-cart link is live again', drawerOpen.reason === '' && !!drawerOpen.link?.href && drawerOpen.link.disabled === '', JSON.stringify(drawerOpen));
            await Promise.all([
                page.waitForResponse(isUpdatePost, { timeout: 30000 }),
                page.locator('[data-hyperion-cart-item] [data-hyperion-qty-step="-1"]').first().click(),
            ]);
            await page.waitForTimeout(1200);
            const back = await checkoutState(page);
            check('minimum order: going back under the amount disables the link again', back.reason === 'minimum_amount' && back.card?.href === '' && back.card?.disabled === 'true', JSON.stringify({ reason: back.reason, card: back.card }));
        } finally {
            await restoreAll([
                ...Object.entries(settings).map(([configPath, snapshot]) => [`${configPath} restored`, () => restoreConfig(configPath, snapshot)]),
                ['configuration cache cleaned after the minimum order settings', () => magento('cache:clean config')],
            ]);
            check(
                'minimum order: the settings are back as they were found',
                Object.entries(settings).every(([configPath, snapshot]) => sameSnapshot(configSnapshot(configPath), snapshot)),
                Object.entries(settings).map(([configPath, snapshot]) => `${configPath} ${snapshot.state}`).join(', ')
            );
        }
        check('minimum order: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    });

    // ------------------------------------------------------------ guest: virtual cart, grouped child line, item options
    await block('lines', async () => {
        const j = await newJourney();
        const { page } = j;
        const estimatorFacts = () => page.evaluate(() => ({
            lines: document.querySelectorAll('[data-hyperion-cart-item]').length,
            panels: document.querySelectorAll('[data-hyperion-cart-estimate]').length,
            forms: document.querySelectorAll('[data-hyperion-cart-estimate-form]').length,
            shippingRows: document.querySelectorAll('[data-hyperion-cart-totals] [data-total^="shipping"]').length,
            checkoutHref: document.querySelector('[data-hyperion-cart-totals] [data-hyperion-checkout-link]')?.getAttribute('href') ?? '',
        }));
        const virtualPath = productPath(VIRTUAL_SKU);
        if (!virtualPath) {
            console.log(`SKIP  virtual cart: the product ${VIRTUAL_SKU} is not installed (it comes with the Hyperion sample data module)`);
        } else {
            await addToCart(page, virtualPath);
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            const virtual = await estimatorFacts();
            check('virtual cart: no shipping estimator and no shipping row, the checkout link is live', virtual.lines === 1 && virtual.panels === 0 && virtual.forms === 0 && virtual.shippingRows === 0 && virtual.checkoutHref !== '', JSON.stringify(virtual));
        }

        // One child of a grouped product.
        await page.goto(base + u(GROUPED.path), { waitUntil: 'networkidle' });
        const childQty = page.locator('input[name^="super_group["]').first();
        if (await childQty.count() === 0) {
            console.log('SKIP  grouped child line: the grouped sample product is not installed');
        } else {
            await childQty.fill('1');
            await page.click('#product_addtocart_form button[type="submit"]');
            await toast(page);
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            if (virtualPath) {
                const mixed = await estimatorFacts();
                check('virtual cart: the estimator is there once a shippable line joins the virtual one', mixed.lines === 2 && mixed.panels === 1 && mixed.forms === 1, JSON.stringify(mixed));
            }
            const lineLinks = await page.evaluate(() => [...document.querySelectorAll('[data-hyperion-cart-item]')].map((li) => ({
                hrefs: [...li.querySelectorAll('a[href]')].filter((a) => !a.closest('[data-hyperion-cart-item-actions]')).map((a) => a.href),
                unlinked: li.querySelectorAll('[data-hyperion-cart-item-unlinked]').length,
                edit: li.querySelectorAll('[data-hyperion-cart-edit]').length,
            })));
            const groupedPath = u(GROUPED.path);
            const child = lineLinks.find((l) => l.hrefs.some((href) => new URL(href).pathname === groupedPath));
            check(
                'grouped child line: the thumbnail and the name link to the page of the grouped product',
                !!child && child.hrefs.length === 2 && child.hrefs.every((href) => new URL(href).pathname === groupedPath) && child.unlinked === 0,
                JSON.stringify(lineLinks)
            );
            const statuses = [];
            for (const href of new Set(lineLinks.flatMap((l) => l.hrefs))) statuses.push({ href: href.replace(base, ''), status: (await j.ctx.request.get(href)).status() });
            check('cart lines: every thumbnail and name link answers 200', statuses.length > 0 && statuses.every((s) => s.status === 200), JSON.stringify(statuses));
            const drawerLinks = await page.evaluate(async () => {
                const host = document.querySelector('hyperion-mini-cart');
                await host?.openPanel?.();
                const root = host?.shadowRoot ?? host;
                for (let i = 0; i < 40 && !root?.querySelector('[data-hyperion-minicart-item]'); i++) await new Promise((resolve) => { setTimeout(resolve, 250); });
                const hrefs = [...(root?.querySelectorAll('[data-hyperion-minicart-item] a[href]') ?? [])].filter((a) => !a.hasAttribute('data-hyperion-minicart-edit')).map((a) => a.href);
                host?.close?.();
                return hrefs;
            });
            const drawerStatuses = [];
            for (const href of new Set(drawerLinks)) drawerStatuses.push({ href: href.replace(base, ''), status: (await j.ctx.request.get(href)).status() });
            check('mini-cart lines: every thumbnail and name link answers 200, the grouped child links to its parent', drawerStatuses.length > 0 && drawerStatuses.every((s) => s.status === 200) && drawerLinks.some((href) => new URL(href).pathname === groupedPath), JSON.stringify(drawerStatuses));
        }

        // A configurable product: its options print as label / value pairs.
        const configurablePath = productPath(CONFIGURABLE_SKU);
        if (!configurablePath) {
            console.log(`SKIP  item options: the configurable sample product ${CONFIGURABLE_SKU} is not installed`);
        } else {
            await page.goto(base + configurablePath, { waitUntil: 'networkidle' });
            await page.waitForFunction(() => document.querySelector('hyperion-swatches')?.shadowRoot?.querySelector('[data-option-id]'), null, { timeout: 20000 }).catch(() => {});
            const chosen = await page.evaluate(async () => {
                const swatches = document.querySelector('hyperion-swatches');
                const config = JSON.parse(swatches.getAttribute('config'));
                const picks = [];
                for (const attribute of Object.values(config.attributes).sort((a, b) => Number(a.position) - Number(b.position))) {
                    const option = attribute.options.find((o) => swatches._isOptionAvailable(attribute.id, o.id));
                    swatches._selectOption(String(attribute.id), String(option.id));
                    picks.push({ label: attribute.label, value: option.label });
                }
                await swatches.updateComplete;
                return { picks, name: document.querySelector('#hyperion-product-title')?.innerText.trim() ?? '' };
            });
            await page.click('#product_addtocart_form button[type="submit"]');
            await toast(page);
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            const pairsOf = (root, itemSelector, needle) => {
                const li = [...root.querySelectorAll(itemSelector)].find((el) => el.textContent.includes(needle));
                const list = li ? [...li.querySelectorAll('dl')].find((dl) => !dl.hasAttribute('data-hyperion-cart-item-prices')) : null;
                return list ? [...list.children].map((pair) => ({
                    tag: pair.tagName,
                    parts: [...pair.children].map((el) => el.tagName).join(','),
                    label: (pair.querySelector('dt')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                    value: (pair.querySelector('dd')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                })) : [];
            };
            const cartPairs = await page.evaluate(`(${pairsOf})(document, '[data-hyperion-cart-item]', ${JSON.stringify(chosen.name)})`);
            const wellFormed = (pairs) => pairs.length === chosen.picks.length && pairs.every((pair) => pair.tag === 'DIV' && pair.parts === 'DT,DD')
                && chosen.picks.every((pick) => pairs.some((pair) => pair.label === `${pick.label}:` && pair.value === pick.value));
            check('item options: the cart line lists each chosen option as one label / value pair', wellFormed(cartPairs), JSON.stringify({ picks: chosen.picks, cartPairs }));
            await page.evaluate(() => document.querySelector('hyperion-mini-cart')?.openPanel?.());
            await page.waitForFunction(() => {
                const host = document.querySelector('hyperion-mini-cart');
                return !!(host?.shadowRoot ?? host)?.querySelector('[data-hyperion-minicart-item] dl');
            }, null, { timeout: 20000 }).catch(() => {});
            const drawerPairs = await page.evaluate(`(${pairsOf})(document.querySelector('hyperion-mini-cart').shadowRoot ?? document.querySelector('hyperion-mini-cart'), '[data-hyperion-minicart-item]', ${JSON.stringify(chosen.name)})`);
            check('item options: the mini-cart line lists the same pairs', wellFormed(drawerPairs), JSON.stringify(drawerPairs));
        }

        // A configurable variant whose own image differs from the parent's: the cart and the mini-cart show the variant's
        // image (checkout/cart/configurable_product_image = itself). The file names are read from the catalog, the thumbnails
        // are compared on the file name stem (the cache path and a WebP companion change around it).
        const variant = VARIANT_IMAGE;
        const variantPath = productPath(variant.parent);
        const imageOf = (sku) => sql(`select v.value from catalog_product_entity_varchar v join catalog_product_entity e on e.entity_id = v.entity_id join eav_attribute a on a.attribute_id = v.attribute_id join eav_entity_type t on t.entity_type_id = a.entity_type_id and t.entity_type_code = 'catalog_product' where e.sku = '${sku}' and a.attribute_code = 'thumbnail' and v.store_id = 0 limit 1`);
        const stemOf = (file) => (String(file ?? '').split('/').pop() ?? '').replace(/(_\d+)?\.[a-z0-9]+$/i, '').toLowerCase();
        const childStem = stemOf(imageOf(variant.child));
        const parentStem = stemOf(imageOf(variant.parent));
        const imageSource = configValue('checkout/cart/configurable_product_image');
        if (imageSource === 'parent') {
            console.log('SKIP  variant image: the store sets checkout/cart/configurable_product_image to parent, the cart shows the parent image on purpose');
        } else if (!variantPath || !childStem || !parentStem) {
            console.log(`SKIP  variant image: the configurable sample product ${variant.parent} or its variant ${variant.child} is not installed or has no thumbnail`);
        } else if (childStem === parentStem) {
            console.log(`SKIP  variant image: ${variant.child} uses the image of ${variant.parent} (${childStem}), nothing to tell apart`);
        } else {
            await page.goto(base + variantPath, { waitUntil: 'networkidle' });
            await page.waitForFunction(() => document.querySelector('hyperion-swatches')?.shadowRoot?.querySelector('[data-option-id]'), null, { timeout: 20000 }).catch(() => {});
            const picked = await page.evaluate(async (labels) => {
                const swatches = document.querySelector('hyperion-swatches');
                if (!swatches) return { ok: false, picks: [], name: '' };
                const config = JSON.parse(swatches.getAttribute('config'));
                const picks = [];
                for (const attribute of Object.values(config.attributes).sort((a, b) => Number(a.position) - Number(b.position))) {
                    const option = attribute.options.find((o) => labels.includes(o.label) && swatches._isOptionAvailable(attribute.id, o.id));
                    if (!option) return { ok: false, picks, name: '' };
                    swatches._selectOption(String(attribute.id), String(option.id));
                    picks.push(`${attribute.label}: ${option.label}`);
                }
                await swatches.updateComplete;
                return { ok: true, picks, name: document.querySelector('#hyperion-product-title')?.innerText.trim() ?? '' };
            }, variant.options);
            if (!picked.ok || !picked.name) {
                console.log(`SKIP  variant image: ${variant.options.join(' / ')} of ${variant.parent} cannot be selected (out of stock?) ${JSON.stringify(picked.picks)}`);
            } else {
                await page.click('#product_addtocart_form button[type="submit"]');
                await toast(page);
                await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
                // Every URL the thumbnail of the line may load: src, srcset and the sources of a surrounding <picture>.
                const thumbnailOf = (root, itemSelector, needle) => {
                    const li = [...root.querySelectorAll(itemSelector)].find((el) => el.textContent.includes(needle));
                    const img = li?.querySelector('img');
                    if (!img) return null;
                    const sources = [...(img.closest('picture')?.querySelectorAll('source') ?? [])].map((s) => s.getAttribute('srcset') ?? '');
                    return [img.getAttribute('src') ?? '', img.getAttribute('srcset') ?? '', ...sources].filter(Boolean).join(' ');
                };
                const showsChild = (urls) => !!urls && urls.toLowerCase().includes(childStem) && !urls.toLowerCase().includes(parentStem);
                const cartThumb = await page.evaluate(`(${thumbnailOf})(document, '[data-hyperion-cart-item]', ${JSON.stringify(picked.name)})`);
                check(`variant image: the cart line of ${picked.picks.join(', ')} shows the variant's image (${childStem}), not the parent's (${parentStem})`, showsChild(cartThumb), String(cartThumb).slice(0, 300));
                await page.evaluate(() => document.querySelector('hyperion-mini-cart')?.openPanel?.());
                await page.waitForFunction((needle) => {
                    const host = document.querySelector('hyperion-mini-cart');
                    return [...((host?.shadowRoot ?? host)?.querySelectorAll('[data-hyperion-minicart-item]') ?? [])].some((li) => li.textContent.includes(needle) && li.querySelector('img'));
                }, picked.name, { timeout: 20000 }).catch(() => {});
                const drawerThumb = await page.evaluate(`(${thumbnailOf})(document.querySelector('hyperion-mini-cart').shadowRoot ?? document.querySelector('hyperion-mini-cart'), '[data-hyperion-minicart-item]', ${JSON.stringify(picked.name)})`);
                check(`variant image: the mini-cart line shows the variant's image (${childStem}), not the parent's (${parentStem})`, showsChild(drawerThumb), String(drawerThumb).slice(0, 300));
                await page.evaluate(() => document.querySelector('hyperion-mini-cart')?.close?.());
            }
        }
        check('lines: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    });

    // ------------------------------------------------------------ guest: rates in a non-base display currency
    await block('multi-currency', async () => {
        const allowed = (configValue('currency/options/allow') ?? '').split(',').filter(Boolean);
        const baseCurrency = configValue('currency/options/base') ?? 'USD';
        const display = allowed.find((code) => code !== baseCurrency
            && Number(sql(`select rate from directory_currency_rate where currency_from = '${baseCurrency}' and currency_to = '${code}'`) || 0) > 0);
        if (!display) {
            console.log(`SKIP  multi-currency: one display currency only (base ${baseCurrency}, allowed ${allowed.join(',') || 'default'}), nothing to convert`);
        } else {
            const j = await newJourney();
            const { page } = j;
            await addToCart(page, u('/joust-duffle-bag.html'));
            // The footer currency switcher: one POST form per currency.
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
                page.evaluate((code) => document.querySelector(`form[action*="directory/currency/switch"] input[name="currency"][value="${code}"]`)?.form.requestSubmit(), display),
            ]);
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            const active = await page.evaluate(() => document.querySelector('form[action*="directory/currency/switch"] button[aria-current="true"]')?.closest('form')?.querySelector('input[name="currency"]')?.value ?? '');
            check(`multi-currency: the footer switcher changes the display currency to ${display}`, active === display, `active ${active || '(none)'}`);
            await estimate(page);
            const offered = await readRates(page);
            check('multi-currency: rates listed for the destination', offered.length > 0, `rates ${offered.length}`);
            const compared = [];
            for (const { code } of offered) {
                await pickRate(page, code);
                const rate = (await readRates(page)).find((r) => r.code === code);
                compared.push({ code, rate: rate?.amount ?? '', checked: rate?.checked ?? false, row: await totalsRow(page, 'shipping', 'shipping_incl') });
            }
            check(
                `multi-currency: each rate shows the amount of the Shipping totals row once it is selected (${display}, base ${baseCurrency})`,
                compared.length > 0 && compared.every((c) => c.rate !== '' && c.rate === c.row),
                JSON.stringify(compared)
            );
            // Each rate is picked while another one is applied: the swapped estimator must mark the new one.
            check(
                'multi-currency: the estimator marks the rate that was just selected, also when it replaces another one',
                compared.length > 0 && compared.every((c) => c.checked),
                JSON.stringify(compared.map((c) => ({ code: c.code, checked: c.checked })))
            );
            check('multi-currency: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
            await j.ctx.close();
        }
    });

    // ------------------------------------------------------------ guest: a carrier error rate is text, never a choice
    await block('error rate', async () => {
        const carrier = Object.fromEntries([
            'carriers/freeshipping/active',
            'carriers/freeshipping/free_shipping_subtotal',
            'carriers/freeshipping/showmethod',
        ].map((configPath) => [configPath, configSnapshot(configPath)]));
        try {
            // Free shipping from an amount no test cart reaches, shown when it does not apply: the carrier answers with an error rate.
            magento('config:set carriers/freeshipping/active 1');
            magento('config:set carriers/freeshipping/free_shipping_subtotal 1000000');
            magento('config:set carriers/freeshipping/showmethod 1');
            magento('cache:flush');
            const j = await newJourney();
            const { page } = j;
            await addToCart(page, u('/joust-duffle-bag.html'));
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            await estimate(page);
            const rows = await page.evaluate(() => ({
                unavailable: [...document.querySelectorAll('[data-hyperion-cart-estimate-unavailable]')].map((p) => ({
                    text: p.textContent.replace(/\s+/g, ' ').trim(),
                    radios: p.querySelectorAll('input').length,
                })),
                errorRadios: document.querySelectorAll('input[name="estimate_method"][value$="_error"]').length,
                zeroRadio: [...document.querySelectorAll('[data-hyperion-cart-estimate-rates] label')].some((l) => /free shipping/i.test(l.textContent)),
            }));
            check(
                'error rate: the carrier that does not apply is a line of text with its message, no radio and no price',
                rows.unavailable.length === 1 && /free shipping/i.test(rows.unavailable[0].text) && rows.unavailable[0].text.length > 'Free Shipping:'.length + 5
                    && rows.unavailable[0].radios === 0 && !/\d[.,]\d\d/.test(rows.unavailable[0].text) && rows.errorRadios === 0 && !rows.zeroRadio,
                JSON.stringify(rows)
            );
            const selectable = await readRates(page);
            if (selectable.length) await pickRate(page, selectable[0].code);
            const shippingBefore = await totalsRow(page, 'shipping', 'shipping_incl');
            // A hand-made POST of the error rate's code, as htmx would send the form.
            const forged = await page.evaluate(async (destination) => {
                const form = document.querySelector('[data-hyperion-cart-estimate-form]');
                const body = new URLSearchParams(new FormData(form));
                body.set('postcode', destination.postcode);
                body.set('estimate_method', 'freeshipping_error');
                const response = await fetch(form.getAttribute('hx-post'), {
                    method: 'POST',
                    headers: { 'HX-Request': 'true', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
                    body,
                    credentials: 'same-origin',
                });
                const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
                const toastNode = doc.querySelector('#hyperion-notification');
                return {
                    status: response.status,
                    tone: toastNode?.getAttribute('data-tone') ?? '',
                    toast: (toastNode?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
                    checked: doc.querySelector('input[name="estimate_method"]:checked')?.value ?? '',
                };
            }, DESTINATION);
            check(
                'error rate: posting its code by hand is refused with the "not available" message',
                forged.status === 200 && forged.tone === 'error' && /not available/i.test(forged.toast) && forged.checked !== 'freeshipping_error',
                JSON.stringify(forged)
            );
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            const after = { checked: (await readRates(page)).find((r) => r.checked)?.code ?? '', shipping: await totalsRow(page, 'shipping', 'shipping_incl') };
            check(
                'error rate: the cart keeps the shipping it had, no free shipping in the totals',
                after.checked !== 'freeshipping_error' && after.shipping === shippingBefore && (after.shipping === '' || amountOf(after.shipping) > 0),
                JSON.stringify({ shippingBefore, ...after })
            );
            check('error rate: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
            await j.ctx.close();
        } finally {
            await restoreAll([
                ...Object.entries(carrier).map(([configPath, snapshot]) => [`${configPath} restored`, () => restoreConfig(configPath, snapshot)]),
                ['cache flushed after the carrier settings', () => magento('cache:flush')],
            ]);
        }
    });

    // ------------------------------------------------------------ guest: unit price and row total follow the cart tax display
    await block('tax display', async () => {
        copyFixture('tax-display-fixture.php');
        let tax = { applied: false, reason: 'fixture did not run' };
        try {
            tax = runFixture('tax-display-fixture.php');
            if (!tax.applied) {
                console.log(`SKIP  tax display: ${tax.reason}`);
            } else {
                magento('cache:flush');
                const j = await newJourney();
                const { page } = j;
                await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
                const pdpPrice = clean(await page.locator('[data-hyperion-pdp-price] .price').first().textContent().catch(() => ''));
                await page.click('#product_addtocart_form button[type="submit"]');
                await toast(page);
                await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
                const line = await cartLine(page, 'Joust Duffle Bag');
                const totals = { subtotal: await totalsRow(page, 'subtotal'), tax: await totalsRow(page, 'tax') };
                check(
                    `tax display: the cart line shows the including-tax unit price of the product page (${tax.rate} % for the default destination)`,
                    !!line && line.price !== '' && line.price === pdpPrice && amountOf(totals.tax) > 0,
                    JSON.stringify({ pdpPrice, line, totals })
                );
                // With FPT on, core adds the FPT of the line to the subtotal including tax (the product carries the demo FPT).
                const fptInSubtotal = withFpt ? amountOf((await totalsRow(page, 'weee_tax')) ?? '0') : 0;
                check(
                    `tax display: the row total of the only line equals the Subtotal row (both including tax${fptInSubtotal > 0 ? ', the subtotal with the FPT of the line' : ''})`,
                    !!line && line.rowTotal !== '' && Math.abs(amountOf(line.rowTotal) + fptInSubtotal - amountOf(totals.subtotal)) < 0.011
                        && Math.abs(amountOf(line.rowTotal) - amountOf(line.price) * Number(line.qty)) < 0.011,
                    JSON.stringify({ line, totals, fptInSubtotal })
                );
                await page.evaluate(() => document.querySelector('hyperion-mini-cart')?.openPanel?.());
                await page.waitForFunction(() => {
                    const host = document.querySelector('hyperion-mini-cart');
                    return !!(host?.shadowRoot ?? host)?.querySelector('[data-hyperion-minicart-row-total]');
                }, null, { timeout: 15000 }).catch(() => {});
                const miniRow = await page.evaluate(() => {
                    const host = document.querySelector('hyperion-mini-cart');
                    return ((host?.shadowRoot ?? host)?.querySelector('[data-hyperion-minicart-row-total]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
                });
                check('tax display: the mini-cart line shows the same including-tax row total', !!line && miniRow !== '' && miniRow === line.rowTotal, JSON.stringify({ miniRow, cart: line?.rowTotal }));
                check('tax display: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
                await j.ctx.close();
            }
        } finally {
            let removed = { removed: false };
            await restoreAll([
                ['tax display fixture removed', () => { removed = runFixture('tax-display-fixture.php', '--remove'); }],
                ['tax display fixture file removed', () => compose('php-fpm', 'rm -f /tmp/tax-display-fixture.php')],
                ['cache flushed after the tax display fixture', () => magento('cache:flush')],
            ]);
            if (tax.applied) check('tax display: the tax configuration is back as it was found', removed.removed === true, JSON.stringify(removed));
        }
    });

    // ------------------------------------------------------------ guest: a decimal quantity survives an update of another line
    await block('decimal quantity', async () => {
        copyFixture('decimal-qty-fixture.php');
        try {
            console.log('decimal quantity fixture:', JSON.stringify(runFixture('decimal-qty-fixture.php', DECIMAL.sku)));
            const j = await newJourney();
            const { page } = j;
            await addToCart(page, u(DECIMAL.path));
            await addToCart(page, u('/joust-duffle-bag.html'));
            await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
            const before = await cartLine(page, DECIMAL.name);
            check(
                'decimal quantity: the line of a decimal product accepts any step and asks for a decimal keypad',
                !!before && before.step === 'any' && before.inputmode === 'decimal' && before.qty === '1',
                JSON.stringify(before)
            );
            const other = await cartLine(page, 'Joust Duffle Bag');
            check('decimal quantity: a whole-unit line keeps step 1 and the numeric keypad', !!other && other.step === '1' && other.inputmode === 'numeric' && other.min === '1', JSON.stringify(other));
            if (before && other) {
                await setQty(page, before.qtyName, '1.5');
                const saved = await cartLine(page, DECIMAL.name);
                check('decimal quantity: 1.5 is saved and printed without a trailing zero', saved?.qty === '1.5', JSON.stringify(saved));
                await setQty(page, other.qtyName, '2');
                const survived = await cartLine(page, DECIMAL.name);
                const otherAfter = await cartLine(page, 'Joust Duffle Bag');
                check('decimal quantity: 1.5 survives an update of another line', survived?.qty === '1.5' && otherAfter?.qty === '2', JSON.stringify({ survived, otherAfter }));
                const badge = clean(await page.locator('#hyperion-mini-cart-count').textContent().catch(() => ''));
                const useQty = (configValue('checkout/cart_link/use_qty') ?? '1') !== '0';
                check('decimal quantity: the header count is the sum of the quantities (or the number of lines)', badge === (useQty ? '3.5' : '2'), `badge "${badge}" use_qty ${useQty}`);
                // Leave no decimal quantity behind in the quote before the product is whole-unit again.
                await setQty(page, before.qtyName, '1');
            }
            check('decimal quantity: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
            await j.ctx.close();
        } finally {
            await restoreAll([
                ['decimal quantity fixture removed', () => console.log('decimal quantity fixture:', JSON.stringify(runFixture('decimal-qty-fixture.php', `${DECIMAL.sku} --remove`)))],
                ['decimal quantity fixture file removed', () => compose('php-fpm', 'rm -f /tmp/decimal-qty-fixture.php')],
            ]);
        }
    });

    // ------------------------------------------------------------ customer: move to wishlist, VAT, gift message, policy
    await block('customer', async () => {
        const j = await newJourney();
        const { page } = j;
        check('customer: login', await login(page), page.url().replace(base, ''));

        // Rates of the default address: asked for when the panel opens, never by the page.
        const estimateRequests = [];
        page.on('request', (r) => { if (r.url().includes('/hyperion/cart/estimate')) estimateRequests.push(r); });
        await addToCart(page, u('/joust-duffle-bag.html'));
        const cartResponse = await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        const cartHtml = await cartResponse.text();
        const lazyServer = {
            lazy: (cartHtml.match(/data-hyperion-cart-estimate-lazy/g) ?? []).length,
            radios: (cartHtml.match(/name="estimate_method"/g) ?? []).length,
            empty: (cartHtml.match(/data-hyperion-cart-estimate-empty/g) ?? []).length,
            open: await page.evaluate(() => document.querySelector('[data-hyperion-cart-estimate]')?.open ?? null),
        };
        check('lazy rates: the server markup of a customer with a default address carries no rate, the panel is closed and marked lazy', lazyServer.lazy === 1 && lazyServer.radios === 0 && lazyServer.empty === 0 && lazyServer.open === false, JSON.stringify(lazyServer));
        check('lazy rates: no estimate request before the panel opens', estimateRequests.length === 0, `requests ${estimateRequests.length}`);
        const rowsBeforeOpen = await cartTotalRows(page);
        const [prefill] = await Promise.all([
            page.waitForResponse((r) => r.url().includes('/hyperion/cart/estimate'), { timeout: 30000 }).catch(() => null),
            page.click('[data-hyperion-cart-estimate] summary'),
        ]);
        await page.waitForSelector('[data-hyperion-cart-estimate-rates] input[name="estimate_method"]', { timeout: 15000 }).catch(() => {});
        const lazyOffered = await readRates(page);
        const lazyPanel = await page.evaluate(() => ({
            country: document.querySelector('[data-hyperion-cart-estimate-form] select[name="country_id"]')?.value ?? '',
            postcode: document.querySelector('[data-hyperion-cart-estimate-form] input[name="postcode"]')?.value ?? '',
            focusOnSummary: document.activeElement === document.querySelector('[data-hyperion-cart-estimate] summary'),
        }));
        const prefillRequest = prefill?.request();
        check(
            'lazy rates: opening the panel sends one GET with prefill=1, answered private and never stored',
            estimateRequests.length === 1 && prefillRequest?.method() === 'GET' && new URL(prefillRequest.url()).searchParams.get('prefill') === '1'
                && prefill.status() === 200 && /no-store/.test(prefill.headers()['cache-control'] ?? '') && /private/.test(prefill.headers()['cache-control'] ?? ''),
            `${estimateRequests.map((r) => `${r.method()} ${r.url().replace(base, '')}`).join(' | ')} -> ${prefill?.status()} ${prefill?.headers()['cache-control'] ?? ''}`
        );
        check('lazy rates: the rates of the default address are listed, none selected, the destination filled in, the focus still on the summary', lazyOffered.length > 0 && lazyOffered.every((r) => !r.checked) && lazyPanel.country === DESTINATION.country && lazyPanel.postcode.startsWith(DESTINATION.postcode) && lazyPanel.focusOnSummary, JSON.stringify({ lazyOffered, lazyPanel }));
        check('lazy rates: listing them changes no total', JSON.stringify(await cartTotalRows(page)) === JSON.stringify(rowsBeforeOpen), JSON.stringify(await cartTotalRows(page)));
        await page.click('[data-hyperion-cart-estimate] summary');
        await page.waitForTimeout(300);
        await page.click('[data-hyperion-cart-estimate] summary');
        await page.waitForTimeout(1200);
        check('lazy rates: closing and opening the panel again sends nothing', estimateRequests.length === 1, `requests ${estimateRequests.length}`);
        if (lazyOffered.length) {
            const grandBeforePick = await grandTotal(page);
            await pickRate(page, lazyOffered[0].code);
            const picked = (await readRates(page)).find((r) => r.code === lazyOffered[0].code);
            const shippingRow = await totalsRow(page, 'shipping', 'shipping_incl');
            check(
                'lazy rates: picking one posts the form (the radios arrived after the form was wired) and the totals follow',
                estimateRequests.length === 2 && estimateRequests[1].method() === 'POST' && picked?.checked === true && shippingRow !== '' && shippingRow === picked.amount && await grandTotal(page) !== grandBeforePick,
                JSON.stringify({ requests: estimateRequests.map((r) => r.method()), picked, shippingRow, grand: `${grandBeforePick} -> ${await grandTotal(page)}` })
            );
        }

        await addToCart(page, u('/fusion-backpack.html'));
        await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        const linesBefore = await page.locator('[data-hyperion-cart-item]').count();
        const wishBefore = await page.evaluate(() => Number(document.querySelector('#hyperion-wishlist-count')?.textContent?.replace(/\D/g, '') || 0));
        const mover = page.locator('[data-hyperion-cart-item]:has-text("Fusion Backpack") [data-hyperion-move-to-wishlist]').first();
        check('wishlist: Move to Wishlist offered to the customer', await mover.count() === 1);
        await Promise.all([
            page.waitForResponse((r) => r.url().includes('/wishlist/index/fromcart'), { timeout: 30000 }),
            mover.click(),
        ]);
        const t1 = await toast(page);
        await page.waitForTimeout(800);
        const linesAfter = await page.locator('[data-hyperion-cart-item]').count();
        const wishAfter = await page.evaluate(() => Number(document.querySelector('#hyperion-wishlist-count')?.textContent?.replace(/\D/g, '') || 0));
        check('wishlist: item moved (toast, one line less, header counter up)', t1?.tone === 'success' && linesAfter === linesBefore - 1 && wishAfter === wishBefore + 1, `${JSON.stringify(t1)} lines ${linesBefore}->${linesAfter} wish ${wishBefore}->${wishAfter}`);
        await page.goto(base + '/wishlist/', { waitUntil: 'networkidle' });
        check('wishlist: product listed on the wishlist page', await page.evaluate(() => document.body.innerText.includes('Fusion Backpack')));
        // leave the wishlist as found
        await page.evaluate(async () => {
            const btn = document.querySelector('[data-hyperion-wishlist-remove], form[action*="wishlist/index/remove"] button, a[href*="wishlist/index/remove"]');
            if (btn) btn.click();
        }).catch(() => {});

        // VAT on a new address
        await page.goto(base + '/customer/address/new/', { waitUntil: 'networkidle' });
        const vat = page.locator('input[name="vat_id"]');
        check('vat: field rendered on the address form when visible', await vat.count() === 1);
        const fill = async (sel, value) => { const el = page.locator(sel).first(); if (await el.count()) await el.fill(value); };
        await fill('input[name="firstname"]', 'Veronica');
        await fill('input[name="lastname"]', 'Costello');
        await fill('input[name="telephone"]', '5551234');
        await fill('input[name="street[0]"]', '22 Spec Street');
        await fill('input[name="city"]', 'Calder');
        await page.selectOption('select[name="country_id"]', 'US');
        await page.waitForTimeout(500);
        await page.selectOption('select[name="region_id"]', { label: 'Michigan' }).catch(() => {});
        await fill('input[name="postcode"]', '49628');
        await vat.fill('IT01234567890');
        await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}), page.click('form#form-validate button[type="submit"]')]);
        const savedVat = sql(`select vat_id from customer_address_entity where street like '22 Spec Street%' order by entity_id desc limit 1`);
        check('vat: value saved with the address', savedVat === 'IT01234567890', savedVat || '(none)');
        sql(`delete from customer_address_entity where street like '22 Spec Street%'`);

        // Gift message + shipping policy inside the checkout
        await addToCart(page, u('/fusion-backpack.html'));
        await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
        await page.waitForSelector('shipping-method-row', { timeout: 40000 }).catch(() => {});
        const policyBtn = page.locator('[data-hyperion-shipping-policy-open]');
        check('policy: trigger rendered in the shipping step', await policyBtn.count() === 1);
        await policyBtn.click();
        await page.waitForTimeout(300);
        const dialogState = await page.evaluate(() => { const d = document.querySelector('dialog[data-hyperion-shipping-policy]'); return { open: !!d?.open, text: d?.textContent?.replace(/\s+/g, ' ') ?? '', bold: !!d?.querySelector('b') }; });
        // Core escapes the policy content before nl2br, so markup shows as text, like Luma.
        check('policy: dialog opens with the configured text', dialogState.open && dialogState.text.includes('same day'), dialogState.text.slice(0, 80));
        await page.locator('dialog[data-hyperion-shipping-policy] hc-button button').click();

        const giftOpen = page.locator('[data-hyperion-gift-open]');
        const giftOffered = await giftOpen.count() === 1;
        check('gift: trigger rendered in the checkout', giftOffered);
        if (giftOffered) await giftOpen.click();
        await page.waitForSelector('[data-hyperion-gift-form="order"]', { timeout: 10000 }).catch(() => {});
        const orderForm = page.locator('[data-hyperion-gift-form="order"]');
        check('gift: order-level form rendered', await orderForm.count() === 1);
        if (await orderForm.count() === 1) {
        await orderForm.locator('input[name="gift_order_sender"]').fill('Ann');
        await orderForm.locator('input[name="gift_order_recipient"]').fill('Bob');
        await orderForm.locator('textarea').fill('Hyperion e2e says hi');
        await Promise.all([
            page.waitForResponse((r) => /\/gift-message$/.test(r.url()) && r.request().method() === 'POST', { timeout: 30000 }).then((r) => r),
            orderForm.locator('hc-button button').click(),
        ]);
        await page.waitForTimeout(800);
        check('gift: saved notice shown', await orderForm.locator('[data-hyperion-gift-notice="success"]').count() === 1);
        const stored = await page.evaluate(async () => {
            const r = await fetch('/rest/V1/carts/mine/gift-message', { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, credentials: 'same-origin' });
            return r.ok ? r.json() : { status: r.status };
        });
        check('gift: quote carries the message (REST GET)', stored && stored.sender === 'Ann' && stored.recipient === 'Bob' && stored.message === 'Hyperion e2e says hi', JSON.stringify(stored).slice(0, 120));
        const itemForms = await page.locator('[data-hyperion-gift-form]:not([data-hyperion-gift-form="order"])').count();
        check('gift: item-level form rendered for the physical item', itemForms >= 1, `forms ${itemForms}`);
        }
        if (withFpt) {
            await addToCart(page, u('/joust-duffle-bag.html'));
            await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
            await page.waitForSelector('summary-item', { timeout: 30000 }).catch(() => {});
            check('fpt: checkout summary item shows the FPT line', await page.locator('summary-item [data-hyperion-fpt]').count() > 0);
            check('fpt: checkout totals show the FPT row', await page.locator('summary-totals [data-total="weee_tax"]').count() === 1);
        }
        check('customer: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    });

    // ------------------------------------------------------------ guest: a total the theme does not know, cart and checkout
    if (withCustomTotal) {
        await block('custom total', async () => {
            copyFixture('custom-total-fixture.php');
            try {
                const applied = runFixture('custom-total-fixture.php', '--apply');
                check('custom total: the fixture module is installed and compiled', applied.applied === true, JSON.stringify(applied));
                if (applied.applied) {
                    const j = await newJourney();
                    const { page } = j;
                    // The position of the row and what stands between it and the order total.
                    const place = (rows) => {
                        const fee = rows.findIndex((row) => row.code === CUSTOM_TOTAL.code);
                        const grand = rows.findIndex((row) => row.code.startsWith('grand_total'));
                        return { fee, grand, distance: grand - fee };
                    };
                    // The rows add up to the order total when each amount is printed once (no excluding / including tax pairs).
                    const addsUp = (rows) => {
                        const parts = rows.filter((row) => !row.code.startsWith('grand_total'));
                        if (parts.some((row) => /_(incl|excl)$/.test(row.code) || row.code === 'tax_rate')) return null;
                        const sum = parts.reduce((total, row) => total + (row.code === 'discount' ? -1 : 1) * amountOf(row.value), 0);
                        const grand = rows.find((row) => row.code === 'grand_total');
                        return !!grand && Math.abs(sum - amountOf(grand.value)) < 0.011;
                    };
                    await addToCart(page, u('/joust-duffle-bag.html'));
                    await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
                    await estimate(page);
                    const offered = await readRates(page);
                    if (offered.length && !offered.some((rate) => rate.checked)) await pickRate(page, offered[0].code);
                    const cartRows = await cartTotalRows(page);
                    const cartFee = cartRows.find((row) => row.code === CUSTOM_TOTAL.code);
                    const cartPlace = place(cartRows);
                    // The store of the run shows its base currency to a new visitor, so the fee is its base amount.
                    check(
                        `custom total: the cart lists the row "${CUSTOM_TOTAL.title}" with ${CUSTOM_TOTAL.amount.toFixed(2)} before the order total`,
                        !!cartFee && cartFee.label === CUSTOM_TOTAL.title && Math.abs(amountOf(cartFee.value) - CUSTOM_TOTAL.amount) < 0.001 && cartPlace.fee !== -1 && cartPlace.distance > 0,
                        JSON.stringify(cartRows)
                    );
                    const cartSum = addsUp(cartRows);
                    if (cartSum === null) console.log('SKIP  custom total: the cart rows add up to the order total  -- the tax display prints amounts twice, the sum is not checked');
                    else check('custom total: the cart rows add up to the order total', cartSum, JSON.stringify(cartRows.map((row) => `${row.code}=${row.value}`)));

                    await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
                    await page.waitForSelector(`summary-totals [data-total="${CUSTOM_TOTAL.code}"]`, { timeout: 40000 }).catch(() => {});
                    // A guest arrives without an address: the summary prints no shipping amount until the checkout
                    // confirmed a method, so the rows only add up once the address is complete.
                    await page.fill('#hc-contact-email', `hyperion.e2e.custom-total.${Date.now()}@example.com`);
                    await page.fill('#hc-shipping-firstname', 'Custom');
                    await page.fill('#hc-shipping-lastname', 'Total');
                    await page.selectOption('#hc-shipping-country_id', DESTINATION.country);
                    await page.fill('#hc-shipping-street_0', '1 Total Street');
                    await page.fill('#hc-shipping-postcode', DESTINATION.postcode);
                    await page.fill('#hc-shipping-city', 'Calder');
                    await page.selectOption('#hc-shipping-region_id', { label: DESTINATION.region });
                    await page.fill('#hc-shipping-telephone', '5552293326');
                    await page.locator('#hc-shipping-telephone').blur();
                    await page.waitForFunction(() => document.querySelector('shipping-method-row input:checked') !== null, null, { timeout: 40000 }).catch(() => {});
                    // The order total is final once no request is settling it.
                    await page.waitForFunction(() => {
                        const grand = document.querySelector('summary-totals [data-total^="grand_total"]');
                        return !!grand && !grand.hasAttribute('data-provisional') && grand.getAttribute('aria-busy') !== 'true';
                    }, null, { timeout: 30000 }).catch(() => {});
                    const summaryRows = await page.evaluate(() => [...document.querySelectorAll('summary-totals [data-total]')].map((row) => ({
                        code: row.getAttribute('data-total') ?? '',
                        label: (row.querySelector('dt')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                        value: (row.querySelector('dd')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                    })));
                    const summaryFee = summaryRows.find((row) => row.code === CUSTOM_TOTAL.code);
                    const summaryPlace = place(summaryRows);
                    check(
                        'custom total: the checkout summary lists the same row with the same title and amount',
                        !!summaryFee && !!cartFee && summaryFee.label === cartFee.label && Math.abs(amountOf(summaryFee.value) - amountOf(cartFee.value)) < 0.001,
                        JSON.stringify(summaryRows)
                    );
                    check(
                        'custom total: the row stands at the same place relative to the order total in the cart and in the checkout',
                        summaryPlace.fee !== -1 && cartPlace.fee !== -1 && summaryPlace.distance > 0 && summaryPlace.distance === cartPlace.distance,
                        JSON.stringify({ cart: cartRows.map((row) => row.code), checkout: summaryRows.map((row) => row.code) })
                    );
                    const summarySum = addsUp(summaryRows);
                    if (summarySum === null) console.log('SKIP  custom total: the checkout rows add up to the order total  -- the tax display prints amounts twice, the sum is not checked');
                    else check('custom total: the checkout rows add up to the order total', summarySum, JSON.stringify(summaryRows.map((row) => `${row.code}=${row.value}`)));
                    check('custom total: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
                    await j.ctx.close();
                }
            } finally {
                let removed = { removed: false };
                await restoreAll([
                    ['custom total fixture removed', () => { removed = runFixture('custom-total-fixture.php', '--remove'); }],
                    ['custom total fixture file removed', () => compose('php-fpm', 'rm -f /tmp/custom-total-fixture.php')],
                ]);
                check('custom total: the fixture module is removed and the install compiled again', removed.removed === true, JSON.stringify(removed));
            }
        });
    }

    // ------------------------------------------------------------ guest: the request budget of the estimator (last: it stays spent for the window)
    await block('rate limit', async () => {
        // The effective values (the budget has a default in the module configuration and no row in the database),
        // read through the store's own configuration object.
        const reader = 'require "app/bootstrap.php"; $b = \\Magento\\Framework\\App\\Bootstrap::create(BP, $_SERVER); '
            + 'echo (string) $b->getObjectManager()->get(\\Magento\\Framework\\App\\Config\\ScopeConfigInterface::class)->getValue($argv[1]);';
        const effective = (configPath) => compose('php-fpm', `cd /var/www/html && php -r '${reader}' -- ${configPath}`, 'www-data').trim();
        const budget = Number(effective('hyperion/security/cart_estimate_limit') || 0);
        if (effective('hyperion/security/rate_limit_enabled') === '0' || budget <= 0) {
            console.log('SKIP  rate limit: the rate limiter is off or the estimator has no budget on this store');
            return;
        }
        const j = await newJourney();
        const { page } = j;
        await addToCart(page, u('/joust-duffle-bag.html'));
        await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        await estimate(page);
        check('rate limit: one estimate inside the budget is served', (await readRates(page)).length > 0);
        // More requests than the budget in one window, as htmx would post the form. A few at a time: every request
        // of one visitor waits for the session, and the session store refuses too many waiting at once. A window
        // that ends in the middle of a burst splits it, so a burst is repeated until the answer shows up.
        const burst = (count) => page.evaluate(async (size) => {
            const form = document.querySelector('[data-hyperion-cart-estimate-form]');
            const body = new URLSearchParams(new FormData(form)).toString();
            const post = async () => {
                const response = await fetch(form.getAttribute('hx-post'), {
                    method: 'POST',
                    headers: { 'HX-Request': 'true', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
                    body,
                    credentials: 'same-origin',
                });
                return { status: response.status, retryAfter: response.headers.get('Retry-After') };
            };
            const all = [];
            for (let sent = 0; sent < size; sent += 3) all.push(...await Promise.all(Array.from({ length: Math.min(3, size - sent) }, post)));
            return all;
        }, count);
        const answers = [];
        for (let round = 0; round < 4 && !answers.some((answer) => answer.status === 429); round++) answers.push(...await burst(budget + 5));
        const limited = answers.filter((answer) => answer.status === 429);
        const statuses = answers.reduce((counts, answer) => ({ ...counts, [answer.status]: (counts[answer.status] ?? 0) + 1 }), {});
        check(
            `rate limit: above ${budget} requests in a window the estimator answers 429, the others are served`,
            limited.length > 0 && answers.every((answer) => answer.status === 200 || answer.status === 429) && answers.some((answer) => answer.status === 200),
            JSON.stringify(statuses)
        );
        check(
            'rate limit: the 429 carries Retry-After in whole seconds, no longer than the window',
            limited.length > 0 && limited.every((answer) => /^\d+$/.test(answer.retryAfter ?? '') && Number(answer.retryAfter) >= 1 && Number(answer.retryAfter) <= 10),
            JSON.stringify([...new Set(limited.map((answer) => answer.retryAfter))])
        );
        check('rate limit: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    });
} catch (e) {
    check('script completed', false, firstLine(e));
} finally {
    const failedBefore = results.filter((r) => !r.ok).length;
    await restoreAll([
        ['browser closed', () => browser?.close()],
        ['customer of the run deleted', () => console.log('customer fixture:', JSON.stringify(runFixture('customer-fixture.php', `${CUSTOMER.email} --remove`)))],
        ['customer fixture file removed', () => compose('php-fpm', 'rm -f /tmp/customer-fixture.php')],
        ...Object.entries(previous).map(([configPath, snapshot]) => [`${configPath} restored`, () => restoreConfig(configPath, snapshot)]),
        ['cache flushed', () => magento('cache:flush')],
    ]);
    console.log(results.filter((r) => !r.ok).length === failedBefore ? 'config restored' : 'config NOT fully restored, see the failed restore checks');
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
console.log(`${results.length - failed.length} / ${results.length} passed`);
process.exit(failed.length ? 1 : 0);

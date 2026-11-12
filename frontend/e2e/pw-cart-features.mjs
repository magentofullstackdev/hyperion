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
// Usage: node e2e/pw-cart-features.mjs <baseUrl> <slotDir> [--with-fpt]
//   node e2e/pw-cart-features.mjs https://shop.example <slotDir> --with-fpt
// Toggles the needed store settings for the run (VAT visibility, shipping policy, coupon
// reCAPTCHA v3) and restores them; with --with-fpt it expects the FPT demo attribute to be in place
// (e2e/fixtures/weee-demo.php) and checks the FPT lines. Clear the customer_login reCAPTCHA type for the run beforehand (see docs/development.md),
// as for pw-suite.mjs. Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';

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
const slotDir = path.resolve(slot);
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };
const POLICY = 'Orders placed before noon ship the <b>same day</b>.';
const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
// The simple product whose quantity becomes decimal for the run, and the destination of the estimates.
const DECIMAL = { sku: '24-UG06', path: '/affirm-water-bottle.html', name: 'Affirm Water Bottle' };
const DESTINATION = { country: 'US', region: 'Michigan', postcode: '49628' };

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
// A default-scope setting as stored: no row, a row holding SQL NULL, or a row with a value (read as hex, so any text survives the trip).
const configSnapshot = (p) => {
    const raw = sql(`select if(value is null, 'N', concat('V', hex(value))) from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`);
    if (raw === '') return { state: 'absent', value: null };
    if (raw === 'N') return { state: 'null', value: null };
    return { state: 'value', value: Buffer.from(raw.slice(1), 'hex').toString('utf8') };
};
const configValue = (p) => configSnapshot(p).value;
// Puts a setting back exactly as the snapshot found it: the row removed, SQL NULL, or the stored value byte for byte.
function restoreConfig(p, snapshot) {
    if (snapshot.state === 'absent') {
        sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`);
        return;
    }
    const stored = snapshot.state === 'null' ? 'NULL' : `unhex('${Buffer.from(snapshot.value, 'utf8').toString('hex')}')`;
    sql(`insert into core_config_data (scope, scope_id, path, value) values ('default', 0, '${p}', ${stored}) on duplicate key update value = ${stored}`);
}
const lastJsonLine = (output) => JSON.parse(output.trim().split('\n').pop());
const copyFixture = (name) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', path.join(FIXTURE_DIR, name), `php-fpm:/tmp/${name}`]);
const runFixture = (name, fixtureArgs = '') => lastJsonLine(compose('php-fpm', `cd /var/www/html && php /tmp/${name} /var/www/html ${fixtureArgs}`, 'www-data'));
const previous = Object.fromEntries([
    'customer/create_account/vat_frontend_visibility',
    'shipping/shipping_policy/enable_shipping_policy',
    'shipping/shipping_policy/shipping_policy_content',
    'recaptcha_frontend/type_for/coupon_code',
].map((configPath) => [configPath, configSnapshot(configPath)]));
const firstLine = (e) => String(e?.message ?? e).split('\n')[0];
// Runs one part of the script: an error thrown inside is a failed check of that part, the parts after it still run.
async function block(label, run) {
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
const hasV3Key = configValue('recaptcha_frontend/type_recaptcha_v3/public_key') !== null;

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
async function updateCart(page) {
    await Promise.all([
        page.waitForResponse((r) => r.url().includes('/checkout/cart/updatePost'), { timeout: 30000 }),
        // The cart form also holds the gift message buttons, which submit other forms through their form attribute.
        page.locator('#hyperion-cart-form button[type="submit"]:not([form])').click(),
    ]);
    await page.waitForTimeout(800);
}

try {
    magento('config:set customer/create_account/vat_frontend_visibility 1');
    magento('config:set shipping/shipping_policy/enable_shipping_policy 1');
    magento(`config:set shipping/shipping_policy/shipping_policy_content ${JSON.stringify(POLICY)}`);
    magento('config:set recaptcha_frontend/type_for/coupon_code recaptcha_v3');
    magento('cache:flush');
    console.log(`config set: VAT visible, shipping policy on, coupon reCAPTCHA v3 (${hasV3Key ? 'keys present' : 'NO keys, token checks skipped'})`);

    browser = await chromium.launch({ headless: true, ...launchOptions() });
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
                check(
                    'tax display: the row total of the only line equals the Subtotal row (both including tax)',
                    !!line && line.rowTotal !== '' && line.rowTotal === totals.subtotal
                        && Math.abs(amountOf(line.rowTotal) - amountOf(line.price) * Number(line.qty)) < 0.011,
                    JSON.stringify({ line, totals })
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
                await page.fill(`input[name="${before.qtyName}"]`, '1.5');
                await updateCart(page);
                const saved = await cartLine(page, DECIMAL.name);
                check('decimal quantity: 1.5 is saved and printed without a trailing zero', saved?.qty === '1.5', JSON.stringify(saved));
                await page.fill(`input[name="${other.qtyName}"]`, '2');
                await updateCart(page);
                const survived = await cartLine(page, DECIMAL.name);
                const otherAfter = await cartLine(page, 'Joust Duffle Bag');
                check('decimal quantity: 1.5 survives an update of another line', survived?.qty === '1.5' && otherAfter?.qty === '2', JSON.stringify({ survived, otherAfter }));
                const badge = clean(await page.locator('#hyperion-mini-cart-count').textContent().catch(() => ''));
                const useQty = (configValue('checkout/cart_link/use_qty') ?? '1') !== '0';
                check('decimal quantity: the header count is the sum of the quantities (or the number of lines)', badge === (useQty ? '3.5' : '2'), `badge "${badge}" use_qty ${useQty}`);
                // Leave no decimal quantity behind in the quote before the product is whole-unit again.
                await page.fill(`input[name="${before.qtyName}"]`, '1');
                await updateCart(page);
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
        // A previous run leaves the moved product on the wishlist; the counter must start from a clean one.
        sql(`delete wi from wishlist_item wi join wishlist w on w.wishlist_id = wi.wishlist_id join customer_entity c on c.entity_id = w.customer_id where c.email = '${CUSTOMER.email}'`);
        check('customer: login', await login(page), page.url().replace(base, ''));
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
} catch (e) {
    check('script completed', false, firstLine(e));
} finally {
    const failedBefore = results.filter((r) => !r.ok).length;
    await restoreAll([
        ['browser closed', () => browser?.close()],
        ...Object.entries(previous).map(([configPath, snapshot]) => [`${configPath} restored`, () => restoreConfig(configPath, snapshot)]),
        ['cache flushed', () => magento('cache:flush')],
    ]);
    console.log(results.filter((r) => !r.ok).length === failedBefore ? 'config restored' : 'config NOT fully restored, see the failed restore checks');
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
console.log(`${results.length - failed.length} / ${results.length} passed`);
process.exit(failed.length ? 1 : 0);

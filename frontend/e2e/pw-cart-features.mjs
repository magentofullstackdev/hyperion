#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live checks of the cart features: cart shipping estimator, move to wishlist, VAT field on the
// address form, gift message and shipping policy inside the Lit checkout, FPT display.
// Also the coupon form: translated labels, the coupon_code reCAPTCHA
// rendered inside the form (config switched on for the run), the token in the HTMX body.
// Usage: node e2e/pw-cart-features.mjs <baseUrl> <slotDir> [--with-fpt]
//   node e2e/pw-cart-features.mjs https://shop.example <slotDir> --with-fpt
// Toggles the needed store settings for the run (VAT visibility, shipping policy, coupon
// reCAPTCHA v3) and restores them; with --with-fpt it expects the FPT demo attribute to be in place
// (e2e/fixtures/weee-demo.php) and checks the FPT lines. Clear the customer_login reCAPTCHA type for the run beforehand (see docs/development.md),
// as for pw-suite.mjs. Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
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
const configValue = (p) => { const v = sql(`select value from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`); return v === '' ? null : v; };
function restoreConfig(p, previous) {
    if (previous === null) sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`);
    else magento(`config:set ${p} ${JSON.stringify(previous)}`);
}
const previous = {
    vat: configValue('customer/create_account/vat_frontend_visibility'),
    policyEnabled: configValue('shipping/shipping_policy/enable_shipping_policy'),
    policyContent: configValue('shipping/shipping_policy/shipping_policy_content'),
    couponRecaptcha: configValue('recaptcha_frontend/type_for/coupon_code'),
};
// An install without reCAPTCHA keys: the form must still render, the token checks are skipped.
const hasV3Key = configValue('recaptcha_frontend/type_recaptcha_v3/public_key') !== null;
magento('config:set customer/create_account/vat_frontend_visibility 1');
magento('config:set shipping/shipping_policy/enable_shipping_policy 1');
magento(`config:set shipping/shipping_policy/shipping_policy_content ${JSON.stringify(POLICY)}`);
magento('config:set recaptcha_frontend/type_for/coupon_code recaptcha_v3');
magento('cache:flush');
console.log(`config set: VAT visible, shipping policy on, coupon reCAPTCHA v3 (${hasV3Key ? 'keys present' : 'NO keys, token checks skipped'})`);

const browser = await chromium.launch({ headless: true, ...launchOptions() });

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

try {
    // ------------------------------------------------------------ guest: estimator + FPT
    {
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
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ customer: move to wishlist, VAT, gift message, policy
    {
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
    }
} finally {
    await browser.close();
    restoreConfig('customer/create_account/vat_frontend_visibility', previous.vat);
    restoreConfig('shipping/shipping_policy/enable_shipping_policy', previous.policyEnabled);
    restoreConfig('shipping/shipping_policy/shipping_policy_content', previous.policyContent);
    restoreConfig('recaptcha_frontend/type_for/coupon_code', previous.couponRecaptcha);
    magento('cache:flush');
    console.log('config restored');
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
process.exit(failed.length ? 1 : 0);

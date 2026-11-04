#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the checkout agreements contract.
// Usage: node e2e/pw-agreements.mjs <baseUrl> <slotDir>
//   node e2e/pw-agreements.mjs https://shop.example <slotDir>
// Creates one ACTIVE, MANUAL (checkbox) checkout agreement on the install and enables
// "Enable Terms and Conditions", then places a guest order and a customer order
// (the Luma sample data customer): Place Order must stay disabled until the
// box is ticked, the payment-information request must carry
// paymentMethod.extension_attributes.agreement_ids = [<id>] and Magento must accept
// the order. Everything is restored afterwards (config value and agreement rows).
// Prints PASS / FAIL lines and a JSON summary, exit code 1 on any failure.
// Clear the customer_login reCAPTCHA type for the run beforehand (see docs/development.md),
// as for pw-suite.mjs.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
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
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <slotDir> ...');
    process.exit(2);
}
const slot = args.find((a) => !a.startsWith('http')) ?? '.';
const slotDir = path.resolve(slot);
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };
const AGREEMENT_NAME = 'Hyperion e2e agreement check';

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
const banVarnish = () => { try { compose('varnish', "varnishadm ban 'req.url ~ .'"); } catch { /* no varnish on this install */ } };

function setUp() {
    sql(`delete a, s from checkout_agreement a left join checkout_agreement_store s on s.agreement_id = a.agreement_id where a.name = '${AGREEMENT_NAME}'`);
    sql(`insert into checkout_agreement (name, content, checkbox_text, is_active, is_html, mode) values ('${AGREEMENT_NAME}', 'Terms used by e2e/pw-agreements.mjs. Safe to delete.', 'I agree to the e2e terms', 1, 0, 1)`);
    const id = sql(`select agreement_id from checkout_agreement where name = '${AGREEMENT_NAME}' order by agreement_id desc limit 1`);
    sql(`insert into checkout_agreement_store (agreement_id, store_id) values (${id}, 0)`);
    const previous = sql(`select value from core_config_data where scope = 'default' and scope_id = 0 and path = 'checkout/options/enable_agreements'`);
    magento('config:set checkout/options/enable_agreements 1');
    magento('cache:flush');
    banVarnish();
    return { id: Number(id), previous: previous === '' ? null : previous };
}

function tearDown(state) {
    if (state.previous === null) {
        sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = 'checkout/options/enable_agreements'`);
    } else {
        magento(`config:set checkout/options/enable_agreements ${state.previous}`);
    }
    sql(`delete a, s from checkout_agreement a left join checkout_agreement_store s on s.agreement_id = a.agreement_id where a.name = '${AGREEMENT_NAME}'`);
    magento('cache:flush');
    banVarnish();
}

async function newJourney() {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
    return { ctx, page, problems };
}

async function addToCart(page) {
    await page.goto(base + u('/fusion-backpack.html'), { waitUntil: 'networkidle' });
    await page.click('#product_addtocart_form button[type="submit"]');
    await page.waitForFunction(() => {
        const n = document.querySelector('#hyperion-notification');
        return n && !n.hidden && n.innerText.trim().length > 0;
    }, null, { timeout: 25000 }).catch(() => {});
}

async function fillGuestAddress(page) {
    const fill = async (sel, value) => { const el = page.locator(sel).first(); if (await el.count()) await el.fill(value); };
    await fill('input[type="email"][name="email"], checkout-email input[type="email"]', `agreements.${Date.now()}@example.com`);
    await fill('input[name="firstname"]', 'Agreement');
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
}

async function checkoutWithAgreement(page, label, agreementId) {
    const payloads = [];
    page.on('request', (r) => {
        if (r.method() === 'POST' && /payment-information$/.test(r.url())) {
            try { payloads.push(JSON.parse(r.postData() ?? 'null')); } catch { payloads.push(null); }
        }
    });
    await page.waitForSelector('shipping-method-row', { timeout: 40000 }).catch(() => {});
    await page.waitForSelector('payment-method-row', { timeout: 40000 }).catch(() => {});
    const pay = page.locator('#hc-pay-checkmo');
    if (await pay.count()) await pay.click();
    await page.waitForTimeout(1500);

    const box = page.locator(`#hc-agreement-${agreementId}`);
    check(`${label}: agreement checkbox rendered`, await box.count() === 1);
    const button = page.locator('place-order-button button');
    check(`${label}: Place Order disabled before accepting`, await button.isDisabled().catch(() => false));
    await box.check();
    await page.waitForTimeout(300);
    check(`${label}: Place Order enabled after accepting`, await button.isEnabled().catch(() => false));
    await button.click().catch(() => {});
    await page.waitForURL((u) => u.toString().includes('success'), { timeout: 45000 }).catch(() => {});
    const banner = await page.evaluate(() => (document.querySelector('error-banner') || {}).innerText || '');
    check(`${label}: order placed with the agreement`, page.url().includes('success'), banner || page.url());

    const body = payloads.find((p) => p && p.paymentMethod);
    const ids = body?.paymentMethod?.extension_attributes?.agreement_ids;
    check(`${label}: agreement ids nested in paymentMethod.extension_attributes`,
        Array.isArray(ids) && ids.length === 1 && String(ids[0]) === String(agreementId),
        JSON.stringify(body?.paymentMethod ?? null));
    check(`${label}: no top-level extension_attributes in the payload`, body && !('extension_attributes' in body));
}

const browser = await chromium.launch({ headless: true, ...launchOptions() });
const state = setUp();
console.log(`agreement ${state.id} created on ${slot}, enable_agreements was ${state.previous ?? '(unset)'}`);
try {
    {
        const j = await newJourney();
        await addToCart(j.page);
        await j.page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
        await j.page.waitForSelector('checkout-app, hyperion-checkout', { timeout: 30000 }).catch(() => {});
        await fillGuestAddress(j.page);
        await checkoutWithAgreement(j.page, 'guest', state.id);
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }
    {
        const j = await newJourney();
        const { page } = j;
        await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
        await page.fill('#email', CUSTOMER.email);
        await page.fill('#pass', CUSTOMER.password);
        await page.click('#login-form button[type="submit"]');
        await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
        check('customer: login', !page.url().includes('/login'), page.url().replace(base, ''));
        await addToCart(page);
        await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
        await checkoutWithAgreement(page, 'customer', state.id);
        check('customer: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }
} finally {
    await browser.close();
    tearDown(state);
    console.log('agreement removed, enable_agreements restored');
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
process.exit(failed.length ? 1 : 0);

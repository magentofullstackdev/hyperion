#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the inline checkout login.
// Usage: node e2e/pw-checkout-login.mjs <baseUrl> <slotDir>
// A guest puts a product in the cart, opens the checkout, types the sample
// customer's email, signs in with the inline password field: the page must reload
// as a logged-in customer (storefront session), keep the guest item (quote merged
// by core) and show the saved addresses. Core answers the email check
// only when "Enable Guest Checkout Login" (checkout/options/enable_guest_checkout_login)
// is on: the script turns it on for the run and restores it. Clear the customer_login reCAPTCHA type for the run beforehand (see docs/development.md),
// as for pw-suite.mjs. Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeConfigSnapshot } from './lib/config-snapshot.mjs';

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
const LOGIN_OPTION = 'checkout/options/enable_guest_checkout_login';

function compose(service, cmd, user) {
    const userArgs = user ? ['-u', user] : [];
    return execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...userArgs, service, 'bash', '-c', cmd], { encoding: 'utf8' });
}
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const sql = (query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`).trim();
const { configSnapshot, restoreConfig, describe } = makeConfigSnapshot(sql);
const previousOption = configSnapshot(LOGIN_OPTION);
magento(`config:set ${LOGIN_OPTION} 1`);
magento('cache:flush');
console.log(`${LOGIN_OPTION} set to 1 on ${slot} (was ${describe(previousOption)})`);
function restoreOption() {
    restoreConfig(LOGIN_OPTION, previousOption);
    magento('cache:flush');
    console.log(`${LOGIN_OPTION} restored`);
}
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail).slice(0, 220) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 220) : ''}`);
};

const browser = await chromium.launch({ headless: true, ...launchOptions() });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
const requests = [];
page.on('request', (r) => { if (r.method() === 'POST') requests.push(r.url().replace(base, '')); });

try {
    await page.goto(base + u('/fusion-backpack.html'), { waitUntil: 'networkidle' });
    await page.click('#product_addtocart_form button[type="submit"]');
    await page.waitForFunction(() => {
        const n = document.querySelector('#hyperion-notification');
        return n && !n.hidden && n.innerText.trim().length > 0;
    }, null, { timeout: 25000 }).catch(() => {});

    await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
    await page.waitForSelector('checkout-email input[type="email"]', { timeout: 30000 });
    await page.fill('checkout-email input[type="email"]', CUSTOMER.email);
    await page.locator('checkout-email input[type="email"]').blur();
    await page.waitForSelector('checkout-email input[name="password"]', { timeout: 20000 }).catch(() => {});
    check('existing email reveals the inline password field', await page.locator('checkout-email input[name="password"]').count() === 1);
    await page.fill('checkout-email input[name="password"]', CUSTOMER.password);
    const guestCookie = (await ctx.cookies()).find((c) => c.name === 'PHPSESSID')?.value ?? '';

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {}),
        page.locator('checkout-email hc-button[variant="primary"] button').first().click(),
    ]);
    await page.waitForSelector('checkout-app, hyperion-checkout', { timeout: 30000 }).catch(() => {});

    check('login went through the storefront AJAX controller', requests.some((u) => u.includes('/customer/ajax/login')), requests.filter((u) => u.includes('login')).join(' | '));
    check('no REST token was minted', !requests.some((u) => u.includes('/integration/customer/token')));
    check('the checkout reloaded as a customer (no inline login form)', await page.locator('checkout-email').count() === 0, page.url().replace(base, ''));
    const sessionCookie = (await ctx.cookies()).find((c) => c.name === 'PHPSESSID')?.value ?? '';
    check('the PHP session was renewed by the login', sessionCookie !== '' && sessionCookie !== guestCookie);
    const text = await page.evaluate(() => document.body.innerText);
    check('the guest item survived the quote merge', /Fusion Backpack/i.test(text));
    check('saved addresses of the customer are offered', await page.locator('address-selector').count() > 0);
    await page.goto(base + '/customer/account/', { waitUntil: 'networkidle' });
    check('the storefront session is a customer session', !page.url().includes('/login'), page.url().replace(base, ''));
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
} finally {
    await browser.close();
    restoreOption();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
process.exit(failed.length ? 1 : 0);

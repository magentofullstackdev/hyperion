#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the two anti-abuse mechanisms of the storefront: Magento's image CAPTCHA and Google reCAPTCHA.
// Usage: node e2e/pw-captcha.mjs <baseUrl> <slotDir> [--with-braintree] [--only <phase,...>] [--v3-threshold <score>] [--shots dir]
//        node e2e/pw-captcha.mjs <baseUrl> <slotDir> --restore
//   node e2e/pw-captcha.mjs https://shop.example <slotDir>
// <slotDir> is the Magento install directory (docker compose project with the services php-fpm and db).
//
// Phases (each sets the configuration it needs; --only runs the named ones):
//   image-after-fail     form `user_login` in the default mode: three refused sign-ins bring the field, in the inline
//                        login of the checkout (without a reload) and on the customer login page; a wrong word is
//                        refused with core's message and a new image, the right word signs in
//   image-always         forms `user_login`, `sales_rule_coupon_request` and `payment_processing_request` in the
//                        `always` mode: the login page, the cart coupon and the checkout (inline login, coupon,
//                        Place Order), guest and customer, wrong word and right word
//   recaptcha-invisible  `place_order`, `coupon_code` and `customer_login` as reCAPTCHA v2 invisible with Google's
//                        public test keys: a coupon applies, the inline login signs in, an order is placed, guest
//                        and customer; nothing from Google loads with the page
//   recaptcha-checkbox   the same three as the v2 checkbox (test keys): the box is reserved before the widget, an
//                        order without the tick is stopped with the reason
//   recaptcha-v3         the same three as v3 with the keys of the install, at the score threshold 0.1 for the run
//                        (--v3-threshold sets another one). Google scores a headless browser low: a server side
//                        refusal of a token that WAS sent is reported as SKIPPED with the reason
//   recaptcha-blocked    Google's script cannot be loaded (the request is aborted in the browser): the translated
//                        message, then the same press succeeds without a reload once the script can load
//   recaptcha-shared     the footer newsletter form (v2 invisible) loads Google's script for explicit rendering
//                        first, then Place Order (v3) must still send a token: one script on the page
//   braintree            --with-braintree: the reCAPTCHA form of the Braintree card method on while `place_order`
//                        is off, and both on with different types; a card order through the hosted fields (sandbox
//                        test card) carries the token
//
// The image CAPTCHA is made predictable for the run: `customer/captcha/symbols` is `a` and `length` is `4-4`, so
// the word is always `aaaa`. Every `customer/captcha/*` and `recaptcha_frontend/*` setting (and "Enable Guest
// Checkout Login", which the inline login needs) is snapshotted before the first change, written to a file in the
// temporary directory and put back as it was found (a value, SQL NULL or no row) at the end, when the run is
// interrupted, or later with --restore (which also deletes the customers a killed run left). The reCAPTCHA phases
// need Google's service: the browser loads its script, the store calls its verification.
// e2e/fixtures/captcha-fixture.php empties the attempt log and owns the coupon of the run; the customers of the
// run (e2e/fixtures/customer-fixture.php) are deleted at the end, the orders stay. A leg that depends on Google prints SKIP with the reason when the service does not answer.
// Prints numbered PASS / FAIL / SKIP lines, the matrix and a JSON summary; exit code 1 on any failure, page error
// or HTTP 5xx.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <slotDir> [--with-braintree] [--only <phase,...>] [--v3-threshold <score>] [--shots dir] | --restore');
    process.exit(2);
}
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const slot = args.find((a, i) => !a.startsWith('http') && !a.startsWith('--') && !['--only', '--shots', '--v3-threshold'].includes(args[i - 1])) ?? '.';
const slotDir = path.resolve(slot);
const WITH_BRAINTREE = args.includes('--with-braintree');
const RESTORE_ONLY = args.includes('--restore');
const only = (valueOf('--only') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const V3_THRESHOLD = valueOf('--v3-threshold') ?? '0.1';
if (!/^(0(\.\d+)?|1(\.0+)?)$/.test(V3_THRESHOLD)) {
    console.error('--v3-threshold takes a score between 0 and 1');
    process.exit(2);
}
const shotsDir = valueOf('--shots') ? path.resolve(valueOf('--shots')) : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const RUN = Date.now();
const PASSWORD = 'Captcha-Check-' + String(RUN).slice(-6) + '-aB1';
const COUPON = 'HYPCAPTCHA10';
const WORD = 'aaaa';
const WRONG_WORD = 'zzzz';
// Google's public test keys for reCAPTCHA v2: every token they mint passes the verification.
const TEST_KEYS = { site: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', secret: '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe' };
const TYPE_NAMES = { invisible: 'v2-invisible', recaptcha: 'v2-checkbox', recaptcha_v3: 'v3' };
const ACTIONS = ['place_order', 'coupon_code', 'customer_login'];
const TYPE_FOR = (form) => `recaptcha_frontend/type_for/${form}`;
const LOGIN_OPTION = 'checkout/options/enable_guest_checkout_login';
const V3_THRESHOLD_PATH = 'recaptcha_frontend/type_recaptcha_v3/score_threshold';
const KEY_PATHS = [
    'recaptcha_frontend/type_invisible/public_key', 'recaptcha_frontend/type_invisible/private_key',
    'recaptcha_frontend/type_recaptcha/public_key', 'recaptcha_frontend/type_recaptcha/private_key',
];
// What the run writes; the snapshot also takes every other row of the two sections it finds.
const OWN_PATHS = [
    LOGIN_OPTION, V3_THRESHOLD_PATH, ...KEY_PATHS,
    ...[...ACTIONS, 'braintree', 'newsletter'].map(TYPE_FOR),
    ...['enable', 'forms', 'mode', 'symbols', 'length', 'case_sensitive', 'type', 'failed_attempts_login', 'failed_attempts_ip', 'timeout'].map((k) => `customer/captcha/${k}`),
];
// The state every phase starts from: no image CAPTCHA, no reCAPTCHA on the checkout forms.
const QUIET = {
    [LOGIN_OPTION]: '1',
    'customer/captcha/enable': '0',
    ...Object.fromEntries([...ACTIONS, 'braintree'].map((form) => [TYPE_FOR(form), null])),
};
const IMAGE = {
    'customer/captcha/enable': '1', 'customer/captcha/type': 'default', 'customer/captcha/symbols': 'a', 'customer/captcha/length': '4-4',
    'customer/captcha/case_sensitive': '0', 'customer/captcha/failed_attempts_login': '3', 'customer/captcha/failed_attempts_ip': '1000',
    'customer/captcha/timeout': '7',
};
const MESSAGE = {
    incorrect: 'Incorrect CAPTCHA',
    captchaHint: 'Enter the security code before paying.',
    recaptchaRequired: 'Please confirm you are not a robot.',
    recaptchaFailed: 'The security check could not be completed. Please try again.',
};
const MICHIGAN = { firstname: 'Captcha', lastname: 'Checker', country: 'US', street: '1 Captcha Street', postcode: '49628', city: 'Calder', region: 'Michigan', telephone: '5552293326' };
// Simple products with deep stock; every journey takes the next two, so no line sells out.
const PRODUCTS = [
    '/fusion-backpack.html', '/push-it-messenger-bag.html', '/impulse-duffle.html', '/joust-duffle-bag.html', '/crown-summit-backpack.html',
    '/strive-shoulder-pack.html', '/wayfarer-messenger-bag.html', '/compete-track-tote.html', '/rival-field-messenger.html', '/overnight-duffle.html',
    '/savvy-shoulder-tote.html', '/driven-backpack.html', '/endeavor-daytrip-backpack.html', '/voyage-yoga-bag.html',
];
let productCursor = 0;
const nextProducts = (count = 2) => Array.from({ length: count }, () => PRODUCTS[productCursor++ % PRODUCTS.length]);

const results = [];
const skipped = [];
const matrix = [];
const created = { orders: [], customers: [] };
let phase = '';
const check = (name, ok, detail = '') => {
    const title = `${phase}: ${name}`;
    results.push({ name: title, ok: !!ok, detail: String(detail).slice(0, 320) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(results.length).padStart(3)}  ${title}${detail ? '  -- ' + String(detail).slice(0, 320) : ''}`);
    return !!ok;
};
const skip = (name, reason) => {
    skipped.push(`${phase}: ${name}: ${reason}`);
    console.log(`SKIP       ${phase}: ${name}  -- ${reason}`);
};
/** One cell of the matrix: a form or action, the mechanism, who, and how it ended. */
const cell = (subject, mechanism, who, status, reason = '') => matrix.push({ subject, mechanism, who, status, reason: String(reason).slice(0, 200) });
const verdict = (...oks) => (oks.every(Boolean) ? 'PASS' : 'FAIL');

// ---------------------------------------------------------------- the install
function compose(service, cmd, user) {
    const userArgs = user ? ['-u', user] : [];
    return execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...userArgs, service, 'bash', '-c', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const sql = (query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`).trim();
const { configSnapshot, restoreConfig } = makeConfigSnapshot(sql);
const cleanCache = (fullPage = false) => magento(`cache:clean config${fullPage ? ' full_page block_html' : ''} >/dev/null`);
const hex = (value) => `unhex('${Buffer.from(String(value), 'utf8').toString('hex')}')`;
const writeConfig = (configPath, value) => {
    if (value === null) sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = '${configPath}'`);
    else sql(`insert into core_config_data (scope, scope_id, path, value) values ('default', 0, '${configPath}', ${hex(value)}) on duplicate key update value = ${hex(value)}`);
};
const lastJsonLine = (text) => JSON.parse(text.trim().split('\n').filter((l) => l.startsWith('{')).pop() ?? 'null');
const copyFixture = (name) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', path.join(FIXTURE_DIR, name), `php-fpm:/tmp/${name}`], { stdio: 'ignore' });
const runFixture = (name, fixtureArgs) => lastJsonLine(compose('php-fpm', `cd /var/www/html && php /tmp/${name} /var/www/html ${fixtureArgs}`, 'www-data'));
const clearAttemptLog = () => runFixture('captcha-fixture.php', '--clear-log');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isSecret = (configPath) => /key|secret|password/.test(configPath);

// The snapshot lives in a file from before the first write to after the restore, so a run that was killed can
// still be undone with --restore.
const STATE_FILE = path.join(os.tmpdir(), `hyperion-pw-captcha-${createHash('md5').update(slotDir).digest('hex').slice(0, 10)}.json`);
const sectionRows = () => sql("select path from core_config_data where scope = 'default' and scope_id = 0 and (path like 'customer/captcha/%' or path like 'recaptcha_frontend/%')").split('\n').map((l) => l.trim()).filter(Boolean);
function takeSnapshot() {
    if (existsSync(STATE_FILE)) {
        throw new Error(`${STATE_FILE} exists: an earlier run did not put its settings back. Run this script with --restore first.`);
    }
    const snapshot = {};
    for (const configPath of new Set([...OWN_PATHS, ...sectionRows()])) snapshot[configPath] = configSnapshot(configPath);
    writeFileSync(STATE_FILE, JSON.stringify({ settings: snapshot, customers: [] }, null, 1), { mode: 0o600 });
    return snapshot;
}
/** Puts every setting back as the snapshot file found it, removes the rows the run added, and proves it. */
function restoreSnapshot() {
    if (!existsSync(STATE_FILE)) return true;
    const snapshot = JSON.parse(readFileSync(STATE_FILE, 'utf8')).settings;
    for (const configPath of sectionRows()) if (!(configPath in snapshot)) writeConfig(configPath, null);
    let identical = true;
    console.log('settings put back:');
    for (const [configPath, found] of Object.entries(snapshot)) {
        restoreConfig(configPath, found);
        const now = configSnapshot(configPath);
        const same = now.state === found.state && now.value === found.value;
        identical = identical && same;
        const shown = found.state === 'absent' ? '(no row)' : found.state === 'null' ? '(SQL NULL)' : isSecret(configPath) ? `(stored value, ${found.value.length} characters)` : JSON.stringify(found.value);
        console.log(`  ${same ? 'same' : 'DIFFERENT'}  ${configPath} = ${shown}`);
    }
    cleanCache(true);
    if (identical) unlinkSync(STATE_FILE);
    else console.error(`RESTORE INCOMPLETE: the snapshot stays in ${STATE_FILE}`);
    return identical;
}

if (RESTORE_ONLY) {
    if (!existsSync(STATE_FILE)) {
        console.log(`nothing to restore (${STATE_FILE} does not exist)`);
        process.exit(0);
    }
    const left = JSON.parse(readFileSync(STATE_FILE, 'utf8')).customers ?? [];
    const ok = restoreSnapshot();
    for (const name of ['captcha-fixture.php', 'customer-fixture.php']) copyFixture(name);
    for (const email of left) console.log(`customer ${email}: ${JSON.stringify(runFixture('customer-fixture.php', `${email} --remove`))}`);
    console.log(`fixture: ${JSON.stringify(runFixture('captcha-fixture.php', '--restore'))}`);
    for (const name of ['captcha-fixture.php', 'customer-fixture.php']) compose('php-fpm', `rm -f /tmp/${name}`);
    process.exit(ok ? 0 : 1);
}

let installTouched = false;
let cleanedUp = false;
function cleanup() {
    if (cleanedUp || !installTouched) return true;
    cleanedUp = true;
    let ok;
    try { ok = restoreSnapshot(); } catch (e) { ok = false; console.error(`RESTORE FAILED: ${String(e.message).slice(0, 300)}`); }
    for (const email of created.customers) {
        try { runFixture('customer-fixture.php', `${email} --remove`); } catch (e) { console.error(`customer ${email} not removed: ${String(e.message).slice(0, 120)}`); }
    }
    try { console.log(`fixture: ${JSON.stringify(runFixture('captcha-fixture.php', '--restore'))}`); } catch (e) { ok = false; console.error(`FIXTURE RESTORE FAILED: ${String(e.message).slice(0, 200)}`); }
    for (const name of ['captcha-fixture.php', 'customer-fixture.php']) {
        try { compose('php-fpm', `rm -f /tmp/${name}`); } catch { /* the container is gone */ }
    }
    return ok;
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { console.error(`\n${signal}: restoring the install`); cleanup(); process.exit(130); });
}
for (const event of ['uncaughtException', 'unhandledRejection']) {
    process.on(event, (error) => { console.error(`\n${event}: ${String(error?.stack ?? error).slice(0, 600)}\nrestoring the install`); cleanup(); process.exit(1); });
}

/** Writes the settings of a phase on top of the quiet state. `null` removes the row. */
function configure(values, { fullPage = false } = {}) {
    for (const [configPath, value] of Object.entries({ ...QUIET, ...values })) writeConfig(configPath, value);
    cleanCache(fullPage);
}
let testKeysSet = false;
/** The v2 key fields are stored encrypted, so they go through the command that encrypts them. */
function setTestKeys() {
    if (testKeysSet) return;
    for (const configPath of KEY_PATHS) magento(`config:set ${configPath} ${configPath.endsWith('public_key') ? TEST_KEYS.site : TEST_KEYS.secret} >/dev/null`);
    testKeysSet = true;
}
function createCustomer(tag) {
    const email = `e2e.captcha.${tag}.${RUN}@example.com`;
    const data = runFixture('customer-fixture.php', `${email} '${PASSWORD}' --apply`);
    if (data?.applied !== true) throw new Error(`customer ${email} not created: ${JSON.stringify(data)}`);
    created.customers.push(email);
    // Also in the state file, so --restore can delete the customers of a run that was killed.
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    writeFileSync(STATE_FILE, JSON.stringify({ ...state, customers: created.customers }, null, 1), { mode: 0o600 });
    return { email, password: PASSWORD };
}
const lastOrder = (email) => {
    const row = sql(`select o.entity_id, o.increment_id, o.grand_total, ifnull(o.coupon_code, ''), p.method from sales_order o join sales_order_payment p on p.parent_id = o.entity_id where o.customer_email = '${email}' order by o.entity_id desc limit 1`);
    if (row === '') return null;
    const [id, increment, total, coupon, method] = row.split('\t');
    return { id: Number(id), increment, total: Number(total), coupon: coupon === '' ? null : coupon, method };
};
// What the store answers when Google's verification refuses a token: the REST wording, and the storefront wording
// of the login controller (the default texts of `recaptcha_frontend/failure_messages`).
const REFUSED_BY_GOOGLE = /recaptcha (validation|verification) failed|something went wrong with recaptcha/i;
/** Why a v3 leg is skipped: what the store answered when the verification refused a token that was sent. */
const refusalReason = (sent) => {
    let message = sent.answer;
    try { message = JSON.parse(sent.answer).message ?? message; } catch { /* plain text */ }
    return `Google's verification refused the token of the install's v3 key pair at the score threshold ${V3_THRESHOLD} (the store answered "${String(message).slice(0, 80)}")`;
};
/** Whether Google answers: the script for the browser (from here) and the verification (from the store). */
async function googleAnswers() {
    const reasons = [];
    try {
        const response = await fetch('https://www.google.com/recaptcha/api.js?render=explicit', { signal: AbortSignal.timeout(10000) });
        if (!response.ok) reasons.push(`api.js answered ${response.status}`);
    } catch (e) { reasons.push(`api.js not reachable from this machine (${String(e.message).slice(0, 60)})`); }
    try {
        const status = compose('php-fpm', "curl -s -m 10 -o /dev/null -w '%{http_code}' https://www.google.com/recaptcha/api/siteverify || true").trim();
        if (status !== '200') reasons.push(`siteverify answered ${status || 'nothing'} to the store`);
    } catch (e) { reasons.push(`siteverify not reachable from the store (${String(e.message).slice(0, 60)})`); }
    return reasons;
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch({ headless: true, ...launchOptions() });
const u = makeUrl(await resolveUrlSuffix(base));
const isGoogle = (url) => /^https:\/\/(www\.)?(google\.com|gstatic\.com|recaptcha\.net)\/recaptcha\//.test(url);
const isOrderPost = (r) => r.method() === 'POST' && /\/payment-information(\?|$)/.test(r.url()) && !/set-payment-information/.test(r.url());
const isCouponPut = (r) => r.method() === 'PUT' && /\/coupons\//.test(r.url());
const isLoginPost = (r) => r.method() === 'POST' && /\/customer\/ajax\/login/.test(r.url());

async function newJourney() {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const j = { ctx, page, problems: [], google: [], sent: [], inflight: 0, lastRest: Date.now(), navigations: 0 };
    page.on('pageerror', (e) => {
        // An error thrown by Google's own script inside its widget frame is not an error of the page under test.
        const stack = String(e.stack ?? '');
        const googleOnly = (/Blocked a frame with origin "https:\/\/www\.google\.com"/.test(e.message) || /https:\/\/www\.(gstatic|google)\.com\/recaptcha\//.test(stack)) && !stack.includes(base);
        if (googleOnly) { console.log(`note       an error inside Google's widget frame was left out: ${e.message.slice(0, 90)}`); return; }
        j.problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 140)}`);
    });
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) j.navigations++; });
    page.on('request', (r) => {
        if (isGoogle(r.url())) j.google.push(r.url());
        if (/\/rest\//.test(r.url())) { j.inflight++; j.lastRest = Date.now(); }
        const kind = isOrderPost(r) ? 'order' : isCouponPut(r) ? 'coupon' : isLoginPost(r) ? 'login' : null;
        if (kind === null) return;
        let body = null;
        try { body = JSON.parse(r.postData() ?? 'null'); } catch { /* not JSON */ }
        const headers = r.headers();
        j.sent.push({ kind, url: r.url(), recaptcha: headers['x-recaptcha'] ?? '', captcha: headers['x-captcha'] ?? '', body, status: null, answer: '' });
    });
    page.on('response', async (r) => {
        if (r.status() >= 500) j.problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`);
        const q = r.request();
        if (!(isOrderPost(q) || isCouponPut(q) || isLoginPost(q))) return;
        const entry = [...j.sent].reverse().find((s) => s.url === q.url() && s.status === null);
        if (!entry) return;
        entry.status = r.status();
        entry.answer = (await r.text().catch(() => '')).slice(0, 300);
    });
    const done = (r) => { if (/\/rest\//.test(r.url())) { j.inflight = Math.max(0, j.inflight - 1); j.lastRest = Date.now(); } };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    /** Resolves when no REST request ran for `quiet` ms, counted from this call at the earliest. */
    j.settled = async (quiet = 1700, timeout = 45000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (j.inflight === 0 && Date.now() - Math.max(j.lastRest, start) >= quiet) return true;
            await sleep(150);
        }
        return false;
    };
    j.of = (kind) => j.sent.filter((s) => s.kind === kind);
    /** Waits for the answer of the next request of a kind sent after `mark`; null when none came. */
    j.answered = async (kind, mark, timeout = 45000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const entry = j.of(kind)[mark];
            if (entry && entry.status !== null) { await sleep(400); return entry; }
            await sleep(120);
        }
        return j.of(kind)[mark] ?? null;
    };
    j.close = async () => { await ctx.close().catch(() => {}); };
    return j;
}
async function shot(page, name) {
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true }).catch(() => {});
}
const noProblems = (j, label) => check(`${label}: no page errors / HTTP 5xx`, j.problems.length === 0, j.problems.slice(0, 4).join(' | '));

async function addToCart(page, productPath) {
    await page.goto(base + u(productPath), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#product_addtocart_form button[type="submit"]', { timeout: 30000 });
    await page.waitForFunction(() => window.htmx !== undefined && document.querySelector('#product_addtocart_form input[name="form_key"]')?.value, null, { timeout: 30000 }).catch(() => {});
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/add/.test(r.url()), { timeout: 40000 }).catch(() => null),
        page.click('#product_addtocart_form button[type="submit"]'),
    ]);
    await page.waitForFunction(() => {
        const n = document.querySelector('#hyperion-notification');
        return n && !n.hidden && n.innerText.trim().length > 0;
    }, null, { timeout: 15000 }).catch(() => {});
    if (response === null || response.status() >= 400) throw new Error(`add to cart failed for ${productPath}`);
}
async function fillCart(page, count = 2) {
    for (const productPath of nextProducts(count)) await addToCart(page, productPath);
}
async function openCheckout(j) {
    await j.page.goto(base + '/checkout/', { waitUntil: 'load' });
    await j.page.waitForSelector('checkout-app', { timeout: 40000 });
    await j.page.waitForSelector('[data-hyperion-place-order] button', { timeout: 20000 });
}
async function fillAddress(page, address) {
    const id = (name) => `#hc-shipping-${name}`;
    await page.fill(id('firstname'), address.firstname);
    await page.fill(id('lastname'), address.lastname);
    await page.selectOption(id('country_id'), address.country);
    await page.fill(id('street_0'), address.street);
    await page.fill(id('postcode'), address.postcode);
    await page.fill(id('city'), address.city);
    await page.selectOption(id('region_id'), { label: address.region });
    await page.fill(id('telephone'), address.telephone);
    await page.locator(id('telephone')).blur();
}
const fillEmail = async (page, email) => { await page.fill('#hc-contact-email', email); await page.locator('#hc-contact-email').blur(); };
const waitForRates = (page, timeout = 40000) => page.waitForFunction(() => document.querySelector('shipping-method-list [data-estimate-state="ready"]') !== null
    && document.querySelector('shipping-method-row input:checked') !== null, null, { timeout }).then(() => true, () => false);
const waitForGate = (page, open = true, timeout = 30000) => page.waitForFunction((wanted) => {
    const button = document.querySelector('[data-hyperion-place-order] button');
    return button !== null && (button.getAttribute('aria-disabled') !== 'true' && !button.disabled) === wanted;
}, open, { timeout }).then(() => true, () => false);
async function selectPayment(j, code) {
    await j.page.waitForSelector(`#hc-pay-${code}`, { timeout: 40000 });
    await j.page.check(`#hc-pay-${code}`);
    await j.settled(1200);
}
const visibleErrors = (page) => page.evaluate(() => [...document.querySelectorAll('[data-error-banner], hc-section-status [data-section-status], [data-place-order-hint], [data-hyperion-captcha-error]')]
    .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '));
const readIsland = (page) => page.evaluate(() => {
    try { return JSON.parse(document.querySelector('#checkout-config').textContent); } catch { return null; }
});
// The button of a closed gate is `aria-disabled` and still takes the press (it then names what is missing).
const pressPlaceOrder = (page) => page.locator('[data-hyperion-place-order] button').click({ force: true });
const placeOrderHint = (page) => page.evaluate(() => document.querySelector('[data-place-order-hint]')?.textContent.replace(/\s+/g, ' ').trim() ?? '');

/** A guest at the payment step: cart, email, address, rates. */
async function guestCheckout(j, email) {
    await fillCart(j.page);
    await openCheckout(j);
    await fillEmail(j.page, email);
    await fillAddress(j.page, MICHIGAN);
    if (!(await waitForRates(j.page))) throw new Error('no shipping rates for the typed address');
    await j.settled();
}
/** A guest cart in the checkout with the inline login of `customer` open. */
async function openInlineLogin(j, customer) {
    const { page } = j;
    await fillCart(page);
    await openCheckout(j);
    await page.locator('#hc-contact-email').pressSequentially(customer.email, { delay: 15 });
    await page.locator('#hc-contact-email').blur();
    await page.waitForSelector('checkout-email [data-hyperion-login-open]', { timeout: 25000 });
    await page.locator('checkout-email [data-hyperion-login-open]').click();
    await page.waitForSelector('checkout-email input[name="password"]', { timeout: 20000 });
}
/** Submits the inline login; resolves to the request with its answer. */
async function submitInlineLogin(j, password, word = null) {
    const { page } = j;
    await page.fill('checkout-email input[name="password"]', password);
    if (word !== null) await page.fill('hc-login-captcha [data-hyperion-captcha-input]', word);
    const mark = j.of('login').length;
    await page.locator('checkout-email [data-hyperion-login-form] hc-button[variant="primary"] button').click();
    const sent = await j.answered('login', mark, 30000);
    // A refused login reads the CAPTCHA state again before the form is released.
    await page.waitForFunction(() => document.querySelector('checkout-email [data-hyperion-login-form]')?.getAttribute('aria-busy') !== 'true', null, { timeout: 20000 }).catch(() => {});
    return sent;
}
/** After an accepted inline login the page reloads as the customer. */
async function reloadedAsCustomer(j) {
    const { page } = j;
    await page.waitForFunction(() => document.querySelector('checkout-app') !== null && document.querySelector('checkout-email') === null
        && document.querySelector('[data-hyperion-place-order] button') !== null, null, { timeout: 45000 }).catch(() => {});
    const customer = await page.evaluate(() => document.querySelector('checkout-app') !== null && document.querySelector('checkout-email') === null);
    if (customer) { await waitForRates(page); await j.settled(); }
    return customer;
}
/** The image CAPTCHA field inside `host` (a selector), as the shopper sees it. */
const captchaField = (page, host) => page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const element = root?.matches('hc-captcha, hyperion-captcha') ? root : root?.querySelector('hc-captcha, hyperion-captcha');
    if (!element) return { present: false, src: '', value: '', error: '', sized: false, name: '', defined: false, complete: false, invalid: null };
    const image = element.querySelector('[data-hyperion-captcha-image]');
    const input = element.querySelector('[data-hyperion-captcha-input]');
    return {
        present: true,
        defined: customElements.get(element.localName) !== undefined,
        src: image?.getAttribute('src') ?? '',
        complete: image !== null && image.complete && image.naturalWidth > 0,
        sized: Number(image?.getAttribute('width')) > 0 && Number(image?.getAttribute('height')) > 0,
        value: input?.value ?? '',
        name: input?.getAttribute('name') ?? '',
        invalid: input?.getAttribute('aria-invalid') ?? null,
        error: element.querySelector('[data-hyperion-captcha-error]')?.textContent.trim() ?? '',
    };
}, host);
const waitForCaptcha = async (page, host, timeout = 20000) => {
    await page.waitForFunction((selector) => {
        const root = document.querySelector(selector);
        const element = root?.matches('hc-captcha, hyperion-captcha') ? root : root?.querySelector('hc-captcha, hyperion-captcha');
        const image = element?.querySelector('[data-hyperion-captcha-image]');
        return !!image && !!image.getAttribute('src') && image.complete && image.naturalWidth > 0;
    }, host, { timeout }).catch(() => {});
    return captchaField(page, host);
};
/** Waits for the field to show an image other than `previous` and returns its state. */
const waitForNewImage = async (page, host, previous, timeout = 20000) => {
    await page.waitForFunction(([selector, old]) => {
        const root = document.querySelector(selector);
        const element = root?.matches('hc-captcha, hyperion-captcha') ? root : root?.querySelector('hc-captcha, hyperion-captcha');
        const src = element?.querySelector('[data-hyperion-captcha-image]')?.getAttribute('src') ?? '';
        return src !== '' && src !== old;
    }, [host, previous], { timeout }).catch(() => {});
    return captchaField(page, host);
};

/** After a refused answer: waits for the message at the field and for the new image, then returns the state. */
const afterRefusal = async (page, host, previous, timeout = 20000) => {
    await page.waitForFunction(([selector, old]) => {
        const element = document.querySelector(selector)?.querySelector('hc-captcha, hyperion-captcha');
        const src = element?.querySelector('[data-hyperion-captcha-image]')?.getAttribute('src') ?? '';
        return src !== '' && src !== old && (element.querySelector('[data-hyperion-captcha-error]')?.textContent.trim() ?? '') !== '';
    }, [host, previous], { timeout }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 900));
    return waitForCaptcha(page, host);
};

// ---- checkout coupon
async function openCheckoutCoupon(page) {
    if (await page.locator('coupon-form input[name="coupon_code"]').count() === 0) await page.locator('coupon-form button').first().click();
    await page.waitForSelector('coupon-form input[name="coupon_code"]', { timeout: 15000 });
}
/** Applies the coupon in the checkout; resolves to the PUT with its answer (null when nothing was sent). */
async function applyCheckoutCoupon(j, word = null) {
    const { page } = j;
    await openCheckoutCoupon(page);
    await page.fill('coupon-form input[name="coupon_code"]', COUPON);
    if (word !== null) await page.fill('hc-coupon-captcha [data-hyperion-captcha-input]', word);
    const mark = j.of('coupon').length;
    await page.locator('coupon-form hc-button[variant="primary"] button').click();
    const sent = await j.answered('coupon', mark, word === '' ? 4000 : 40000);
    await j.settled(1500);
    return sent;
}
const appliedCheckoutCoupon = (page) => page.evaluate(() => document.querySelector('coupon-form code')?.textContent.trim() ?? null);

// ---- reCAPTCHA v2 checkbox
/** Google's service gave no answer: the leg cannot be judged, it is skipped with this reason. */
class GoogleSilent extends Error {}
const checkboxBox = (page, action) => page.evaluate((a) => {
    const box = document.querySelector(`[data-hc-recaptcha-checkbox="${a}"]`);
    return box === null ? null : { height: Math.round(box.getBoundingClientRect().height), widget: box.querySelector('iframe') !== null };
}, action);
/** Ticks the visible widget of an action (Google's test keys accept the tick without a challenge). */
async function tickCheckbox(page, action) {
    const frame = page.frameLocator(`[data-hc-recaptcha-checkbox="${action}"] iframe[title="reCAPTCHA"]`);
    const ticked = frame.locator('#recaptcha-anchor[aria-checked="true"]');
    try {
        await frame.locator('#recaptcha-anchor').click({ timeout: 30000 });
        // Google confirms the tick with a request of its own; a second try covers one that got no answer.
        if (!(await ticked.waitFor({ timeout: 25000 }).then(() => true, () => false))) {
            await frame.locator('#recaptcha-anchor').click({ timeout: 10000 }).catch(() => {});
            await ticked.waitFor({ timeout: 25000 });
        }
    } catch (e) {
        throw new GoogleSilent(`Google's widget of ${action} did not confirm the tick (${String(e.message).split('\n')[0].slice(0, 80)})`);
    }
    await sleep(300);
}

/** Presses Place Order and waits for the success page; resolves to the new order of that email, or null. */
async function placeOrder(j, email, label) {
    const before = lastOrder(email)?.id ?? 0;
    await pressPlaceOrder(j.page);
    await j.page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 60000 }).catch(() => {});
    const order = j.page.url().includes('/checkout/onepage/success') ? lastOrder(email) : null;
    const placed = order !== null && order.id > before;
    if (placed) created.orders.push(`${order.increment} (${phase}, ${label}, ${email}, ${order.method}, ${order.total})`);
    else await shot(j.page, `${phase}-order-failed-${label}`);
    return placed ? order : null;
}

// ---- storefront pages
async function loginOnPage(page, customer, word = null) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', customer.email);
    await page.fill('#pass', customer.password);
    if (word !== null) await page.fill('#login-form [data-hyperion-captcha-input]', word);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 40000 }).catch(() => {}),
        page.click('#login-form button[type="submit"]'),
    ]);
    return !page.url().includes('/customer/account/login');
}
const pageMessages = async (page, wanted, timeout = 8000) => {
    await page.waitForFunction((text) => [...document.querySelectorAll('hyperion-messages, #hyperion-notification')].some((e) => e.innerText.includes(text)), wanted, { timeout }).catch(() => {});
    return page.evaluate(() => [...document.querySelectorAll('hyperion-messages, #hyperion-notification')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '));
};

// ---------------------------------------------------------------- phases
const phases = {};

/** The login page: the server rendered field, its Reload button, a wrong word, the right word. */
async function loginPageLeg(customer, mode) {
    const label = 'login page';
    const host = '#login-form';
    const j = await newJourney();
    const { page } = j;
    try {
        await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
        if (mode === 'after_fail') {
            check(`${label}: no CAPTCHA field before any refused sign-in`, !(await captchaField(page, host)).present);
            for (let i = 1; i <= 3; i++) {
                await page.fill('#email', customer.email);
                await page.fill('#pass', `not-the-password-${i}`);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 40000 }).catch(() => {}),
                    page.click('#login-form button[type="submit"]'),
                ]);
            }
        }
        const field = await waitForCaptcha(page, host);
        const markup = await page.evaluate(() => ({
            initBlocks: document.querySelectorAll('#login-form [data-mage-init], #login-form script[type="text/x-magento-init"]').length,
            inForm: document.querySelector('#login-form hyperion-captcha[form-id="user_login"]') !== null,
        }));
        const shown = check(`${label}: the CAPTCHA field is in the login form${mode === 'after_fail' ? ' after three refused sign-ins' : ''} (upgraded element, loaded image with its size, named input, no RequireJS markup)`,
            field.present && field.defined && field.complete && field.sized && field.name === 'captcha[user_login]' && markup.inForm && markup.initBlocks === 0, JSON.stringify({ ...field, src: field.src.slice(-24), ...markup }));
        if (!shown) await shot(page, `${phase}-${label}-field`);

        const [refresh] = await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST' && /\/captcha\/refresh/.test(r.url()), { timeout: 20000 }).catch(() => null),
            page.click('#login-form [data-hyperion-captcha-reload]'),
        ]);
        const reloaded = await waitForNewImage(page, host, field.src);
        const reloadOk = check(`${label}: Reload captcha asks the store for a new image and shows it`, refresh !== null && refresh.status() === 200 && reloaded.src !== '' && reloaded.src !== field.src,
            `refresh ${refresh?.status() ?? 'not sent'}; ${field.src.slice(-20)} -> ${reloaded.src.slice(-20)}`);

        const refused = !(await loginOnPageHere(page, customer, WRONG_WORD));
        const message = await pageMessages(page, MESSAGE.incorrect);
        const after = await waitForCaptcha(page, host);
        const wrongOk = check(`${label}: a wrong word is refused with core's message and a new image`, refused && message.includes(MESSAGE.incorrect) && after.present && after.src !== reloaded.src && after.value === '',
            JSON.stringify({ refused, message, newImage: after.src !== reloaded.src, value: after.value }));
        const signedIn = await loginOnPageHere(page, customer, WORD);
        const rightOk = check(`${label}: the right word signs in`, signedIn, page.url().replace(base, ''));
        cell('user_login, login page', `image, ${mode}`, 'guest to customer', verdict(shown, reloadOk, wrongOk, rightOk));
        noProblems(j, label);
    } catch (e) {
        check(`${label}: the leg ran to its end`, false, String(e?.message ?? e).split('\n')[0]);
        cell('user_login, login page', `image, ${mode}`, 'guest to customer', 'FAIL', 'the leg stopped');
        await shot(page, `${phase}-${label}-stopped`);
    } finally { await j.close(); }
}
/** Submits the login form of the page that is open; true when the customer is signed in. */
async function loginOnPageHere(page, customer, word) {
    await page.fill('#email', customer.email);
    await page.fill('#pass', customer.password);
    await page.fill('#login-form [data-hyperion-captcha-input]', word);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 40000 }).catch(() => {}),
        page.click('#login-form button[type="submit"]'),
    ]);
    return !page.url().includes('/customer/account/login');
}

/** The inline login of the checkout with the image CAPTCHA; resolves to the journey, signed in, or null. */
async function inlineLoginLeg(customer, mode) {
    const label = 'inline login';
    const host = 'hc-login-captcha';
    const j = await newJourney();
    const { page } = j;
    try {
        await openInlineLogin(j, customer);
        await page.evaluate(() => { window.__hyperionSamePage = true; });
        if (mode === 'after_fail') {
            await sleep(800);
            check(`${label}: no CAPTCHA field before any refused sign-in`, !(await captchaField(page, host)).present);
            const answers = [];
            for (let i = 1; i <= 3; i++) {
                const sent = await submitInlineLogin(j, `not-the-password-${i}`);
                answers.push(sent?.answer ?? 'no answer');
                await sleep(700);
            }
            check(`${label}: three wrong passwords are refused`, answers.length === 3 && answers.every((a) => /"errors":\s*true/.test(a)), answers.map((a) => a.slice(0, 60)).join(' | '));
        }
        const field = await waitForCaptcha(page, host);
        const samePage = await page.evaluate(() => window.__hyperionSamePage === true);
        const shown = check(`${label}: the CAPTCHA field is under the password${mode === 'after_fail' ? ' after three refused sign-ins, without a reload' : ' as soon as the form opens'} (loaded image with its size)`,
            field.present && field.complete && field.sized && samePage, JSON.stringify({ ...field, src: field.src.slice(-24), samePage }));
        if (!shown) await shot(page, `${phase}-${label}-field`);
        const alternatives = await page.evaluate(() => ({
            guest: [...document.querySelectorAll('checkout-email [data-hyperion-login-form] hc-button')].length >= 2,
            forgot: document.querySelector('checkout-email [data-hyperion-forgot-password]') !== null,
        }));
        check(`${label}: "Continue as guest" and "Forgot your password?" stay next to the field`, alternatives.guest && alternatives.forgot, JSON.stringify(alternatives));

        const wrong = await submitInlineLogin(j, customer.password, WRONG_WORD);
        const afterWrong = await afterRefusal(page, host, field.src);
        const wrongOk = check(`${label}: a wrong word is refused with core's message next to the field, a new image and an empty input`,
            wrong !== null && wrong.body?.captcha_string === WRONG_WORD && wrong.body?.captcha_form_id === 'user_login' && wrong.answer.includes(MESSAGE.incorrect)
            && afterWrong.error.includes(MESSAGE.incorrect) && afterWrong.src !== field.src && afterWrong.value === '' && await page.locator('checkout-email').count() === 1,
            JSON.stringify({ answer: wrong?.answer.slice(0, 80), sentWord: wrong?.body?.captcha_string, error: afterWrong.error, newImage: afterWrong.src !== field.src, value: afterWrong.value }));
        if (!wrongOk) await shot(page, `${phase}-${label}-wrong-word`);

        await waitForCaptcha(page, host);
        const right = await submitInlineLogin(j, customer.password, WORD);
        const customerNow = await reloadedAsCustomer(j);
        const rightOk = check(`${label}: the right word signs in and the checkout reloads as the customer`, right !== null && !/"errors":\s*true/.test(right.answer) && customerNow,
            `${right?.answer.slice(0, 80)}; ${await visibleErrors(page)}`);
        cell('user_login, checkout', `image, ${mode}`, 'guest to customer', verdict(shown, wrongOk, rightOk));
        if (!rightOk) { await shot(page, `${phase}-${label}-right-word`); noProblems(j, label); await j.close(); return null; }
        return j;
    } catch (e) {
        check(`${label}: the leg ran to its end`, false, String(e?.message ?? e).split('\n')[0]);
        cell('user_login, checkout', `image, ${mode}`, 'guest to customer', 'FAIL', 'the leg stopped');
        await shot(page, `${phase}-${label}-stopped`);
        await j.close();
        return null;
    }
}

/** The coupon form and Place Order of the checkout with the image CAPTCHA in the `always` mode. */
async function checkoutImageLeg(j, who, email) {
    const { page } = j;
    // ---- coupon
    try {
        await openCheckoutCoupon(page);
        const host = 'hc-coupon-captcha';
        const field = await waitForCaptcha(page, host);
        const shown = check(`checkout coupon (${who}): the CAPTCHA field is inside the coupon form (loaded image with its size)`, field.present && field.complete && field.sized, JSON.stringify({ ...field, src: field.src.slice(-24) }));
        const wrong = await applyCheckoutCoupon(j, WRONG_WORD);
        const afterWrong = await afterRefusal(page, host, field.src, 8000);
        const formText = await page.evaluate(() => document.querySelector('coupon-form')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
        const refusedOk = check(`checkout coupon (${who}): a wrong word is refused with core's message in the coupon form, a new image and an empty input`,
            wrong !== null && wrong.captcha === WRONG_WORD && wrong.status >= 400 && wrong.status < 500 && formText.includes(MESSAGE.incorrect) && afterWrong.src !== field.src && afterWrong.value === ''
            && (await appliedCheckoutCoupon(page)) === null,
            JSON.stringify({ status: wrong?.status, sentWord: wrong?.captcha, answer: wrong?.answer.slice(0, 80), newImage: afterWrong.src !== field.src, value: afterWrong.value }));
        // The word was wrong, not the code: the message belongs to the CAPTCHA field and the code field stays valid.
        const codeInvalid = await page.evaluate(() => document.querySelector('coupon-form input[name="coupon_code"]')?.getAttribute('aria-invalid') === 'true');
        const placedOk = check(`checkout coupon (${who}): the refusal of the word shows next to the CAPTCHA field, not as an error of the code`,
            afterWrong.error.includes(MESSAGE.incorrect) && !codeInvalid, JSON.stringify({ atCaptchaField: afterWrong.error, codeFieldInvalid: codeInvalid, formText: formText.slice(0, 160) }));
        const wrongOk = refusedOk && placedOk;
        if (!wrongOk) await shot(page, `${phase}-checkout-coupon-${who}-wrong-word`);
        await waitForCaptcha(page, host);
        const right = await applyCheckoutCoupon(j, WORD);
        const rightOk = check(`checkout coupon (${who}): the right word applies the coupon`, right !== null && right.captcha === WORD && right.status === 200 && (await appliedCheckoutCoupon(page)) === COUPON,
            JSON.stringify({ status: right?.status, applied: await appliedCheckoutCoupon(page), errors: await visibleErrors(page) }));
        if (!rightOk) await shot(page, `${phase}-checkout-coupon-${who}-right-word`);
        cell('sales_rule_coupon_request, checkout', 'image, always', who, verdict(shown, wrongOk, rightOk));
    } catch (e) {
        check(`checkout coupon (${who}): the leg ran to its end`, false, String(e?.message ?? e).split('\n')[0]);
        cell('sales_rule_coupon_request, checkout', 'image, always', who, 'FAIL', 'the leg stopped');
        await shot(page, `${phase}-checkout-coupon-${who}-stopped`);
    }
    // ---- Place Order
    try {
        const host = 'hc-order-captcha';
        await selectPayment(j, 'checkmo');
        const field = await waitForCaptcha(page, host);
        const shown = check(`place order (${who}): the CAPTCHA field is above Place Order (loaded image with its size)`, field.present && field.complete && field.sized, JSON.stringify({ ...field, src: field.src.slice(-24) }));
        const ordersBefore = j.of('order').length;
        await pressPlaceOrder(page);
        await sleep(1200);
        const hint = await placeOrderHint(page);
        const emptyOk = check(`place order (${who}): without an answer nothing is sent and the reason is shown`, j.of('order').length === ordersBefore && hint === MESSAGE.captchaHint, `hint "${hint}", ${j.of('order').length - ordersBefore} order requests`);

        await page.fill(`${host} [data-hyperion-captcha-input]`, WRONG_WORD);
        await waitForGate(page);
        const mark = j.of('order').length;
        await pressPlaceOrder(page);
        const wrong = await j.answered('order', mark);
        const afterWrong = await afterRefusal(page, host, field.src);
        const wrongOk = check(`place order (${who}): a wrong word is refused with core's message next to the field, a new image and an empty input`,
            // the status of the refusal depends on the platform version: a validation error or the rate limiter's status
            wrong !== null && wrong.captcha === WRONG_WORD && [400, 429].includes(wrong.status) && wrong.answer.includes(MESSAGE.incorrect) && afterWrong.error.includes(MESSAGE.incorrect)
            && afterWrong.src !== field.src && afterWrong.value === '' && !page.url().includes('/success'),
            JSON.stringify({ status: wrong?.status, sentWord: wrong?.captcha, answer: wrong?.answer.slice(0, 80), error: afterWrong.error, newImage: afterWrong.src !== field.src, value: afterWrong.value, shown: await visibleErrors(page) }));
        if (!wrongOk) await shot(page, `${phase}-place-order-${who}-wrong-word`);

        await waitForCaptcha(page, host);
        await page.fill(`${host} [data-hyperion-captcha-input]`, WORD);
        const open = await waitForGate(page);
        const order = await placeOrder(j, email, who);
        const sentWord = j.of('order').at(-1)?.captcha ?? '';
        const rightOk = check(`place order (${who}): the right word places the order`, open && order !== null && sentWord === WORD,
            order ? `order ${order.increment}, total ${order.total}, coupon ${order.coupon}` : `${page.url().replace(base, '')} ${await visibleErrors(page)}`);
        cell('payment_processing_request', 'image, always', who, verdict(shown, emptyOk, wrongOk, rightOk));
    } catch (e) {
        check(`place order (${who}): the leg ran to its end`, false, String(e?.message ?? e).split('\n')[0]);
        cell('payment_processing_request', 'image, always', who, 'FAIL', 'the leg stopped');
        await shot(page, `${phase}-place-order-${who}-stopped`);
    }
}

/** The coupon form of the cart page with the image CAPTCHA. */
async function cartCouponLeg(who, customer) {
    const label = `cart coupon (${who})`;
    const host = 'hyperion-coupon-form form[data-hyperion-coupon-form]';
    const j = await newJourney();
    const { page } = j;
    const openForm = async () => {
        await page.waitForSelector('hyperion-coupon-form form[data-hyperion-coupon-form]', { state: 'attached', timeout: 30000 });
        if (!(await page.locator(`${host} input[name="coupon_code"]`).isVisible().catch(() => false))) {
            await page.locator('hyperion-coupon-form summary').first().click();
        }
        await page.waitForSelector(`${host} input[name="coupon_code"]`, { state: 'visible', timeout: 15000 });
    };
    const submit = async (word) => {
        await page.fill(`${host} input[name="coupon_code"]`, COUPON);
        await page.fill(`${host} [data-hyperion-captcha-input]`, word);
        const [response] = await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/couponPost/.test(r.url()), { timeout: 40000 }).catch(() => null),
            page.click(`${host} button[type="submit"]`),
        ]);
        await page.waitForLoadState('networkidle').catch(() => {});
        await sleep(600);
        return response;
    };
    const formState = () => page.evaluate(() => {
        const element = document.querySelector('hyperion-coupon-form');
        const input = element?.querySelector('form[data-hyperion-coupon-form] input[name="coupon_code"]');
        return {
            applied: element?.getAttribute('applied-coupon') ?? '',
            code: input?.value ?? null,
            error: element?.querySelector('[data-hyperion-coupon-error]')?.textContent.trim() ?? '',
            toast: document.querySelector('#hyperion-notification')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
            fields: document.querySelectorAll('hyperion-coupon-form form[data-hyperion-coupon-form] hyperion-captcha[form-id="sales_rule_coupon_request"]').length,
            discount: document.querySelector('[data-hyperion-cart-totals] [data-total="discount"]') !== null,
        };
    });
    try {
        if (customer) {
            if (!(await loginOnPage(page, customer, WORD))) throw new Error('the customer could not sign in on the login page');
        }
        await addToCart(page, nextProducts(1)[0]);
        await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        await openForm();
        const field = await waitForCaptcha(page, host);
        const state = await formState();
        const shown = check(`${label}: the CAPTCHA field is inside the coupon form, once (upgraded element, loaded image with its size, named input)`,
            field.present && field.defined && field.complete && field.sized && field.name === 'captcha[sales_rule_coupon_request]' && state.fields === 1, JSON.stringify({ ...field, src: field.src.slice(-24), fields: state.fields }));
        if (!shown) await shot(page, `${phase}-${label}-field`);

        const [refresh] = await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST' && /\/captcha\/refresh/.test(r.url()), { timeout: 20000 }).catch(() => null),
            page.click(`${host} [data-hyperion-captcha-reload]`),
        ]);
        const reloaded = await waitForNewImage(page, host, field.src);
        const reloadOk = check(`${label}: Reload captcha shows a new image`, refresh !== null && refresh.status() === 200 && reloaded.src !== field.src, `refresh ${refresh?.status() ?? 'not sent'}`);

        const wrongAnswer = await submit(WRONG_WORD);
        await openForm().catch(() => {});
        const afterWrong = await waitForCaptcha(page, host);
        const wrongState = await formState();
        const wrongOk = check(`${label}: a wrong word is refused with core's message in the form, the code kept, a new image and an empty input`,
            wrongAnswer !== null && wrongState.applied === '' && !wrongState.discount && wrongState.error.includes(MESSAGE.incorrect) && wrongState.code === COUPON
            && afterWrong.present && afterWrong.src !== reloaded.src && afterWrong.value === '' && wrongState.fields === 1,
            JSON.stringify({ status: wrongAnswer?.status(), ...wrongState, newImage: afterWrong.src !== reloaded.src, value: afterWrong.value }));
        if (!wrongOk) await shot(page, `${phase}-${label}-wrong-word`);

        const rightAnswer = await submit(WORD);
        const rightState = await formState();
        const rightOk = check(`${label}: the right word applies the coupon`, rightAnswer !== null && rightState.applied === COUPON && rightState.discount, JSON.stringify({ status: rightAnswer?.status(), ...rightState }));
        if (!rightOk) await shot(page, `${phase}-${label}-right-word`);
        cell('sales_rule_coupon_request, cart page', 'image, always', who, verdict(shown, reloadOk, wrongOk, rightOk));
        noProblems(j, label);
    } catch (e) {
        check(`${label}: the leg ran to its end`, false, String(e?.message ?? e).split('\n')[0]);
        cell('sales_rule_coupon_request, cart page', 'image, always', who, 'FAIL', 'the leg stopped');
        await shot(page, `${phase}-${label}-stopped`);
    } finally { await j.close(); }
}

phases['image-after-fail'] = async () => {
    configure({ ...IMAGE, 'customer/captcha/forms': 'user_login', 'customer/captcha/mode': 'after_fail' });
    clearAttemptLog();
    const j = await inlineLoginLeg(createCustomer('afterfail.checkout'), 'after_fail');
    if (j) { noProblems(j, 'inline login'); await j.close(); }
    clearAttemptLog();
    await loginPageLeg(createCustomer('afterfail.page'), 'after_fail');
    clearAttemptLog();
};

phases['image-always'] = async () => {
    configure({ ...IMAGE, 'customer/captcha/forms': 'user_login,sales_rule_coupon_request,payment_processing_request', 'customer/captcha/mode': 'always' });
    clearAttemptLog();
    await loginPageLeg(createCustomer('always.page'), 'always');
    await cartCouponLeg('guest', null);
    await cartCouponLeg('customer', createCustomer('always.cart'));
    {
        const j = await newJourney();
        try {
            const email = `e2e.captcha.always.guest.${RUN}@example.com`;
            const island = await (async () => { await guestCheckout(j, email); return readIsland(j.page); })();
            const forms = island?.hyperion?.captcha?.forms ?? {};
            check('the checkout configuration marks the three forms as required', ['user_login', 'sales_rule_coupon_request', 'payment_processing_request'].every((id) => forms[id]?.isRequired === true),
                JSON.stringify(Object.fromEntries(Object.entries(forms).map(([id, f]) => [id, f.isRequired]))));
            await checkoutImageLeg(j, 'guest', email);
            noProblems(j, 'guest checkout');
        } catch (e) {
            check('guest checkout: the journey ran to its end', false, String(e?.message ?? e).split('\n')[0]);
        } finally { await j.close(); }
    }
    {
        const customer = createCustomer('always.checkout');
        const j = await inlineLoginLeg(customer, 'always');
        if (j) {
            try {
                await checkoutImageLeg(j, 'customer', customer.email);
                noProblems(j, 'customer checkout');
            } finally { await j.close(); }
        } else {
            for (const subject of ['sales_rule_coupon_request, checkout', 'payment_processing_request']) cell(subject, 'image, always', 'customer', 'FAIL', 'the inline login did not sign in');
        }
    }
    clearAttemptLog();
};

/**
 * One journey with the three actions on one reCAPTCHA type: a guest who applies a coupon and orders, or a guest
 * who signs in inline and then does the same as the customer.
 */
async function recaptchaJourney(type, who, customer) {
    const name = TYPE_NAMES[type];
    const j = await newJourney();
    const { page } = j;
    const email = customer?.email ?? `e2e.captcha.${type}.guest.${RUN}@example.com`;
    const isV3 = type === 'recaptcha_v3';
    // A v3 token that was sent and refused by the verification is the score of a headless browser, not a defect.
    const refusedByScore = (sent) => isV3 && sent !== null && REFUSED_BY_GOOGLE.test(sent.answer);
    const outcome = (action, actor, sent, tokenOk, doneOk) => {
        if (tokenOk && !doneOk && refusedByScore(sent)) {
            const reason = `the token was sent (${action === 'customer_login' ? 'request body' : 'X-ReCaptcha'}); ${refusalReason(sent)}`;
            skip(`${action} (${actor}), ${name}: accepted by the store`, reason);
            cell(action, `reCAPTCHA ${name}`, actor, 'SKIPPED', reason);
            return false;
        }
        cell(action, `reCAPTCHA ${name}`, actor, verdict(tokenOk, doneOk));
        return doneOk;
    };
    try {
        await fillCart(page);
        await openCheckout(j);
        await sleep(2500);
        check(`${who}: nothing from Google loads with the checkout page`, j.google.length === 0, j.google.slice(0, 2).join(' '));
        const island = await readIsland(page);
        const configured = island?.hyperion?.recaptcha ?? {};
        const expected = ACTIONS.every((action) => configured[action]?.type === name && (isV3 || configured[action]?.siteKey === TEST_KEYS.site));
        check(`${who}: the checkout configuration carries the three actions as ${name}`, expected, JSON.stringify(Object.fromEntries(ACTIONS.map((a) => [a, configured[a]?.type ?? null]))));
        if (!expected) throw new Error('the reCAPTCHA configuration did not reach the checkout');

        if (who === 'customer') {
            await page.locator('#hc-contact-email').pressSequentially(customer.email, { delay: 15 });
            await page.locator('#hc-contact-email').blur();
            await page.waitForSelector('checkout-email [data-hyperion-login-open]', { timeout: 25000 });
            await page.locator('checkout-email [data-hyperion-login-open]').click();
            await page.waitForSelector('checkout-email input[name="password"]', { timeout: 20000 });
            if (type === 'recaptcha') {
                const box = await checkboxBox(page, 'customer_login');
                check('customer: the login form reserves the box of the checkbox (78 px) before the widget', box !== null && box.height >= 78, JSON.stringify(box));
                await tickCheckbox(page, 'customer_login');
            }
            const sent = await submitInlineLogin(j, customer.password);
            const token = String(sent?.body?.['g-recaptcha-response'] ?? '');
            const tokenOk = check(`customer_login, ${name}: the sign-in request carries the token`, token.length > 20, `token length ${token.length}`);
            // The page reloads on an accepted login, so its answer may no longer be readable.
            const signedIn = sent !== null && !/"errors":\s*true/.test(sent.answer) && await reloadedAsCustomer(j);
            if (!outcome('customer_login', 'guest to customer', sent, tokenOk, signedIn)) {
                if (!refusedByScore(sent)) check(`customer_login, ${name}: the inline login signs in`, false, `${sent?.answer.slice(0, 120)} ${await visibleErrors(page)}`);
                for (const action of ['coupon_code', 'place_order']) cell(action, `reCAPTCHA ${name}`, 'customer', refusedByScore(sent) ? 'SKIPPED' : 'FAIL', 'no customer session: the inline login was refused');
                await shot(page, `${phase}-customer-login`);
                return;
            }
            check(`customer_login, ${name}: the inline login signs in`, true);
        } else {
            await fillEmail(page, email);
            await fillAddress(page, MICHIGAN);
            if (!(await waitForRates(page))) throw new Error('no shipping rates');
            await j.settled();
        }

        // ---- coupon
        await openCheckoutCoupon(page);
        if (type === 'recaptcha') {
            const box = await checkboxBox(page, 'coupon_code');
            check(`${who}: the coupon form reserves the box of the checkbox (78 px)`, box !== null && box.height >= 78, JSON.stringify(box));
            await tickCheckbox(page, 'coupon_code');
        }
        const coupon = await applyCheckoutCoupon(j);
        const couponToken = check(`coupon_code (${who}), ${name}: the coupon request carries the token header`, coupon !== null && coupon.recaptcha.length > 20, `token length ${coupon?.recaptcha.length ?? 'no request'}`);
        const couponApplied = coupon !== null && coupon.status === 200 && (await appliedCheckoutCoupon(page)) === COUPON;
        if (outcome('coupon_code', who, coupon, couponToken, couponApplied) || !refusedByScore(coupon)) {
            check(`coupon_code (${who}), ${name}: the coupon applies`, couponApplied, JSON.stringify({ status: coupon?.status, answer: coupon?.answer.slice(0, 100), applied: await appliedCheckoutCoupon(page) }));
        }

        // ---- order
        await selectPayment(j, 'checkmo');
        if (type === 'recaptcha') {
            const box = await checkboxBox(page, 'place_order');
            check(`${who}: the order reserves the box of the checkbox (78 px)`, box !== null && box.height >= 78, JSON.stringify(box));
            const before = j.of('order').length;
            await pressPlaceOrder(page);
            await sleep(1200);
            const hint = await placeOrderHint(page);
            check(`place_order (${who}), ${name}: without the tick nothing is sent and the reason is shown`, j.of('order').length === before && hint === MESSAGE.recaptchaRequired, `hint "${hint}"`);
            await tickCheckbox(page, 'place_order');
        }
        await waitForGate(page);
        const order = await placeOrder(j, email, `${who} ${name}`);
        const orderPost = j.of('order').at(-1) ?? null;
        const orderToken = check(`place_order (${who}), ${name}: the order request carries the token header`, orderPost !== null && orderPost.recaptcha.length > 20, `token length ${orderPost?.recaptcha.length ?? 'no request'}`);
        if (outcome('place_order', who, orderPost, orderToken, order !== null) || !refusedByScore(orderPost)) {
            check(`place_order (${who}), ${name}: the order is placed`, order !== null, order ? `order ${order.increment}, total ${order.total}, coupon ${order.coupon}` : `${orderPost?.answer.slice(0, 100)} ${await visibleErrors(page)}`);
        }
        noProblems(j, `${who}, ${name}`);
    } catch (e) {
        const silent = e instanceof GoogleSilent;
        if (silent) skip(`${who}, ${name}: the rest of the journey`, e.message);
        else check(`${who}, ${name}: the journey ran to its end`, false, String(e?.message ?? e).split('\n')[0]);
        await shot(page, `${phase}-${who}-stopped`);
        const done = new Set(matrix.filter((m) => m.mechanism === `reCAPTCHA ${name}` && (m.who === who || (who === 'customer' && m.who === 'guest to customer'))).map((m) => m.subject));
        for (const action of who === 'customer' ? ACTIONS : ['coupon_code', 'place_order']) {
            if (!done.has(action)) cell(action, `reCAPTCHA ${name}`, action === 'customer_login' ? 'guest to customer' : who, silent ? 'SKIPPED' : 'FAIL', silent ? e.message : 'the journey stopped');
        }
    } finally { await j.close(); }
}

async function recaptchaPhase(type) {
    const down = await googleAnswers();
    if (down.length > 0) {
        skip(`${TYPE_NAMES[type]}: every leg`, `Google's reCAPTCHA service does not answer: ${down.join('; ')}`);
        for (const action of ACTIONS) for (const who of action === 'customer_login' ? ['guest to customer'] : ['guest', 'customer']) cell(action, `reCAPTCHA ${TYPE_NAMES[type]}`, who, 'SKIPPED', down.join('; '));
        return;
    }
    if (type === 'recaptcha_v3' && configSnapshot('recaptcha_frontend/type_recaptcha_v3/public_key').value === null) {
        skip('v3: every leg', 'the install has no reCAPTCHA v3 keys');
        for (const action of ACTIONS) for (const who of action === 'customer_login' ? ['guest to customer'] : ['guest', 'customer']) cell(action, 'reCAPTCHA v3', who, 'SKIPPED', 'the install has no reCAPTCHA v3 keys');
        return;
    }
    if (type !== 'recaptcha_v3') setTestKeys();
    configure({ ...Object.fromEntries(ACTIONS.map((action) => [TYPE_FOR(action), type])), ...(type === 'recaptcha_v3' ? { [V3_THRESHOLD_PATH]: V3_THRESHOLD } : {}) });
    await recaptchaJourney(type, 'guest', null);
    await recaptchaJourney(type, 'customer', createCustomer(`${type}.customer`));
}
phases['recaptcha-invisible'] = () => recaptchaPhase('invisible');
phases['recaptcha-checkbox'] = () => recaptchaPhase('recaptcha');
phases['recaptcha-v3'] = () => recaptchaPhase('recaptcha_v3');

phases['recaptcha-blocked'] = async () => {
    const down = await googleAnswers();
    if (down.length > 0) {
        skip('the retry after a blocked script', `Google's reCAPTCHA service does not answer: ${down.join('; ')}`);
        cell('place_order, script blocked then allowed', 'reCAPTCHA v2-invisible', 'guest', 'SKIPPED', down.join('; '));
        return;
    }
    setTestKeys();
    configure({ [TYPE_FOR('place_order')]: 'invisible' });
    const j = await newJourney();
    const { page } = j;
    try {
        const email = `e2e.captcha.blocked.${RUN}@example.com`;
        const blocked = [];
        const block = (route) => { blocked.push(route.request().url()); return route.abort('failed'); };
        await page.route(/\/recaptcha\/api\.js/, block);
        await guestCheckout(j, email);
        await selectPayment(j, 'checkmo');
        await waitForGate(page);
        const navigations = j.navigations;
        await pressPlaceOrder(page);
        await page.waitForFunction((text) => document.body.innerText.includes(text), MESSAGE.recaptchaFailed, { timeout: 30000 }).catch(() => {});
        const shownText = await visibleErrors(page);
        const translation = (await readIsland(page))?.hyperion?.translations?.[MESSAGE.recaptchaFailed] ?? MESSAGE.recaptchaFailed;
        const messageOk = check('with Google\'s script blocked Place Order shows the translated message and sends no order', blocked.length > 0 && shownText.includes(translation) && j.of('order').length === 0
            && !/failed to fetch|networkerror|undefined/i.test(shownText), JSON.stringify({ blocked: blocked.length, shownText, orders: j.of('order').length }));
        if (!messageOk) await shot(page, `${phase}-message`);
        const usable = check('the press is released: Place Order is usable again', await waitForGate(page, true, 15000));
        await page.unroute(/\/recaptcha\/api\.js/, block);
        const order = await placeOrder(j, email, 'retry');
        const retryOk = check('once the script can load the same press places the order, without a reload', order !== null && j.of('order').length === 1 && j.of('order')[0].recaptcha.length > 20 && j.navigations === navigations + 1,
            JSON.stringify({ order: order?.increment ?? null, orderRequests: j.of('order').length, token: j.of('order')[0]?.recaptcha.length ?? 0, navigations: j.navigations - navigations, errors: order ? '' : await visibleErrors(page) }));
        cell('place_order, script blocked then allowed', 'reCAPTCHA v2-invisible', 'guest', verdict(messageOk, usable, retryOk));
        // The aborted script is the injected fault; nothing else may have gone wrong.
        noProblems(j, 'guest');
    } catch (e) {
        check('the journey ran to its end', false, String(e?.message ?? e).split('\n')[0]);
        cell('place_order, script blocked then allowed', 'reCAPTCHA v2-invisible', 'guest', 'FAIL', 'the journey stopped');
        await shot(page, `${phase}-stopped`);
    } finally { await j.close(); }
};

phases['recaptcha-shared'] = async () => {
    const subject = 'place_order v3 after the newsletter form (v2) loaded the script';
    const down = await googleAnswers();
    const noKeys = configSnapshot('recaptcha_frontend/type_recaptcha_v3/public_key').value === null;
    if (down.length > 0 || noKeys) {
        const reason = noKeys ? 'the install has no reCAPTCHA v3 keys' : `Google's reCAPTCHA service does not answer: ${down.join('; ')}`;
        skip('the shared script', reason);
        cell(subject, 'reCAPTCHA v3 + v2-invisible', 'guest', 'SKIPPED', reason);
        return;
    }
    setTestKeys();
    const newsletterFound = configSnapshot(TYPE_FOR('newsletter'));
    configure({ [TYPE_FOR('newsletter')]: 'invisible', [TYPE_FOR('place_order')]: 'recaptcha_v3', [V3_THRESHOLD_PATH]: V3_THRESHOLD }, { fullPage: true });
    const j = await newJourney();
    const { page } = j;
    try {
        const email = `e2e.captcha.shared.${RUN}@example.com`;
        const scripts = [];
        page.on('request', (r) => { if (/\/recaptcha\/api\.js/.test(r.url())) scripts.push(new URL(r.url()).searchParams.get('render') === 'explicit' ? 'explicit' : 'with a site key'); });
        await guestCheckout(j, email);
        await selectPayment(j, 'checkmo');
        const newsletter = await page.evaluate(() => {
            const element = document.querySelector('#newsletter-validate-detail hyperion-recaptcha, footer hyperion-recaptcha');
            return element === null ? null : { type: element.getAttribute('type'), size: element.getAttribute('size') };
        });
        if (newsletter === null) throw new Error('the footer newsletter form carries no <hyperion-recaptcha> on the checkout page');
        const field = page.locator('#newsletter-validate-detail input[type="email"]').first();
        await field.scrollIntoViewIfNeeded();
        await field.click();
        await field.pressSequentially('shared.script@example.com', { delay: 15 });
        await page.waitForFunction(() => typeof window.grecaptcha?.render === 'function', null, { timeout: 20000 }).catch(() => {});
        const first = check('the newsletter form loads Google\'s script for explicit rendering first', scripts.length === 1 && scripts[0] === 'explicit', `${JSON.stringify(newsletter)}; scripts: ${scripts.join(', ')}`);
        await waitForGate(page);
        const order = await placeOrder(j, email, 'shared script');
        const post = j.of('order').at(-1) ?? null;
        const shownText = order ? '' : await visibleErrors(page);
        const tokenOk = check('Place Order (v3) still sends a token, with one script on the page and no site key error', post !== null && post.recaptcha.length > 20 && scripts.length === 1 && !/invalid site key/i.test(shownText),
            JSON.stringify({ token: post?.recaptcha.length ?? 'no order request', scripts, shownText }));
        if (order === null && tokenOk && REFUSED_BY_GOOGLE.test(post?.answer ?? '')) {
            const reason = `the token was sent; ${refusalReason(post)}`;
            skip('the order after the shared script is placed', reason);
            cell(subject, 'reCAPTCHA v3 + v2-invisible', 'guest', first ? 'PASS (token); order SKIPPED' : 'FAIL', reason);
        } else {
            const placed = check('the order is placed', order !== null, order ? `order ${order.increment}` : `${post?.answer.slice(0, 100)} ${shownText}`);
            cell(subject, 'reCAPTCHA v3 + v2-invisible', 'guest', verdict(first, tokenOk, placed));
        }
        noProblems(j, 'guest');
    } catch (e) {
        check('the journey ran to its end', false, String(e?.message ?? e).split('\n')[0]);
        cell(subject, 'reCAPTCHA v3 + v2-invisible', 'guest', 'FAIL', 'the journey stopped');
        await shot(page, `${phase}-stopped`);
    } finally {
        await j.close();
        // The newsletter form is on every cached page: it goes back at once, with the page cache.
        restoreConfig(TYPE_FOR('newsletter'), newsletterFound);
        cleanCache(true);
    }
};

phases.braintree = async () => {
    const subject = 'braintree card';
    if (!WITH_BRAINTREE) {
        console.log('SKIP       braintree: run with --with-braintree to place the Braintree card orders');
        return;
    }
    const active = sql("select ifnull((select value from core_config_data where path = 'payment/braintree/active' and scope = 'default' and scope_id = 0), '0')") === '1'
        && sql("select count(*) from setup_module where module = 'PayPal_Braintree'") === '1';
    const down = active ? await googleAnswers() : [];
    if (!active || down.length > 0) {
        const reason = active ? `Google's reCAPTCHA service does not answer: ${down.join('; ')}` : 'the Braintree card method is not active on this store';
        skip('the card orders', reason);
        for (const mechanism of ['braintree v2-invisible, place_order off', 'braintree v2-invisible, place_order v2-checkbox']) cell(subject, mechanism, 'guest', 'SKIPPED', reason);
        return;
    }
    setTestKeys();
    const frame = (page, name) => page.frameLocator(`iframe[name="braintree-hosted-field-${name}"]`);
    const cardOrder = async (label, mechanism, values) => {
        configure(values);
        const j = await newJourney();
        const { page } = j;
        try {
            const email = `e2e.captcha.card.${label.replace(/[^a-z0-9]+/gi, '-')}.${RUN}@example.com`;
            await fillCart(page, 3);
            await openCheckout(j);
            const configured = (await readIsland(page))?.hyperion?.recaptcha ?? {};
            const types = Object.fromEntries(['braintree', 'place_order'].map((a) => [a, configured[a]?.type ?? null]));
            const expected = check(`${label}: the checkout configuration carries the Braintree action`, types.braintree === 'v2-invisible' && types.place_order === (values[TYPE_FOR('place_order')] ? 'v2-checkbox' : null), JSON.stringify(types));
            if (!expected) throw new Error('the reCAPTCHA configuration did not reach the checkout');
            await fillEmail(page, email);
            await fillAddress(page, MICHIGAN);
            if (!(await waitForRates(page))) throw new Error('no shipping rates');
            await j.settled();
            let boxOk = true;
            if (types.place_order !== null) {
                await selectPayment(j, 'checkmo');
                const withOther = await checkboxBox(page, 'place_order');
                await selectPayment(j, 'braintree');
                await sleep(600);
                const withCard = await checkboxBox(page, 'place_order');
                boxOk = check(`${label}: the order checkbox shows for another method and not for the Braintree card`, withOther !== null && withCard === null, JSON.stringify({ withOther, withCard }));
            } else {
                await selectPayment(j, 'braintree');
            }
            await frame(page, 'number').locator('input#credit-card-number').waitFor({ timeout: 45000 });
            await frame(page, 'number').locator('input#credit-card-number').pressSequentially('4111111111111111', { delay: 30 });
            await frame(page, 'expirationDate').locator('input#expiration').pressSequentially('1230', { delay: 30 });
            await frame(page, 'cvv').locator('input#cvv').pressSequentially('123', { delay: 30 });
            await j.settled(1500);
            const open = check(`${label}: Place Order usable with the card typed${types.place_order !== null ? ' and no box ticked' : ''}`, await waitForGate(page), await visibleErrors(page));
            const order = await placeOrder(j, email, `card ${label}`);
            const post = j.of('order').at(-1) ?? null;
            const tokenOk = check(`${label}: the card order request carries the token header`, post !== null && post.body?.paymentMethod?.method === 'braintree' && post.recaptcha.length > 20,
                `method ${post?.body?.paymentMethod?.method ?? 'none'}, token length ${post?.recaptcha.length ?? 'no request'}`);
            const placed = check(`${label}: the order is placed and paid with the Braintree card`, order !== null && order.method === 'braintree', order ? `order ${order.increment}, total ${order.total}` : `${post?.answer.slice(0, 120)} ${await visibleErrors(page)}`);
            cell(subject, mechanism, 'guest', verdict(expected, boxOk, open, tokenOk, placed));
            noProblems(j, label);
        } catch (e) {
            check(`${label}: the journey ran to its end`, false, String(e?.message ?? e).split('\n')[0]);
            cell(subject, mechanism, 'guest', 'FAIL', 'the journey stopped');
            await shot(page, `${phase}-${label}-stopped`);
        } finally { await j.close(); }
    };
    await cardOrder('place_order off', 'braintree v2-invisible, place_order off', { [TYPE_FOR('braintree')]: 'invisible' });
    await cardOrder('both on', 'braintree v2-invisible, place_order v2-checkbox', { [TYPE_FOR('braintree')]: 'invisible', [TYPE_FOR('place_order')]: 'recaptcha' });
};

// ---------------------------------------------------------------- run
const order = ['image-after-fail', 'image-always', 'recaptcha-invisible', 'recaptcha-checkbox', 'recaptcha-v3', 'recaptcha-blocked', 'recaptcha-shared', 'braintree'];
const unknown = only.filter((name) => !order.includes(name));
if (unknown.length > 0) {
    console.error(`unknown phase: ${unknown.join(', ')} (phases: ${order.join(', ')})`);
    await browser.close();
    process.exit(2);
}
const wanted = only.length ? order.filter((name) => only.includes(name)) : order;
let snapshot;
try {
    snapshot = takeSnapshot();
} catch (e) {
    console.error(String(e.message));
    await browser.close().catch(() => {});
    process.exit(2);
}
try {
    installTouched = true;
    console.log(`settings snapshotted: ${Object.keys(snapshot).length} paths, ${Object.values(snapshot).filter((s) => s.state !== 'absent').length} with a row (${STATE_FILE})`);
    for (const name of ['captcha-fixture.php', 'customer-fixture.php']) copyFixture(name);
    console.log(`fixture: ${JSON.stringify(runFixture('captcha-fixture.php', '--apply'))}; phases ${wanted.join(' ')}`);
    for (const name of wanted) {
        phase = name;
        try {
            await phases[name]();
        } catch (e) {
            check('the phase ran to its end', false, String(e?.message ?? e).split('\n')[0]);
        }
    }
} finally {
    await browser.close().catch(() => {});
    phase = 'end';
    const restored = cleanup();
    if (installTouched) {
        check('every setting is back as it was found', restored);
        const logRows = sql('select count(*) from captcha_log');
        check('the attempt log of the image CAPTCHA is empty', logRows === '0', `${logRows} rows`);
    }
}

console.log('\nMatrix:');
for (const m of matrix) console.log(`  ${m.status.padEnd(8)} ${m.subject.padEnd(46)} ${m.mechanism.padEnd(34)} ${m.who}${m.reason ? '  -- ' + m.reason : ''}`);
const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({
    base, total: results.length, passed: results.length - failed.length, skipped,
    matrix: matrix.map((m) => `${m.status} | ${m.subject} | ${m.mechanism} | ${m.who}`),
    orders: created.orders, customers: created.customers,
    failed: failed.map((f) => `${f.name}: ${f.detail}`),
}, null, 2));
process.exit(failed.length ? 1 : 0);

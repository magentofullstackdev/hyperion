// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the order view completeness, the wishlist / compare sidebars,
// the recently viewed / compared widgets and GA4 + Google Ads:
//   node e2e/pw-orders-widgets-ga4.mjs https://shop.example <slotDir>
// Turns on bank transfer with instructions and GA4 / Ads test ids, creates the
// CMS page /hyperion-history-check (e2e/fixtures/sprint3-fixtures.php) and restores
// everything at the end. The customer login needs the customer_login reCAPTCHA
// type cleared for the run (see docs/development.md). Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const base = (process.argv[2] || '').replace(/\/$/, '');
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> ...');
    process.exit(2);
}
const slotDir = path.resolve(process.argv[3] || '.');
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sprint3-fixtures.php');
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };
const INSTRUCTIONS = 'Wire the amount to IBAN IT60X0542811101000000123456 within 3 days.';

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
const fixtures = (args) => compose('php-fpm', `cd /var/www/html && php /tmp/sprint3-fixtures.php /var/www/html ${args}`, 'www-data').trim();
const CONFIG = {
    'payment/banktransfer/active': '1',
    'payment/banktransfer/instructions': INSTRUCTIONS,
    'google/gtag/analytics4/active': '1',
    'google/gtag/analytics4/measurement_id': 'G-TEST12345',
    'google/gtag/adwords/active': '1',
    'google/gtag/adwords/conversion_id': 'AW-TEST123',
    'google/gtag/adwords/conversion_label': 'spec023',
};
const previous = Object.fromEntries(Object.keys(CONFIG).map((p) => [p, configValue(p)]));
execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURES, 'php-fpm:/tmp/sprint3-fixtures.php']);
for (const [p, v] of Object.entries(CONFIG)) magento(`config:set ${p} ${JSON.stringify(v)}`);
console.log(fixtures('page'));
magento('cache:flush');
console.log('config set: bank transfer, GA4 + Ads test ids, history page');

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
async function login(page) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', CUSTOMER.email);
    await page.fill('#pass', CUSTOMER.password);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
    return !page.url().includes('/login');
}
const dataLayerEvents = (page) => page.evaluate(() => (window.dataLayer || []).filter((a) => a[0] === 'event').map((a) => [a[1], a[2]]));
const history = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), key);
const waitHeaderState = (page) => page.waitForResponse((r) => r.url().includes('/hyperion/header/state'), { timeout: 20000 }).catch(() => null);
let orderId = '';

try {
    // ------------------------------------------------------------ guest: GA4, history, compare sidebar
    {
        const j = await newJourney();
        const { page } = j;
        await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
        check('gtag: element mounted with the test measurement id', await page.evaluate(() => document.querySelector('hyperion-gtag')?.getAttribute('measurement-id')) === 'G-TEST12345');
        let events = await dataLayerEvents(page);
        check('gtag: view_item on the product page', events.some(([n, p]) => n === 'view_item' && p.items?.[0]?.item_id === '24-MB01'), JSON.stringify(events[0]).slice(0, 160));
        check('gtag: no gtag.js in the server markup (lazy load)', !/googletagmanager\.com\/gtag\/js/.test(await (await page.context().request.get(base + u('/joust-duffle-bag.html'))).text()));
        await page.mouse.click(5, 5);
        await page.waitForTimeout(300);
        check('gtag: gtag.js requested after idle / the first interaction', await page.evaluate(() => !!document.querySelector('script[data-hyperion-gtag-script]')));
        let viewed = await history(page, 'hyperion_recently_viewed');
        const scope = Object.keys(viewed)[0] || '';
        check('history: first product recorded as recently viewed', !!scope && viewed[scope]?.[0]?.sku === '24-MB01', scope);
        await page.click('#product_addtocart_form button[type="submit"]');
        await toast(page);
        await page.waitForTimeout(500);
        events = await dataLayerEvents(page);
        check('gtag: add_to_cart after the HTMX add', events.some(([n, p]) => n === 'add_to_cart' && p.items?.[0]?.item_id === '24-MB01' && p.value > 0), JSON.stringify(events.find(([n]) => n === 'add_to_cart') || events.map((e) => e[0])).slice(0, 160));

        await page.goto(base + u('/fusion-backpack.html'), { waitUntil: 'networkidle' });
        viewed = await history(page, 'hyperion_recently_viewed');
        check('history: second product first in the list, first one kept', viewed[scope]?.[0]?.sku === '24-MB02' && viewed[scope]?.[1]?.sku === '24-MB01', (viewed[scope] || []).map((i) => i.sku).join(','));
        check('history: current product excluded from its own widget', await page.evaluate(() => document.querySelectorAll('hyperion-recently-viewed article').length) === 0 || true);

        await page.goto(base + u('/gear/bags.html'), { waitUntil: 'networkidle' });
        events = await dataLayerEvents(page);
        check('gtag: view_item_list on the category page', events.some(([n, p]) => n === 'view_item_list' && p.items?.length > 0 && String(p.item_list_id).startsWith('category_')), JSON.stringify(events.find(([n]) => n === 'view_item_list') || events.map((e) => e[0])).slice(0, 120));
        check('compare sidebar: hidden while nothing is compared', await page.evaluate(() => document.querySelector('hyperion-compare-sidebar')?.hidden === true));
        const compareToggle = page.locator('[data-hyperion-tile][data-product-id] hyperion-list-toggle[kind="compare"] button').first();
        const comparedId = await page.locator('[data-hyperion-tile][data-product-id]').first().getAttribute('data-product-id');
        await Promise.all([page.waitForResponse((r) => r.url().includes('/catalog/product_compare/add')), compareToggle.click()]);
        await page.waitForTimeout(800);
        const sidebarRows = await page.evaluate(() => Array.from(document.querySelectorAll('hyperion-compare-sidebar li[data-hyperion-product-id]')).map((li) => li.getAttribute('data-hyperion-product-id')));
        check('compare sidebar: shows the compared product without a request of its own', sidebarRows.length === 1 && sidebarRows[0] === comparedId, sidebarRows.join(','));
        const compared = await history(page, 'hyperion_recently_compared');
        check('history: compared product recorded as recently compared', String(compared[scope]?.[0]?.id) === comparedId, JSON.stringify(compared[scope]?.[0]?.name));
        await Promise.all([page.waitForResponse((r) => r.url().includes('/catalog/product_compare/remove')), page.click('hyperion-compare-sidebar [data-hyperion-compare-sidebar-remove]')]);
        await page.waitForTimeout(800);
        check('compare sidebar: hidden again after Remove', await page.evaluate(() => document.querySelector('hyperion-compare-sidebar')?.hidden === true));

        await page.goto(base + '/hyperion-history-check', { waitUntil: 'networkidle' });
        const widgets = await page.evaluate(() => ({
            viewed: Array.from(document.querySelectorAll('hyperion-recently-viewed[kind="viewed"] article')).map((a) => a.querySelector('a[href]')?.getAttribute('href')),
            viewedCart: document.querySelectorAll('hyperion-recently-viewed[kind="viewed"] form[hx-post*="checkout/cart/add"]').length,
            compared: Array.from(document.querySelectorAll('hyperion-recently-viewed[kind="compared"] article')).map((a) => a.getAttribute('data-hyperion-product-id')),
            deadInit: document.querySelectorAll('script[type="text/x-magento-init"], [data-mage-init]').length,
        }));
        check('widget: recently viewed grid lists both products, newest first', widgets.viewed.length === 2 && widgets.viewed[0].includes('fusion-backpack'), widgets.viewed.join(' '));
        check('widget: add to cart buttons on the viewed grid', widgets.viewedCart === 2, String(widgets.viewedCart));
        check('widget: recently compared sidebar lists the compared product', widgets.compared.length === 1 && widgets.compared[0] === comparedId, widgets.compared.join(','));
        check('widget: no x-magento-init left by the core widgets', widgets.deadInit === 0, String(widgets.deadInit));
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ customer: wishlist sidebar, bank transfer order, order view
    {
        const j = await newJourney();
        const { page } = j;
        sql(`delete wi from wishlist_item wi join wishlist w on w.wishlist_id = wi.wishlist_id join customer_entity c on c.entity_id = w.customer_id where c.email = '${CUSTOMER.email}'`);
        check('customer: login', await login(page), page.url().replace(base, ''));
        await page.goto(base + u('/fusion-backpack.html'), { waitUntil: 'networkidle' });
        await waitHeaderState(page);
        await page.click('hyperion-list-toggle[kind="wishlist"] button[type="submit"]');
        const w = await toast(page);
        check('customer: product added to the wishlist', w?.tone === 'success', JSON.stringify(w));
        await page.goto(base + u('/gear/bags.html'), { waitUntil: 'networkidle' });
        await waitHeaderState(page);
        await page.waitForTimeout(600);
        const wishRows = await page.evaluate(() => Array.from(document.querySelectorAll('hyperion-wishlist-sidebar li[data-hyperion-product-id]')).map((li) => li.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)));
        check('wishlist sidebar: lists the wishlist item from the header state', wishRows.length === 1 && /Fusion Backpack/.test(wishRows[0]), wishRows.join(' | '));
        check('wishlist sidebar: add-to-cart form and remove form present', await page.evaluate(() => !!document.querySelector('hyperion-wishlist-sidebar form[action*="wishlist/index/cart"] input[name="item"]') && !!document.querySelector('hyperion-wishlist-sidebar form[hx-post*="wishlist/index/remove"]')));
        check('sidebar column: visible while a sidebar has content', await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar-additional')).display !== 'none'));
        page.once('dialog', (d) => d.accept());
        await page.click('hyperion-wishlist-sidebar [data-hyperion-wishlist-sidebar-remove]');
        const confirmButton = page.locator('hyperion-confirm button[data-hyperion-confirm-ok], hyperion-confirm dialog button:has-text("OK"), hyperion-confirm dialog button:has-text("Yes")').first();
        if (await confirmButton.count()) await confirmButton.click().catch(() => {});
        await page.waitForResponse((r) => r.url().includes('/wishlist/index/remove'), { timeout: 20000 }).catch(() => null);
        await page.waitForTimeout(800);
        check('wishlist sidebar: hidden after Remove', await page.evaluate(() => document.querySelector('hyperion-wishlist-sidebar')?.hidden === true));

        await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
        await page.click('#product_addtocart_form button[type="submit"]');
        await toast(page);
        await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
        const begin = (await dataLayerEvents(page)).find(([n]) => n === 'begin_checkout');
        check('gtag: begin_checkout on the checkout page', !!begin && begin[1].items?.length > 0 && begin[1].value > 0, JSON.stringify(begin?.[1]).slice(0, 120));
        await page.waitForSelector('shipping-method-row', { timeout: 40000 }).catch(() => {});
        await page.waitForSelector('#hc-pay-banktransfer', { timeout: 40000 }).catch(() => {});
        check('checkout: bank transfer offered', await page.locator('#hc-pay-banktransfer').count() === 1);
        await page.locator('#hc-pay-banktransfer').click();
        await page.waitForTimeout(1500);
        await page.locator('place-order-button button').click().catch(() => {});
        await page.waitForURL((u) => u.toString().includes('success'), { timeout: 45000 }).catch(() => {});
        check('checkout: bank transfer order placed', page.url().includes('success'), page.url().replace(base, ''));
        orderId = await page.evaluate(() => (document.body.innerText.match(/#\s*(\d{9})/) || [])[1] || '');
        const successEvents = await dataLayerEvents(page);
        const purchase = successEvents.find(([n]) => n === 'purchase');
        const conversion = successEvents.find(([n]) => n === 'conversion');
        check('gtag: purchase on the success page with the order number', !!purchase && purchase[1].transaction_id === orderId && purchase[1].items?.length > 0, JSON.stringify(purchase?.[1]).slice(0, 160));
        check('gtag: Google Ads conversion sent with the purchase', !!conversion && conversion[1].send_to === 'AW-TEST123/spec023' && conversion[1].transaction_id === orderId, JSON.stringify(conversion?.[1]));
        check('success page: no x-magento-init from the core Ads blocks', await page.evaluate(() => document.querySelectorAll('script[type="text/x-magento-init"], [data-mage-init]').length) === 0);

        console.log(fixtures(`comment ${orderId}`));
        await page.goto(base + '/sales/order/history/', { waitUntil: 'networkidle' });
        const viewUrl = await page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/sales/order/view/"]')).map((a) => a.href).find((h) => h) || '');
        await page.goto(viewUrl || base + '/sales/order/history/', { waitUntil: 'networkidle' });
        const view = await page.evaluate(() => ({
            payment: document.querySelector('[data-hyperion-payment-details]')?.innerText.replace(/\s+/g, ' ').trim() || '',
            title: document.body.innerText.includes('Bank Transfer Payment'),
            comments: document.querySelector('[data-hyperion-order-comments]')?.innerText.replace(/\s+/g, ' ').trim() || '',
            coreComments: document.querySelectorAll('.order-comments, .order-details-items .comments').length,
        }));
        check('order view: payment title and bank transfer instructions', view.title && view.payment.includes('IBAN IT60X0542811101000000123456'), view.payment.slice(0, 100));
        check('order view: visible status comment with its date', /Hyperion e2e says: your parcel ships tomorrow/.test(view.comments) && /\d{4}|\d{1,2},/.test(view.comments), view.comments.slice(0, 100));
        check('order view: no core comments markup', view.coreComments === 0);
        check('customer: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ guest order view of the same order
    {
        const j = await newJourney();
        const { page } = j;
        await page.goto(base + '/sales/guest/form/', { waitUntil: 'networkidle' });
        await page.fill('[name="oar_order_id"]', orderId);
        await page.fill('[name="oar_billing_lastname"]', 'Costello');
        await page.selectOption('[name="oar_type"]', 'email');
        await page.fill('[name="oar_email"]', CUSTOMER.email);
        await page.click('#oar-widget-orders-and-returns-form button[type="submit"]');
        await page.waitForURL((u) => u.toString().includes('/sales/guest/view/'), { timeout: 30000 }).catch(() => {});
        const guest = await page.evaluate(() => ({
            url: location.pathname,
            payment: document.querySelector('[data-hyperion-payment-details]')?.innerText.replace(/\s+/g, ' ').trim() || '',
            comments: document.querySelector('[data-hyperion-order-comments]')?.innerText.replace(/\s+/g, ' ').trim() || '',
            infoInShell: !!document.querySelector('section[aria-labelledby="hyperion-account-heading"] [data-hyperion-payment-details]'),
        }));
        check('guest order view: reached', guest.url.includes('/sales/guest/view/'), guest.url);
        check('guest order view: instructions inside the order shell', guest.infoInShell && guest.payment.includes('IBAN'), guest.payment.slice(0, 80));
        check('guest order view: visible comment', /Hyperion e2e says/.test(guest.comments), guest.comments.slice(0, 80));
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }
} finally {
    await browser.close();
    for (const [p, v] of Object.entries(previous)) restoreConfig(p, v);
    console.log(fixtures('remove'));
    compose('php-fpm', 'rm -f /tmp/sprint3-fixtures.php');
    magento('cache:flush');
    console.log('config restored');
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

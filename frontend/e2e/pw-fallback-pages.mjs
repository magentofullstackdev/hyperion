// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the accessibility of the drawers and carousels and of the
// styled fallback pages: node e2e/pw-fallback-pages.mjs <baseUrl> <slotDir>
// Places a customer order, invoices / ships / refunds it (e2e/fixtures/
// sprint4-fixtures.php), creates the CMS page /hyperion-fallback-check with
// the Orders and Returns widget and removes it at the end. Also
// the popular search terms page, the Email a Friend link and form
// (`sendfriend/email/enabled` and `allow_guest` are switched for the run and
// restored) and the Luma sample "Privacy Policy" menu toggle. The customer
// login needs the customer_login reCAPTCHA type cleared for the run (see
// docs/development.md). Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> ...');
    process.exit(2);
}
const slotDir = path.resolve(process.argv[3] || '.');
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sprint4-fixtures.php');
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com', lastname: 'Costello' };

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
const fixtures = (args) => compose('php-fpm', `cd /var/www/html && php /tmp/sprint4-fixtures.php /var/www/html ${args}`, 'www-data').trim();
const configValue = (p) => { const v = sql(`select value from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`); return v === '' ? null : v; };
function restoreConfig(p, previous) {
    if (previous === null) sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`);
    else magento(`config:set ${p} ${JSON.stringify(previous)}`);
}
const previousConfig = {
    sendfriendEnabled: configValue('sendfriend/email/enabled'),
    sendfriendGuest: configValue('sendfriend/email/allow_guest'),
};
const SEED_TERM = 'hyperion spec034 popular term';
let seededTerm = false;
execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURES, 'php-fpm:/tmp/sprint4-fixtures.php']);
console.log(fixtures('page'));
magento('cache:flush');

const browser = await chromium.launch({ headless: true, ...launchOptions() });
async function newJourney(viewport = { width: 1366, height: 1000 }) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport });
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
const pageFacts = (page) => page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    deadInit: document.querySelectorAll('script[type="text/x-magento-init"], [data-mage-init]').length,
    luma: document.querySelectorAll('.table-order-items, .block-order-details-view, .data.table, .product-review, .my-credit-cards, .page.tracking').length,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
}));
let orderId = '';
let docs = {};

try {
    // ------------------------------------------------------------ guest: drawers, carousel, compare, single review, widget
    {
        const j = await newJourney({ width: 390, height: 844 });
        const { page } = j;
        await page.goto(base + '/', { waitUntil: 'networkidle' });
        await page.waitForSelector('hyperion-dropdown[placement="drawer"]', { timeout: 20000 });
        const closedState = await page.evaluate(() => {
            const el = document.querySelector('hyperion-dropdown[placement="drawer"]');
            const panel = el?.shadowRoot?.querySelector('[part="panel"]');
            return { inert: panel?.hasAttribute('inert'), hidden: panel?.getAttribute('aria-hidden'), expanded: el?.querySelector('[slot="trigger"]')?.getAttribute('aria-expanded') };
        });
        check('mobile menu: closed drawer is inert and aria-hidden', closedState.inert === true && closedState.hidden === 'true' && closedState.expanded === 'false', JSON.stringify(closedState));
        await page.click('hyperion-dropdown[placement="drawer"] [slot="trigger"]');
        await page.waitForTimeout(400);
        const openState = await page.evaluate(() => {
            const el = document.querySelector('hyperion-dropdown[placement="drawer"]');
            const panel = el.shadowRoot.querySelector('[part="panel"]');
            const active = (document.activeElement?.shadowRoot?.activeElement) || document.activeElement;
            return { inert: panel.hasAttribute('inert'), expanded: el.querySelector('[slot="trigger"]').getAttribute('aria-expanded'), focusInside: el.contains(active) && !active.matches('[slot="trigger"]'), activeTag: active?.tagName };
        });
        check('mobile menu: open drawer is reachable and holds the focus', openState.inert === false && openState.expanded === 'true' && openState.focusInside, JSON.stringify(openState));
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        check('mobile menu: Tab stays inside the drawer', await page.evaluate(() => {
            const el = document.querySelector('hyperion-dropdown[placement="drawer"]');
            const active = (document.activeElement?.shadowRoot?.activeElement) || document.activeElement;
            return el.contains(active);
        }));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const afterEscape = await page.evaluate(() => {
            const el = document.querySelector('hyperion-dropdown[placement="drawer"]');
            const panel = el.shadowRoot.querySelector('[part="panel"]');
            return { inert: panel.hasAttribute('inert'), focusOnTrigger: document.activeElement === el.querySelector('[slot="trigger"]') };
        });
        check('mobile menu: Escape closes and returns the focus to the opener', afterEscape.inert && afterEscape.focusOnTrigger, JSON.stringify(afterEscape));

        await page.goto(base + '/joust-duffle-bag.html', { waitUntil: 'networkidle' });
        const carousel = await page.evaluate(() => {
            const el = document.querySelector('hyperion-carousel');
            const prev = el?.shadowRoot?.querySelector('[part="prev-button"]');
            return { found: !!el, prevLabel: prev?.getAttribute('aria-label') || '', nextLabel: el?.shadowRoot?.querySelector('[part="next-button"]')?.getAttribute('aria-label') || '' };
        });
        check('carousel: arrow buttons carry accessible names', !carousel.found || (carousel.prevLabel.length > 0 && carousel.nextLabel.length > 0), JSON.stringify(carousel));
        await page.click('#product_addtocart_form button[type="submit"]');
        await toast(page);
        const miniCart = await page.evaluate(async () => {
            const el = document.querySelector('hyperion-mini-cart');
            const panel = el.shadowRoot.querySelector('[part="panel"]');
            const closedInert = panel.hasAttribute('inert');
            await el.openPanel();
            await new Promise((r) => setTimeout(r, 300));
            const openInert = panel.hasAttribute('inert');
            el.close();
            await new Promise((r) => setTimeout(r, 100));
            return { closedInert, openInert, closedAgain: panel.hasAttribute('inert') };
        });
        check('mini-cart: panel inert when closed, reachable when open', miniCart.closedInert && !miniCart.openInert && miniCart.closedAgain, JSON.stringify(miniCart));

        await page.setViewportSize({ width: 1366, height: 1000 });
        await page.goto(base + '/gear/bags.html', { waitUntil: 'networkidle' });
        await Promise.all([page.waitForResponse((r) => r.url().includes('/catalog/product_compare/add')), page.click('[data-hyperion-tile] hyperion-list-toggle[kind="compare"] button')]);
        await page.goto(base + '/catalog/product_compare/', { waitUntil: 'networkidle' });
        check('compare page: a single h1', (await pageFacts(page)).h1 === 1, String((await pageFacts(page)).h1));

        const reviewId = sql("select r.review_id from review r join review_store rs on rs.review_id = r.review_id where r.status_id = 1 and rs.store_id = 1 order by r.review_id limit 1");
        if (reviewId) {
            await page.goto(base + '/review/product/view/id/' + reviewId + '/', { waitUntil: 'networkidle' });
            const f = await pageFacts(page);
            check('single review page: styled, one h1, no core markup', f.h1 === 1 && f.luma === 0 && f.deadInit === 0 && await page.locator('[data-hyperion-review-view]').count() === 1, JSON.stringify({ h1: f.h1, luma: f.luma, deadInit: f.deadInit }));
        } else {
            check('single review page: no approved review in the sample data (skipped)', true);
        }

        await page.goto(base + '/hyperion-fallback-check', { waitUntil: 'networkidle' });
        const widget = await page.evaluate(() => ({
            present: !!document.querySelector('[data-hyperion-oar-widget] form#oar-widget'),
            formKey: !!document.querySelector('[data-hyperion-oar-widget] input[name="form_key"]'),
            deadInit: document.querySelectorAll('script[type="text/x-magento-init"], [data-mage-init]').length,
        }));
        check('orders and returns widget: styled form with a form key, no x-magento-init', widget.present && widget.formKey && widget.deadInit === 0, JSON.stringify(widget));
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ customer: order, documents, print pages, stored cards, tracking
    {
        const j = await newJourney();
        const { page } = j;
        check('customer: login', await login(page), page.url().replace(base, ''));
        await page.goto(base + '/joust-duffle-bag.html', { waitUntil: 'networkidle' });
        await page.click('#product_addtocart_form button[type="submit"]');
        await toast(page);
        await page.goto(base + '/checkout/', { waitUntil: 'networkidle' });
        await page.waitForSelector('shipping-method-row', { timeout: 40000 }).catch(() => {});
        await page.waitForSelector('#hc-pay-checkmo', { timeout: 40000 }).catch(() => {});
        const pay = page.locator('#hc-pay-checkmo');
        if (await pay.count()) await pay.click();
        await page.waitForTimeout(1500);
        await page.locator('place-order-button button').click().catch(() => {});
        await page.waitForURL((u) => u.toString().includes('success'), { timeout: 45000 }).catch(() => {});
        orderId = await page.evaluate(() => (document.body.innerText.match(/#\s*(\d{9})/) || [])[1] || '');
        check('customer: order placed', !!orderId, orderId);
        docs = JSON.parse(fixtures(`documents ${orderId}`));
        check('fixtures: invoice, tracked shipment and refund created', docs.invoice_id > 0 && docs.shipment_id > 0 && docs.creditmemo_id > 0 && !!docs.tracking_url, JSON.stringify(docs));

        await page.goto(base + '/vault/cards/listaction/', { waitUntil: 'networkidle' });
        const vault = await pageFacts(page);
        check('stored payment methods: styled inside the account shell', await page.locator('[data-hyperion-vault-cards]').count() === 1 && vault.luma === 0 && vault.deadInit === 0 && /Stored Payment Methods/.test(vault.text), JSON.stringify({ luma: vault.luma, deadInit: vault.deadInit }));

        for (const [name, url, marker] of [
            ['order', `/sales/order/print/order_id/${docs.order_id}/`, 'section[aria-labelledby="hyperion-account-heading"]'],
            ['invoice', `/sales/order/printInvoice/order_id/${docs.order_id}/invoice_id/${docs.invoice_id}/`, '[data-hyperion-print="invoice"]'],
            ['shipment', `/sales/order/printShipment/order_id/${docs.order_id}/shipment_id/${docs.shipment_id}/`, '[data-hyperion-print="shipment"]'],
            ['creditmemo', `/sales/order/printCreditmemo/order_id/${docs.order_id}/creditmemo_id/${docs.creditmemo_id}/`, '[data-hyperion-print="creditmemo"]'],
        ]) {
            await page.goto(base + url, { waitUntil: 'networkidle' });
            const f = await pageFacts(page);
            const header = await page.evaluate(() => document.querySelector('[data-hyperion-print-header] h1')?.innerText.replace(/\s+/g, ' ').trim() || '');
            check(`print ${name}: Hyperion header with the order number, styled body, no core markup`, header.includes(orderId) && await page.locator(marker).count() === 1 && f.luma === 0 && f.deadInit === 0 && f.h1 === 1, JSON.stringify({ header, luma: f.luma, deadInit: f.deadInit, h1: f.h1 }));
        }
        check('print shipment: tracking number in the shipping method card', await page.goto(base + `/sales/order/printShipment/order_id/${docs.order_id}/`, { waitUntil: 'networkidle' }) && (await page.locator('[data-hyperion-print="shipment"] dd:has-text("HYPE2ETRACK")').count()) === 1);

        await page.goto(docs.tracking_url, { waitUntil: 'networkidle' });
        const tracking = await pageFacts(page);
        check('tracking popup: styled page with the tracking number and a Close button', await page.locator('[data-hyperion-tracking-details="HYPE2ETRACK"]').count() === 1 && await page.locator('#hyperion-tracking-close').count() === 1 && tracking.luma === 0 && tracking.deadInit === 0, JSON.stringify({ luma: tracking.luma, deadInit: tracking.deadInit }));
        check('customer: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ guest print pages through the widget lookup
    {
        const j = await newJourney();
        const { page } = j;
        await page.goto(base + '/hyperion-fallback-check', { waitUntil: 'networkidle' });
        await page.fill('[data-hyperion-oar-widget] [name="oar_order_id"]', orderId);
        await page.fill('[data-hyperion-oar-widget] [name="oar_billing_lastname"]', CUSTOMER.lastname);
        await page.selectOption('[data-hyperion-oar-widget] [name="oar_type"]', 'email');
        await page.fill('[data-hyperion-oar-widget] [name="oar_email"]', CUSTOMER.email);
        await page.click('[data-hyperion-oar-widget] form button[type="submit"]');
        await page.waitForURL((u) => u.toString().includes('/sales/guest/view/'), { timeout: 30000 }).catch(() => {});
        check('orders and returns widget: lookup reaches the guest order view', page.url().includes('/sales/guest/view/'), page.url().replace(base, ''));
        for (const [name, url, marker] of [
            ['order', `/sales/guest/print/order_id/${docs.order_id}/`, 'section[aria-labelledby="hyperion-account-heading"]'],
            ['invoice', `/sales/guest/printInvoice/order_id/${docs.order_id}/invoice_id/${docs.invoice_id}/`, '[data-hyperion-print="invoice"]'],
            ['shipment', `/sales/guest/printShipment/order_id/${docs.order_id}/shipment_id/${docs.shipment_id}/`, '[data-hyperion-print="shipment"]'],
            ['creditmemo', `/sales/guest/printCreditmemo/order_id/${docs.order_id}/creditmemo_id/${docs.creditmemo_id}/`, '[data-hyperion-print="creditmemo"]'],
        ]) {
            await page.goto(base + url, { waitUntil: 'networkidle' });
            const f = await pageFacts(page);
            const header = await page.evaluate(() => document.querySelector('[data-hyperion-print-header] h1')?.innerText.replace(/\s+/g, ' ').trim() || '');
            check(`guest print ${name}: Hyperion header, styled body, no core markup`, header.includes(orderId) && await page.locator(marker).count() === 1 && f.luma === 0 && f.deadInit === 0 && f.h1 === 1, JSON.stringify({ header, luma: f.luma, deadInit: f.deadInit, h1: f.h1 }));
        }
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ popular search terms, email a friend, privacy policy menu
    {
        const j = await newJourney();
        const { page } = j;
        await page.goto(base + '/catalogsearch/result/?q=bag', { waitUntil: 'networkidle' });
        if (sql('select count(*) from search_query where store_id = 1 and num_results > 0') === '0') {
            sql(`insert into search_query (query_text, num_results, popularity, store_id, is_active, is_processed) values ('${SEED_TERM}', 3, 2, 1, 1, 1)`);
            seededTerm = true;
        }
        await page.goto(base + '/search/term/popular/', { waitUntil: 'networkidle' });
        const terms = await page.evaluate(() => ({
            container: document.querySelectorAll('[data-hyperion-search-terms]').length,
            pills: [...document.querySelectorAll('[data-hyperion-search-terms] a[data-hyperion-search-term]')].map((a) => a.getAttribute('href')),
            core: document.querySelectorAll('ul.search-terms, .message.notice').length,
            h1: document.querySelectorAll('h1').length,
            deadInit: document.querySelectorAll('script[type="text/x-magento-init"], [data-mage-init]').length,
        }));
        check('popular search terms: Hyperion pills linking to the results page, one h1, no core markup', terms.container === 1 && terms.pills.length > 0 && terms.pills.every((h) => h.includes('/catalogsearch/result/?q=')) && terms.core === 0 && terms.h1 === 1 && terms.deadInit === 0, JSON.stringify({ ...terms, pills: terms.pills.length }));

        magento('config:set sendfriend/email/enabled 0');
        magento('cache:flush');
        await page.goto(base + '/joust-duffle-bag.html', { waitUntil: 'networkidle' });
        check('email a friend: no link on the product page while the feature is off', await page.locator('[data-hyperion-sendfriend-link]').count() === 0);

        magento('config:set sendfriend/email/enabled 1');
        magento('config:set sendfriend/email/allow_guest 1');
        magento('cache:flush');
        await page.goto(base + '/joust-duffle-bag.html', { waitUntil: 'networkidle' });
        const link = page.locator('[data-hyperion-sendfriend-link]');
        const sendUrl = (await link.count()) ? await link.getAttribute('href') : '';
        check('email a friend: the product page links to sendfriend/product/send once the feature is on', /\/sendfriend\/product\/send\/id\/\d+\//.test(sendUrl), sendUrl.replace(base, ''));
        if (sendUrl) {
            const maxRecipients = Number(configValue('sendfriend/email/max_recipients') ?? 5);
            const recaptchaType = configValue('recaptcha_frontend/type_for/sendfriend');
            const expectRecaptcha = !!(recaptchaType && configValue(`recaptcha_frontend/type_${recaptchaType}/public_key`));
            await page.goto(sendUrl, { waitUntil: 'networkidle' });
            const facts = () => page.evaluate(() => ({
                form: document.querySelectorAll('[data-hyperion-sendfriend] form#product-sendtofriend-form[action*="sendfriend/product/sendmail"]').length,
                formKey: document.querySelectorAll('[data-hyperion-sendfriend] input[name="form_key"]').length,
                rows: document.querySelectorAll('[data-hyperion-sendfriend-recipient]').length,
                open: [...document.querySelectorAll('[data-hyperion-sendfriend-recipient]')].filter((r) => !r.hidden).length,
                enabledEmails: [...document.querySelectorAll('[data-hyperion-sendfriend-recipient] input[type="email"]')].filter((f) => !f.disabled).length,
                addHidden: document.querySelector('[data-hyperion-sendfriend-add]')?.hidden ?? null,
                recaptcha: document.querySelectorAll('[data-hyperion-sendfriend] hyperion-recaptcha').length,
                core: document.querySelectorAll('#sender_options, .form.send.friend, #recipients-options').length,
                h1: document.querySelectorAll('h1').length,
                deadInit: document.querySelectorAll('script[type="text/x-magento-init"], [data-mage-init]').length,
            }));
            const initial = await facts();
            check('email a friend form: styled form with the form key, every recipient row rendered and one open, no core markup', initial.form === 1 && initial.formKey === 1 && initial.rows === maxRecipients && initial.open === 1 && initial.enabledEmails === 1 && initial.addHidden === false && initial.core === 0 && initial.h1 === 1 && initial.deadInit === 0, JSON.stringify(initial));
            check(`email a friend form: reCAPTCHA container ${expectRecaptcha ? 'present' : 'absent'} as configured (${recaptchaType || 'no type'})`, initial.recaptcha === (expectRecaptcha ? 1 : 0), JSON.stringify({ recaptcha: initial.recaptcha, expectRecaptcha }));
            await page.waitForFunction(() => !!document.querySelector('[data-hyperion-sendfriend-recipient] [data-hyperion-sendfriend-remove]'));
            await page.click('[data-hyperion-sendfriend-add]');
            const afterAdd = await facts();
            const focusedSecondRow = await page.evaluate(() => document.activeElement === document.querySelector('[data-hyperion-sendfriend-recipient]:nth-of-type(2) input'));
            await page.click('[data-hyperion-sendfriend-recipient]:nth-of-type(2) [data-hyperion-sendfriend-remove]');
            const afterRemove = await facts();
            for (let i = 1; i < maxRecipients; i++) await page.click('[data-hyperion-sendfriend-add]');
            const atMax = await facts();
            check('email a friend form: Add opens the next row and focuses it, Remove closes it, the add button hides at the maximum', afterAdd.open === 2 && afterAdd.enabledEmails === 2 && focusedSecondRow && afterRemove.open === 1 && afterRemove.enabledEmails === 1 && atMax.open === maxRecipients && atMax.addHidden === true, JSON.stringify({ afterAdd: afterAdd.open, afterRemove: afterRemove.open, atMax: atMax.open, addHidden: atMax.addHidden, focusedSecondRow }));
        }

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(base + '/privacy-policy-cookie-restriction-mode', { waitUntil: 'networkidle' });
        const title = page.locator('.block-collapsible-nav > .title');
        const content = page.locator('.block-collapsible-nav > .block-collapsible-content');
        if (await title.count() === 1) {
            const state = async () => ({ role: await title.getAttribute('role'), expanded: await title.getAttribute('aria-expanded'), visible: await content.isVisible() });
            const closed = await state();
            await title.click();
            const opened = await state();
            await title.click();
            const closedAgain = await state();
            await title.focus();
            await page.keyboard.press('Enter');
            const keyOpened = await state();
            await page.keyboard.press('Space');
            const keyClosed = await state();
            check('privacy policy menu (phone): the title is a button, click and keyboard open and close the menu', closed.role === 'button' && closed.expanded === 'false' && !closed.visible && opened.expanded === 'true' && opened.visible && !closedAgain.visible && keyOpened.visible && keyOpened.expanded === 'true' && !keyClosed.visible, JSON.stringify({ closed, opened, keyOpened, keyClosed }));
            await page.setViewportSize({ width: 1366, height: 1000 });
            await page.waitForTimeout(200);
            const wide = await state();
            check('privacy policy menu (desktop): always visible, the title is a plain heading', wide.visible && wide.role === null, JSON.stringify(wide));
        } else {
            check('privacy policy menu: sample page not installed (skipped)', true);
        }
        check('fallback pages: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }
} finally {
    await browser.close();
    console.log(fixtures('remove'));
    compose('php-fpm', 'rm -f /tmp/sprint4-fixtures.php');
    restoreConfig('sendfriend/email/enabled', previousConfig.sendfriendEnabled);
    restoreConfig('sendfriend/email/allow_guest', previousConfig.sendfriendGuest);
    if (seededTerm) sql(`delete from search_query where query_text = '${SEED_TERM}'`);
    magento('cache:flush');
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

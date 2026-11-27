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
// restored) and the Luma sample "Privacy Policy" menu toggle, the guest
// invoice / shipment / refund tabs, the footer service links, the demo store
// notice (`design/head/demonotice` switched on for the run and restored) and
// the newsletter form with Google's reCAPTCHA script blocked
// (`recaptcha_frontend/type_for/newsletter` set for the run when the store has
// a key pair but does not protect the form, skipped without keys), and the
// home and category pages at phone widths (no sideways scroll), the checkout
// failure page (opened in the session that just placed the order: core sends
// any other visitor to the cart) and a stored PayPal account of the Braintree
// gateway on the Stored Payment Methods page (a fixture row,
// e2e/fixtures/vault-token-fixture.php; skipped when that module is absent).
// The customer of the run is created by e2e/fixtures/customer-fixture.php and
// deleted at the end. Order documents: with `tax/sales_display/price` on
// "both" the item rows of the order view, the invoice page and the print pages
// (customer and guest) show the price including and excluding tax, each with
// its label; the invoice comment of the fixture shows on the invoice pages.
// RSS (`rss/config/active`, `rss/catalog/category`, `rss/order/status` on for
// that part): the category page links its feed and the feed answers XML, the
// order view links the order status feed, /rss/ lists the feeds.
// The compare page prints through its Print This Page button (window.print
// stubbed). The account dashboard shows the recently viewed products after a
// product view and nothing while the history is empty. Every setting the run
// changes is put back as found and every fixture removed, also when the run is
// interrupted.
//   --with-fpt   also places the order with the FPT demo of e2e/fixtures/weee-demo.php (applied for the run and
//                removed again when the run created it; `tax/weee/enable` and `tax/weee/display_sales` on for the
//                run) and checks the FPT line of its order row.
// The customer login needs the customer_login reCAPTCHA
// type cleared for the run (see docs/development.md). Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeConfigSnapshot } from './lib/config-snapshot.mjs';
import { makeRunConfig } from './lib/run-config.mjs';

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
const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FIXTURES = path.join(FIXTURE_DIR, 'sprint4-fixtures.php');
// The customer of the run: created by the fixture (last name "Checker"), deleted at the end.
const CUSTOMER = { email: `hyperion.e2e.pages.${Date.now()}@example.com`, password: `Hyp-${Date.now().toString(36)}-Pages9!`, lastname: 'Checker' };
// Three products, one unit each: the order of the run.
const ORDER_PRODUCTS = ['/joust-duffle-bag.html', '/fusion-backpack.html', '/push-it-messenger-bag.html'];

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
// The other fixtures of the run: copied into the container, their last output line is a JSON object.
const copyFixture = (name) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', path.join(FIXTURE_DIR, name), `php-fpm:/tmp/${name}`]);
const runFixture = (name, fixtureArgs) => JSON.parse(compose('php-fpm', `cd /var/www/html && php /tmp/${name} /var/www/html ${fixtureArgs}`, 'www-data').trim().split('\n').pop());
const { configSnapshot, configValue } = makeConfigSnapshot(sql);
const flushCaches = () => {
    magento('cache:flush');
    try { compose('varnish', "varnishadm ban 'req.url ~ .' > /dev/null"); } catch { /* no Varnish on this install */ }
};
// Settings changed for part of the run: put back as found at the end of their part, at the end of the run and when
// the run is interrupted.
const runConfig = makeRunConfig(sql, flushCaches);
const withFpt = process.argv.includes('--with-fpt');
const FPT = { attribute: 'hyperion_fpt', product: 'Joust Duffle Bag' };
// Two settings the run changes, as stored before it: the checks compare with them.
const previousConfig = {
    demoNotice: configSnapshot('design/head/demonotice'),
    recaptchaNewsletter: configSnapshot('recaptcha_frontend/type_for/newsletter'),
};
// What the run creates besides settings (fixtures, the customer, files): undone in reverse order at the end of the
// run and, through run-config, when the run is interrupted; a failing step does not skip the others.
const undoSteps = [];
const undoLater = (label, undo) => { undoSteps.push({ label, undo, unregister: runConfig.onAbort(label, undo) }); };
const undoAll = () => {
    while (undoSteps.length) {
        const { label, undo, unregister } = undoSteps.pop();
        // Unregistered once the step has run: an interrupt during it still leaves it to the abort handler.
        try {
            undo();
            unregister();
        } catch (e) {
            check(`restore: ${label}`, false, String(e?.message ?? e).split('\n')[0]);
        }
    }
};
// Sum of the layout shifts the page recorded so far (shifts right after an input do not count).
const layoutShift = (page) => page.evaluate(() => new Promise((resolve) => {
    let total = 0;
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve(total), 500);
}));
const SEED_TERM = 'hyperion popular term check';
let browser = null;
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
// The item prices of an order document page as core's tax renderers print them: including and excluding tax, each
// with the label of its data-label attribute painted before it; core's `no-display` parts hidden.
const taxPrices = (page) => page.evaluate(() => {
    const facts = (selector) => [...document.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        const before = getComputedStyle(el, '::before').content;
        const label = el.getAttribute('data-label') ?? '';
        return { label, before, visible: r.width > 0 && r.height > 0, labeled: label !== '' && before !== 'none' && before !== 'normal' && (before.includes(label) || /attr\(\s*data-label\s*\)/.test(before)) };
    });
    return {
        incl: facts('.price-including-tax'),
        excl: facts('.price-excluding-tax'),
        shownNoDisplay: [...document.querySelectorAll('.no-display')].filter((el) => getComputedStyle(el).display !== 'none').length,
    };
});
const taxPricesShown = (prices) => prices.incl.length > 0 && prices.excl.length > 0
    && [...prices.incl, ...prices.excl].every((p) => p.visible && p.labeled) && prices.shownNoDisplay === 0;
const taxDetail = (prices) => JSON.stringify({ incl: prices.incl.slice(0, 2), excl: prices.excl.slice(0, 2), shownNoDisplay: prices.shownNoDisplay });
// The FPT line of the order row of the FPT product: visible, with its amount.
const fptLine = (page, name) => page.evaluate((needle) => {
    const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(needle));
    const lines = [...(row?.querySelectorAll('.weee, [data-hyperion-fpt]') ?? [])].filter((el) => el.getBoundingClientRect().height > 0);
    return { row: !!row, lines: lines.length, text: lines.map((el) => el.textContent.replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 120), deadInit: row?.querySelectorAll('[data-mage-init]').length ?? -1 };
}, name);
const invoiceCommentShown = (page, text) => page.evaluate((needle) => {
    const shell = document.querySelector('section[aria-labelledby="hyperion-account-heading"]') ?? document.querySelector('#maincontent');
    return !!shell && shell.innerText.includes(needle);
}, text);
let orderId;
let docs;

try {
    // Inside the try: a failing or interrupted set-up still reaches the clean-up below.
    execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURES, 'php-fpm:/tmp/sprint4-fixtures.php']);
    copyFixture('customer-fixture.php');
    copyFixture('vault-token-fixture.php');
    // Registered first, undone last: the fixture files the other steps run.
    undoLater('fixture files removed', () => compose('php-fpm', 'rm -f /tmp/sprint4-fixtures.php /tmp/customer-fixture.php /tmp/vault-token-fixture.php /tmp/weee-demo.php'));
    undoLater('CMS page /hyperion-fallback-check removed', () => console.log(fixtures('remove')));
    console.log(fixtures('page'));
    undoLater('customer of the run deleted', () => console.log('customer fixture:', JSON.stringify(runFixture('customer-fixture.php', `${CUSTOMER.email} --remove`))));
    console.log('customer fixture:', JSON.stringify(runFixture('customer-fixture.php', `${CUSTOMER.email} '${CUSTOMER.password}' --apply`)));
    // Deleting the customer takes its stored tokens with it; the token fixture is removed first all the same.
    undoLater('vault token fixture removed', () => runFixture('vault-token-fixture.php', `${CUSTOMER.email} --remove`));
    if (withFpt) {
        // The FPT demo goes in before the order is placed: the order row keeps the FPT the quote collected. The attribute
        // is removed again only when this run created it.
        const fptCreated = sql(`select count(*) from eav_attribute where attribute_code = '${FPT.attribute}'`) === '0';
        copyFixture('weee-demo.php');
        if (fptCreated) undoLater('FPT demo attribute removed', () => console.log(compose('php-fpm', 'cd /var/www/html && php /tmp/weee-demo.php /var/www/html --remove', 'www-data').trim()));
        console.log(compose('php-fpm', 'cd /var/www/html && php /tmp/weee-demo.php /var/www/html', 'www-data').trim());
        runConfig.set('tax/weee/enable', 1);
        // Core's value 1: including FPT and the FPT description.
        runConfig.set('tax/weee/display_sales', 1);
    }
    magento('cache:flush');
    browser = await chromium.launch({ headless: true, ...launchOptions() });
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

        await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
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
        await page.goto(base + u('/gear/bags.html'), { waitUntil: 'networkidle' });
        await Promise.all([page.waitForResponse((r) => r.url().includes('/catalog/product_compare/add')), page.click('[data-hyperion-tile] hyperion-list-toggle[kind="compare"] button')]);
        // window.print stubbed before the page runs: the button must call it once.
        await page.addInitScript(() => {
            window.__hyperionPrintCalls = 0;
            window.print = () => { window.__hyperionPrintCalls += 1; };
        });
        await page.goto(base + '/catalog/product_compare/', { waitUntil: 'networkidle' });
        check('compare page: a single h1', (await pageFacts(page)).h1 === 1, String((await pageFacts(page)).h1));
        const printButton = page.locator('button[type="button"][data-hyperion-print]');
        const printFacts = { buttons: await printButton.count(), text: ((await printButton.first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim() };
        if (printFacts.buttons === 1) {
            await printButton.click();
            await page.waitForTimeout(300);
        }
        printFacts.calls = await page.evaluate(() => window.__hyperionPrintCalls);
        check('compare page: one Print This Page button, a click calls window.print once', printFacts.buttons === 1 && printFacts.text !== '' && printFacts.calls === 1, JSON.stringify(printFacts));
        await page.emulateMedia({ media: 'print' });
        check('compare page: the print button is hidden when the page is printed', printFacts.buttons === 1 && !(await printButton.isVisible()));
        await page.emulateMedia({ media: 'screen' });

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
        for (const productPath of ORDER_PRODUCTS) {
            await page.goto(base + u(productPath), { waitUntil: 'networkidle' });
            await page.click('#product_addtocart_form button[type="submit"]');
            await toast(page);
        }
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

        // The failure page: core serves it only to the session of the last order.
        const failureResponse = await page.goto(base + '/checkout/onepage/failure/', { waitUntil: 'networkidle' });
        const failureFacts = await pageFacts(page);
        const failure = await page.evaluate(() => {
            const root = document.querySelector('[data-hyperion-checkout-failure]');
            const links = [...(root?.querySelectorAll('a[href]') ?? [])].map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), path: new URL(a.href).pathname.replace(/\/+$/, '') || '/', host: new URL(a.href).host }));
            return {
                roots: document.querySelectorAll('[data-hyperion-checkout-failure]').length,
                heading: (root?.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                text: (root?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                links,
                home: new URL(document.baseURI).host,
                title: document.title,
                card: root ? getComputedStyle(root.firstElementChild).borderTopWidth !== '0px' : false,
            };
        });
        const cartLink = failure.links.find((l) => l.path.endsWith('/checkout/cart'));
        const homeLink = failure.links.find((l) => l.path === '/' || l.path === new URL(base).pathname.replace(/\/+$/, ''));
        check('checkout failure page: served to the session of the order, with the heading as the only h1 and the styled card', failureResponse?.status() === 200 && page.url().includes('/checkout/onepage/failure') && failure.roots === 1 && failure.heading === 'Your order could not be completed' && failureFacts.h1 === 1 && failure.card && failure.title.includes(failure.heading), JSON.stringify({ status: failureResponse?.status(), url: page.url().replace(base, ''), heading: failure.heading, h1: failureFacts.h1, title: failure.title }));
        check('checkout failure page: the order number of the session is printed', failure.text.includes(orderId), failure.text.slice(0, 160));
        check('checkout failure page: one link back to the cart and one to the store, both on this site', !!cartLink && !!homeLink && cartLink !== homeLink && [cartLink, homeLink].every((l) => l.host === failure.home && l.text !== ''), JSON.stringify(failure.links));
        check('checkout failure page: no data-mage-init, no x-magento-init, no core markup', failureFacts.deadInit === 0 && failureFacts.luma === 0, JSON.stringify({ deadInit: failureFacts.deadInit, luma: failureFacts.luma }));
        {
            // A visitor without an order is sent to the cart, as core does.
            const stranger = await browser.newContext({ ignoreHTTPSErrors: true });
            const strangerPage = await stranger.newPage();
            await strangerPage.goto(base + '/checkout/onepage/failure/', { waitUntil: 'domcontentloaded' });
            check('checkout failure page: a session without an order lands on the cart', strangerPage.url().replace(/\/+$/, '').endsWith('/checkout/cart') && await strangerPage.locator('[data-hyperion-checkout-failure]').count() === 0, strangerPage.url().replace(base, ''));
            await stranger.close();
        }
        docs = JSON.parse(fixtures(`documents ${orderId}`));
        check('fixtures: invoice, tracked shipment and refund created', docs.invoice_id > 0 && docs.shipment_id > 0 && docs.creditmemo_id > 0 && !!docs.tracking_url, JSON.stringify(docs));
        // The order documents from here to the end of the guest pages: prices including and excluding tax (core's
        // value 3, "both") and RSS on.
        for (const [configPath, value] of [['tax/sales_display/price', 3], ['rss/config/active', 1], ['rss/catalog/category', 1], ['rss/order/status', 1]]) runConfig.set(configPath, value);
        flushCaches();

        await page.goto(base + `/sales/order/view/order_id/${docs.order_id}/`, { waitUntil: 'networkidle' });
        const viewPrices = await taxPrices(page);
        check('order view: each item price shows including and excluding tax, both labeled', taxPricesShown(viewPrices), taxDetail(viewPrices));
        const orderFeed = await page.evaluate(() => [...document.querySelectorAll('a[href*="/rss/feed/index/type/order_status"]')].map((a) => a.href));
        check('order view: links the order status RSS feed while the feed is on', orderFeed.length === 1, orderFeed.join(' ').replace(base, ''));
        if (withFpt) {
            const fpt = await fptLine(page, FPT.product);
            check('order view: the row of the FPT product shows its FPT line, no data-mage-init', fpt.row && fpt.lines > 0 && fpt.text.includes('5.00') && fpt.deadInit === 0, JSON.stringify(fpt));
        }
        await page.goto(base + `/sales/order/invoice/order_id/${docs.order_id}/`, { waitUntil: 'networkidle' });
        const invoicePrices = await taxPrices(page);
        const invoicePage = await pageFacts(page);
        check('invoice page: each item price shows including and excluding tax, both labeled', taxPricesShown(invoicePrices), taxDetail(invoicePrices));
        check('invoice page: the visible invoice comment is printed, no data-mage-init', await invoiceCommentShown(page, docs.invoice_comment) && invoicePage.deadInit === 0, JSON.stringify({ comment: docs.invoice_comment, deadInit: invoicePage.deadInit }));
        if (withFpt) {
            const fpt = await fptLine(page, FPT.product);
            check('invoice page: the row of the FPT product shows its FPT line', fpt.row && fpt.lines > 0 && fpt.deadInit === 0, JSON.stringify(fpt));
        }

        // Core links the category feed on top level categories only.
        await page.goto(base + u('/gear.html'), { waitUntil: 'networkidle' });
        const categoryFeed = await page.evaluate(() => [...document.querySelectorAll('a[href*="/rss/feed/index/type/category"]')].map((a) => ({ href: a.href, text: a.textContent.replace(/\s+/g, ' ').trim() })));
        check('top level category page: one RSS link with a visible name while the category feed is on', categoryFeed.length === 1 && categoryFeed[0].text !== '', JSON.stringify(categoryFeed).replace(base, ''));
        if (categoryFeed.length) {
            const feed = await j.ctx.request.get(categoryFeed[0].href);
            const body = await feed.text();
            check('category RSS feed: answers 200 with an XML feed', feed.status() === 200 && /xml/.test(feed.headers()['content-type'] ?? '') && /<rss[\s>]/.test(body), `${feed.status()} ${feed.headers()['content-type']} ${body.slice(0, 80)}`);
        }
        // Core's list of feeds is the rss/index/index route; rss/feed/index answers a single feed by its type.
        const listResponse = await page.goto(base + '/rss/', { waitUntil: 'networkidle' });
        const feedList = await page.evaluate(() => ({
            lists: document.querySelectorAll('#maincontent [data-hyperion-rss-feeds]').length,
            links: document.querySelectorAll('#maincontent a[href*="/rss/feed/index/type/"]').length,
            coreTable: document.querySelectorAll('#maincontent table.rss, #maincontent table.data.table').length,
        }));
        const feedListFacts = await pageFacts(page);
        check('feed list: /rss/ lists the feeds as links under one heading, no core table', listResponse?.status() === 200 && feedList.lists === 1 && feedList.links > 0 && feedList.coreTable === 0 && feedListFacts.h1 === 1 && feedListFacts.deadInit === 0, JSON.stringify({ status: listResponse?.status(), ...feedList, h1: feedListFacts.h1, deadInit: feedListFacts.deadInit }));

        await page.goto(base + '/vault/cards/listaction/', { waitUntil: 'networkidle' });
        const vault = await pageFacts(page);
        check('stored payment methods: styled inside the account shell', await page.locator('[data-hyperion-vault-cards]').count() === 1 && vault.luma === 0 && vault.deadInit === 0 && /Stored Payment Methods/.test(vault.text), JSON.stringify({ luma: vault.luma, deadInit: vault.deadInit }));

        // A stored PayPal account of the Braintree gateway, rendered by the theme's token template.
        const token = runFixture('vault-token-fixture.php', `${CUSTOMER.email} --apply`);
        if (!token.applied) {
            console.log(`SKIP  stored payment methods: a stored PayPal account row  -- ${token.reason}`);
        } else {
            const listed = await page.goto(base + '/vault/cards/listaction/', { waitUntil: 'networkidle' });
            const stored = await pageFacts(page);
            const row = await page.evaluate(() => {
                const rows = [...document.querySelectorAll('tr[data-hyperion-vault-token]')];
                const tr = rows.find((r) => r.getAttribute('data-hyperion-vault-token') === 'paypal');
                const form = tr?.querySelector('form');
                const icon = tr?.querySelector('img');
                return {
                    rows: rows.length,
                    text: (tr?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                    inStyledTable: !!tr?.closest('table.hyperion-order-table'),
                    iconLoaded: icon ? icon.complete && icon.naturalWidth > 0 : null,
                    iconAlt: icon?.getAttribute('alt') ?? '',
                    action: form ? new URL(form.action).pathname : '',
                    method: form?.method ?? '',
                    confirm: form?.getAttribute('data-hyperion-confirm') ?? '',
                    formKey: form?.querySelector('input[name="form_key"]')?.value ?? '',
                    publicHash: form?.querySelector('input[name="public_hash"]')?.value ?? '',
                    deleteButtons: tr?.querySelectorAll('button[type="submit"][data-hyperion-vault-delete]').length ?? 0,
                    deadInitInRow: tr?.querySelectorAll('[data-mage-init], script').length ?? -1,
                    coreMarkup: document.querySelectorAll('.my-credit-cards, #my-orders-table, .action.delete, .modal-popup').length,
                };
            });
            check(
                'stored payment methods: the PayPal account is one row of the styled accounts table, with the payer and the icon',
                listed?.status() === 200 && row.rows === 1 && row.inStyledTable && row.text.includes(token.payer_email) && row.iconLoaded !== false && (row.iconLoaded === null || row.iconAlt !== ''),
                JSON.stringify({ status: listed?.status(), rows: row.rows, text: row.text.slice(0, 80), icon: row.iconLoaded })
            );
            check(
                'stored payment methods: its Delete is a plain POST form with the form key and the token hash behind the site dialog',
                row.method === 'post' && /\/vault\/cards\/deleteaction\/?$/.test(row.action) && row.confirm.includes(token.payer_email) && row.formKey !== '' && row.publicHash === token.public_hash && row.deleteButtons === 1,
                JSON.stringify({ action: row.action, method: row.method, confirm: row.confirm, formKey: row.formKey !== '', hashMatches: row.publicHash === token.public_hash })
            );
            check(
                'stored payment methods: zero data-mage-init / x-magento-init on the page with the token, no core markup',
                stored.deadInit === 0 && stored.luma === 0 && row.deadInitInRow === 0 && row.coreMarkup === 0,
                JSON.stringify({ deadInit: stored.deadInit, luma: stored.luma, inRow: row.deadInitInRow, core: row.coreMarkup })
            );
            await page.click('tr[data-hyperion-vault-token="paypal"] [data-hyperion-vault-delete]');
            await page.waitForSelector('hyperion-confirm dialog[open]', { timeout: 10000 }).catch(() => {});
            const question = await page.evaluate(() => (document.querySelector('hyperion-confirm dialog[open]')?.textContent ?? '').replace(/\s+/g, ' ').trim());
            const stillListed = sql(`select count(*) from vault_payment_token where public_hash = '${token.public_hash}' and is_active = 1 and is_visible = 1`);
            check('stored payment methods: Delete asks through the site dialog before anything is posted', question.includes(token.payer_email) && stillListed === '1', `${question.slice(0, 120)} | rows ${stillListed}`);
            await Promise.all([
                page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/vault/cards/deleteaction'), { timeout: 30000 }).catch(() => null),
                page.click('hyperion-confirm [data-hyperion-confirm-ok]').catch(() => {}),
            ]);
            await page.waitForLoadState('networkidle').catch(() => {});
            const afterDelete = sql(`select count(*) from vault_payment_token where public_hash = '${token.public_hash}' and is_active = 1 and is_visible = 1`);
            check('stored payment methods: the confirmed Delete removes the account from the list', afterDelete === '0' && await page.locator('tr[data-hyperion-vault-token]').count() === 0 && page.url().includes('/vault/cards/listaction'), `rows ${afterDelete}, url ${page.url().replace(base, '')}`);
        }

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
            if (name === 'order' || name === 'invoice') {
                const prices = await taxPrices(page);
                check(`print ${name}: each item price shows including and excluding tax, both labeled`, taxPricesShown(prices), taxDetail(prices));
            }
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
        const guestViewPrices = await taxPrices(page);
        check('guest order view: each item price shows including and excluding tax, both labeled', taxPricesShown(guestViewPrices), taxDetail(guestViewPrices));
        const tabs = await page.evaluate(() => [...document.querySelectorAll('.hyperion-order-tabs a')].map((a) => new URL(a.href).pathname));
        check('guest order view: styled tabs link the guest invoice, shipment and refund pages', ['invoice', 'shipment', 'creditmemo'].every((doc) => tabs.some((p) => p.includes(`/sales/guest/${doc}/`))), tabs.join(' '));
        for (const [name, doc, printAction, totals] of [
            ['invoice', 'invoice', 'printInvoice', true],
            ['shipment', 'shipment', 'printShipment', false],
            ['refund', 'creditmemo', 'printCreditmemo', true],
        ]) {
            const url = `/sales/guest/${doc}/order_id/${docs.order_id}/`;
            await page.goto(base + url, { waitUntil: 'networkidle' });
            const f = await pageFacts(page);
            const tab = await page.evaluate((action) => {
                const shell = document.querySelector('section[aria-labelledby="hyperion-account-heading"]');
                const prints = [...document.querySelectorAll('a[href*="/print"]')].map((a) => new URL(a.href).pathname);
                return {
                    shell: document.querySelectorAll('section[aria-labelledby="hyperion-account-heading"]').length,
                    info: shell ? shell.querySelectorAll('article').length : 0,
                    rows: shell ? shell.querySelectorAll('.hyperion-order-table tbody tr').length : 0,
                    grandTotal: shell ? /grand total/i.test(shell.textContent) : false,
                    guestPrint: prints.filter((p) => p.includes(`/sales/guest/${action}/`)).length,
                    accountPrint: prints.filter((p) => p.includes('/sales/order/')).length,
                    currentTab: document.querySelectorAll('.hyperion-order-tabs .current').length,
                };
            }, printAction);
            check(`guest ${name} tab: Hyperion shell with the info card, the items${totals ? ', the totals' : ''} and guest print links, no core markup`, page.url().includes(url) && tab.shell === 1 && tab.info >= 2 && tab.rows > 0 && (!totals || tab.grandTotal) && tab.guestPrint > 0 && tab.accountPrint === 0 && tab.currentTab === 1 && f.luma === 0 && f.deadInit === 0 && f.h1 === 1, JSON.stringify({ ...tab, luma: f.luma, deadInit: f.deadInit, h1: f.h1, url: page.url().replace(base, '') }));
            if (name === 'invoice') {
                const prices = await taxPrices(page);
                check('guest invoice tab: each item price shows including and excluding tax, both labeled', taxPricesShown(prices), taxDetail(prices));
                check('guest invoice tab: the visible invoice comment is printed', await invoiceCommentShown(page, docs.invoice_comment), docs.invoice_comment);
            }
            // X-Magento-Debug asks the VCL for the cache verdict, which is stripped otherwise.
            const verdict = (await j.ctx.request.get(base + url, { headers: { 'X-Magento-Debug': '1' } })).headers()['x-magento-cache-debug'] || '';
            check(`guest ${name} tab: the page is never cached`, verdict === 'UNCACHEABLE', verdict || 'no verdict header');
        }
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
            if (name === 'order' || name === 'invoice') {
                const prices = await taxPrices(page);
                check(`guest print ${name}: each item price shows including and excluding tax, both labeled`, taxPricesShown(prices), taxDetail(prices));
            }
        }
        check('guest: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
        for (const configPath of ['tax/sales_display/price', 'rss/config/active', 'rss/catalog/category', 'rss/order/status']) runConfig.restore(configPath);
        flushCaches();
    }

    // ------------------------------------------------------------ account dashboard: recently viewed products
    {
        // A fresh browser: the history of the viewed products lives in the browser, so it starts empty.
        const j = await newJourney();
        const { page } = j;
        check('dashboard: login', await login(page), page.url().replace(base, ''));
        const viewed = () => page.evaluate(() => {
            const hosts = [...document.querySelectorAll('#maincontent hyperion-recently-viewed[kind="viewed"]')];
            return {
                hosts: hosts.length,
                height: Math.round(hosts.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)),
                links: hosts.flatMap((el) => [...el.querySelectorAll('article a[href]')].map((a) => new URL(a.href).pathname)),
            };
        });
        await page.goto(base + '/customer/account/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        const empty = await viewed();
        check('dashboard: with an empty history the recently viewed block renders nothing', empty.links.length === 0 && empty.height === 0, JSON.stringify(empty));
        await page.goto(base + u('/fusion-backpack.html'), { waitUntil: 'networkidle' });
        await page.goto(base + '/customer/account/', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!document.querySelector('#maincontent hyperion-recently-viewed[kind="viewed"] article a[href]'), null, { timeout: 15000 }).catch(() => {});
        const filled = await viewed();
        check('dashboard: after a product view the recently viewed block lists that product', filled.hosts === 1 && filled.height > 0 && filled.links.some((p) => p.includes('fusion-backpack')), JSON.stringify(filled));
        check('dashboard: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ popular search terms, email a friend, privacy policy menu
    {
        const j = await newJourney();
        const { page } = j;
        await page.goto(base + '/catalogsearch/result/?q=bag', { waitUntil: 'networkidle' });
        if (sql('select count(*) from search_query where store_id = 1 and num_results > 0') === '0') {
            undoLater('seeded search term removed', () => sql(`delete from search_query where query_text = '${SEED_TERM}'`));
            sql(`insert into search_query (query_text, num_results, popularity, store_id, is_active, is_processed) values ('${SEED_TERM}', 3, 2, 1, 1, 1)`);
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

        runConfig.set('sendfriend/email/enabled', 0);
        magento('cache:flush');
        await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
        check('email a friend: no link on the product page while the feature is off', await page.locator('[data-hyperion-sendfriend-link]').count() === 0);

        runConfig.set('sendfriend/email/enabled', 1);
        runConfig.set('sendfriend/email/allow_guest', 1);
        magento('cache:flush');
        await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
        const link = page.locator('[data-hyperion-sendfriend-link]');
        const sendUrl = (await link.count()) ? await link.getAttribute('href') : '';
        check('email a friend: the product page links to sendfriend/product/send once the feature is on', /\/sendfriend\/product\/send\/id\/\d+\//.test(sendUrl), sendUrl.replace(base, ''));
        if (sendUrl) {
            const maxRecipients = Number(configValue('sendfriend/email/max_recipients') || 5);
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

    // ------------------------------------------------------------ footer service links, demo store notice
    {
        const j = await newJourney();
        const { page } = j;
        await page.goto(base + '/', { waitUntil: 'networkidle' });
        const footer = await page.evaluate(() => ({
            links: [...document.querySelectorAll('#hyperion-footer [data-hyperion-footer-service] a')].map((a) => ({ href: a.href, path: new URL(a.href).pathname.replace(/(\/index)*\/*$/, '').toLowerCase() })),
            coreList: document.querySelectorAll('ul.footer.links').length,
        }));
        const advanced = footer.links.find((l) => l.path.endsWith('/catalogsearch/advanced'));
        const paths = footer.links.map((l) => l.path);
        check('footer: the customer service column links the advanced search', !!advanced, paths.join(' '));
        check('footer: each service link appears once and core\'s own link list is not printed', paths.length > 0 && new Set(paths).size === paths.length && footer.coreList === 0, JSON.stringify({ paths, coreList: footer.coreList }));
        if (advanced) {
            const response = await page.goto(advanced.href, { waitUntil: 'networkidle' });
            check('footer: the advanced search page answers 200', response?.status() === 200, String(response?.status()));
        }

        runConfig.set('design/head/demonotice', 1);
        magento('cache:flush');
        for (const [device, viewport] of [['desktop', { width: 1366, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
            await page.setViewportSize(viewport);
            await page.goto(base + '/', { waitUntil: 'networkidle' });
            const shift = await layoutShift(page);
            const notice = await page.evaluate(() => {
                const bar = document.querySelector('[data-hyperion-notice="demo"]');
                const header = document.querySelector('header[role="banner"]');
                const paint = (el) => (el ? getComputedStyle(el).backgroundColor : '');
                const transparent = (color) => color === '' || color === 'transparent' || /,\s*0\)$/.test(color);
                const barPaint = paint(bar?.querySelector('p'));
                return {
                    count: document.querySelectorAll('[data-hyperion-notice="demo"]').length,
                    role: bar?.getAttribute('role') || '',
                    text: bar?.textContent.trim().length || 0,
                    barPaint,
                    pagePaint: paint(document.body),
                    tinted: !transparent(barPaint) && barPaint !== paint(document.body) && barPaint !== paint(document.documentElement),
                    // The root's own box: `clientWidth` still counts a reserved scrollbar gutter (`scrollbar-gutter: stable`).
                    fullWidth: bar ? Math.abs(bar.getBoundingClientRect().width - document.documentElement.getBoundingClientRect().width) <= 1 : false,
                    aboveHeader: !!(bar && header && (bar.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING)),
                    coreMarkup: document.querySelectorAll('.message.global').length,
                };
            });
            check(`demo store notice (${device}): one styled full-width bar above the header`, notice.count === 1 && notice.role === 'note' && notice.text > 0 && notice.tinted && notice.fullWidth && notice.aboveHeader && notice.coreMarkup === 0, JSON.stringify(notice));
            check(`demo store notice (${device}): the page has no layout shift`, shift === 0, shift.toFixed(4));
            await page.evaluate(() => window.scrollTo(0, 600));
            await page.waitForTimeout(300);
            const sticky = await page.evaluate(() => ({
                scrolled: window.scrollY,
                headerTop: Math.round(document.querySelector('.page-header')?.getBoundingClientRect().top ?? -1),
                barBottom: Math.round(document.querySelector('[data-hyperion-notice="demo"]')?.getBoundingClientRect().bottom ?? 1),
            }));
            check(`demo store notice (${device}): the bar scrolls away and the header stays at the top`, sticky.scrolled > 0 && sticky.headerTop === 0 && sticky.barBottom <= 0, JSON.stringify(sticky));
        }
        runConfig.restore('design/head/demonotice');
        magento('cache:flush');
        await page.goto(base + '/', { waitUntil: 'networkidle' });
        check('demo store notice: no bar once the setting is back', previousConfig.demoNotice.value === '1' || await page.locator('[data-hyperion-notice="demo"]').count() === 0);
        check('footer and notice: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
        await j.ctx.close();
    }

    // ------------------------------------------------------------ phones: nothing is wider than the page
    {
        // Mobile emulation gives the layout the whole width (overlay scrollbars), like a real phone.
        for (const width of [360, 375]) {
            const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
            const page = await ctx.newPage();
            const wide = [];
            for (const [name, target] of [['home page', '/'], ['category page', u('/gear/bags.html')]]) {
                await page.goto(base + target, { waitUntil: 'networkidle' });
                const sizes = await page.evaluate(() => ({
                    scrollWidth: document.documentElement.scrollWidth,
                    pageWidth: Math.ceil(document.documentElement.getBoundingClientRect().width),
                }));
                if (sizes.scrollWidth > sizes.pageWidth) wide.push(`${name} ${JSON.stringify(sizes)}`);
            }
            check(`phone: the page does not scroll sideways at ${width} px`, wide.length === 0, wide.join(' | '));
            await ctx.close();
        }
    }

    // ------------------------------------------------------------ newsletter form while Google's reCAPTCHA script cannot load
    {
        // Core's values of `type_for/*` and the configuration group that holds each type's keys.
        const keyed = ['recaptcha_v3', 'invisible', 'recaptcha'].filter((type) => configValue(`recaptcha_frontend/type_${type}/public_key`));
        const type = keyed.includes(previousConfig.recaptchaNewsletter.value) ? previousConfig.recaptchaNewsletter.value : keyed[0];
        if (!type) {
            check('newsletter with reCAPTCHA blocked: the store has no reCAPTCHA key pair (skipped)', true);
        } else {
            if (previousConfig.recaptchaNewsletter.value !== type) {
                runConfig.set('recaptcha_frontend/type_for/newsletter', type);
                magento('cache:flush');
            }
            const j = await newJourney();
            const { page } = j;
            const blocked = [];
            await j.ctx.route((url) => ['www.google.com', 'www.gstatic.com', 'www.recaptcha.net'].includes(url.hostname) && url.pathname.includes('/recaptcha/'), (route) => {
                blocked.push(route.request().url());
                return route.abort();
            });
            const posts = [];
            page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/newsletter/subscriber/new')) posts.push(r.url()); });
            await page.goto(base + '/', { waitUntil: 'networkidle' });
            const form = '#hyperion-footer form#newsletter-validate-detail';
            check('newsletter with reCAPTCHA blocked: the form carries the reCAPTCHA element', await page.locator(`${form} hyperion-recaptcha`).count() === 1);
            await page.fill(`${form} input[name="email"]`, `hyperion.recaptcha.${Date.now()}@example.com`);
            await Promise.all([
                page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/newsletter/subscriber/new'), { timeout: 30000 }).catch(() => null),
                page.click(`${form} button[type="submit"]`, { timeout: 10000, noWaitAfter: true }).catch(() => {}),
            ]);
            await page.waitForSelector('[data-hyperion-messages] [role="alert"]', { timeout: 20000 }).catch(() => {});
            await page.waitForTimeout(1000);
            // A page stuck in a submit loop never answers: the round trip is the responsiveness probe.
            const responsive = await Promise.race([
                page.evaluate(() => true).catch(() => false),
                new Promise((resolve) => { setTimeout(() => resolve(false), 2000); }),
            ]);
            check('newsletter with reCAPTCHA blocked: the tab stays responsive', responsive === true);
            const message = responsive ? await page.evaluate(() => document.querySelector('[data-hyperion-messages] [role="alert"]')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 140) || '') : '';
            check('newsletter with reCAPTCHA blocked: Google\'s script was requested and refused', blocked.length > 0, String(blocked.length));
            check('newsletter with reCAPTCHA blocked: the form is posted exactly once', posts.length === 1, String(posts.length));
            check('newsletter with reCAPTCHA blocked: the server answers with a message', message.length > 0, message);
            // The refused script is a failed request and a console warning, never a page error.
            check('newsletter with reCAPTCHA blocked: no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
            await Promise.race([j.ctx.close(), new Promise((resolve) => { setTimeout(resolve, 5000); })]);
        }
    }
} finally {
    await browser?.close();
    undoAll();
    const notRestored = runConfig.restoreAll();
    if (notRestored.length) check('restore: settings of the run put back', false, notRestored.join(', '));
    flushCaches();
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

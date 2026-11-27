// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the sidebar placement (wishlist / compare sidebars of
// Magento_Theme/layout/default.xml): 2columns-left keeps both rails on the
// left with the additional sidebar under the filters, 2columns-right mirrors
// it, 3columns splits them, 1column prints the additional sidebar under the
// inline filter bar above the product grid (category/view.phtml), the account
// pages print it under the account menu, and a disabled wishlist (feature or
// sidebar setting) renders no wishlist sidebar at all. Recently Ordered: the
// account sidebar of a customer with orders lists their items and its form
// adds the ticked one to the cart (the line is removed again at the end); a
// guest never sees it and no category page renders it. Logs in as the sample
// customer (the caller clears the customer_login reCAPTCHA type for the
// run, see docs/development.md),
// adds one wishlist item and two compare items from the category tiles,
// switches the category page layout for the run and restores everything.
// node e2e/pw-sidebars.mjs <baseUrl> <slotDir> [shotsDir]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
import path from 'node:path';
import fs from 'node:fs';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeConfigSnapshot } from './lib/config-snapshot.mjs';
const base = (process.argv[2] || '').replace(/\/$/, '');
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> ...');
    process.exit(2);
}
const slotDir = path.resolve(process.argv[3] || '.');
const shots = process.argv[4] ? path.resolve(process.argv[4]) : '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 260) : ''}`); };
const compose = (service, cmd, user) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...(user ? ['-u', user] : []), service, 'bash', '-c', cmd], { encoding: 'utf8' });
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const sql = (q) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(q)} 2>/dev/null`);
const flush = () => { magento('cache:flush >/dev/null'); try { compose('varnish', "varnishadm ban 'req.url ~ .' >/dev/null"); } catch { /* none */ } };
const { configSnapshot, restoreConfig } = makeConfigSnapshot(sql);
// The two wish list settings the run switches, as stored before it.
const WISHLIST_PATHS = ['wishlist/general/active', 'wishlist/general/show_in_sidebar'];
const previousWishlist = WISHLIST_PATHS.map((configPath) => [configPath, configSnapshot(configPath)]);
const categoryPath = u('/men/tops-men.html');
const attrId = sql("SELECT attribute_id FROM eav_attribute WHERE attribute_code='page_layout' AND entity_type_id=(SELECT entity_type_id FROM eav_entity_type WHERE entity_type_code='catalog_category')").trim();
const catId = sql("SELECT entity_id FROM catalog_category_entity WHERE entity_id IN (SELECT entity_id FROM catalog_category_entity_varchar WHERE attribute_id=(SELECT attribute_id FROM eav_attribute WHERE attribute_code='url_key' AND entity_type_id=(SELECT entity_type_id FROM eav_entity_type WHERE entity_type_code='catalog_category')) AND value='tops-men') LIMIT 1").trim();
const setLayout = (layout) => { sql(`DELETE FROM catalog_category_entity_varchar WHERE attribute_id=${attrId} AND entity_id=${catId}`); if (layout) sql(`INSERT INTO catalog_category_entity_varchar (attribute_id, store_id, entity_id, value) VALUES (${attrId}, 0, ${catId}, '${layout}')`); flush(); };
// An interrupted run puts the layout, the wish list settings and the cart lines back too.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
        console.error(`\n${signal}: restoring the install`);
        try { setLayout(''); } catch { /* reported by the next run */ }
        for (const [configPath, snapshot] of previousWishlist) { try { restoreConfig(configPath, snapshot); } catch { /* idem */ } }
        try { removeReorderLines(); flush(); } catch { /* idem */ }
        process.exit(130);
    });
}
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const problems = [];
// Right after a cache flush + Varnish ban the backend can answer 503 for a moment: retry a navigation on 5xx.
const open = async (p, url, options) => { for (let i = 0; i < 4; i++) { const r = await p.goto(url, options); if (!r || r.status() < 500) return r; await new Promise((res) => setTimeout(res, 2500)); } return null; };
page.on('pageerror', (e) => problems.push(e.message.slice(0, 100)));
page.on('response', (r) => { if (r.status() >= 500 && !/tops-men\.html$/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 80)}`); });
const geometry = () => page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 }; };
    return { columns: box('.page-columns'), main: box('.column.main'), filters: box('.sidebar-main'), inlineFilters: box('[data-hyperion-inline-filters]'), inlineSidebar: box('[data-hyperion-inline-sidebar]'), additional: box('#maincontent > div > .sidebar-additional'), wishlist: box('[data-hyperion-wishlist-sidebar]'), compare: box('[data-hyperion-compare-sidebar]'), accountNav: box('hyperion-account-nav'), accountSidebar: box('[data-hyperion-account-shell] .sidebar-additional'), grid: box('#hyperion-product-grid, [data-hyperion-list-mode]') };
});
// The tile controls toggle: start from empty lists so the clicks add (the sample customer's lists are test data).
// The Recently Ordered block of the account sidebar, and the cart lines it added (removed at the end).
const REORDER = '[data-hyperion-reorder-sidebar]';
const reorderAdded = [];
const removeReorderLines = () => {
    if (!reorderAdded.length) return;
    const ids = reorderAdded.map(Number).filter(Boolean).join(',');
    sql(`UPDATE quote SET trigger_recollect = 1 WHERE entity_id IN (SELECT quote_id FROM quote_item WHERE item_id IN (${ids})); DELETE FROM quote_item WHERE item_id IN (${ids}) OR parent_item_id IN (${ids})`);
    reorderAdded.length = 0;
};
const clearLists = () => sql("DELETE FROM wishlist_item WHERE wishlist_id IN (SELECT wishlist_id FROM wishlist WHERE customer_id = (SELECT entity_id FROM customer_entity WHERE email = 'roni_cost@example.com')); DELETE FROM catalog_compare_item WHERE customer_id = (SELECT entity_id FROM customer_entity WHERE email = 'roni_cost@example.com')");
try {
    setLayout('');
    clearLists();
    // login (the caller cleared the customer_login reCAPTCHA type for the run)
    await page.goto(base + '/customer/account/login/', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="login[username]"]', 'roni_cost@example.com');
    await page.fill('input[name="login[password]"]', 'roni_cost3@example.com');
    // The dashboard URL only: /customer/account/login/ also contains "customer/account" (a failed login would pass otherwise).
    await Promise.all([page.waitForURL(/customer\/account\/?(\?.*)?$/, { timeout: 20000 }), page.click('form[action*="loginPost"] button[type="submit"]')]);
    check('login as customer', /customer\/account\/?(\?.*)?$/.test(page.url()), page.url().replace(base, ''));
    // put one product in the wishlist and two in the compare list from the category tiles
    await open(page, base + categoryPath, { waitUntil: 'domcontentloaded' });
    const toggles = page.locator('hyperion-list-toggle[kind="wishlist"] button, hyperion-list-toggle[kind="wishlist"] form button');
    await toggles.first().click(); await page.waitForTimeout(1500);
    const compares = page.locator('hyperion-list-toggle[kind="compare"] button, hyperion-list-toggle[kind="compare"] form button');
    await compares.nth(0).click(); await page.waitForTimeout(1200); await compares.nth(1).click(); await page.waitForTimeout(1500);
    // 2columns-left (category default)
    await open(page, base + categoryPath, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    let g = await geometry();
    if (shots) await page.screenshot({ path: path.join(shots, 'sidebars_2columns_left.png') });
    check('2columns-left: wishlist and compare render in the LEFT rail right under the filters', g.wishlist?.visible && g.compare?.visible && g.additional && g.filters && g.additional.x === g.filters.x && g.additional.y >= g.filters.y + g.filters.h - 1 && g.additional.y - (g.filters.y + g.filters.h) <= 40 && g.additional.x + g.additional.w <= g.main.x, JSON.stringify({ filters: g.filters, additional: g.additional, main: g.main }));
    // 2columns-right
    setLayout('2columns-right');
    await open(page, base + categoryPath, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    g = await geometry();
    if (shots) await page.screenshot({ path: path.join(shots, 'sidebars_2columns_right.png') });
    check('2columns-right: both rails on the RIGHT, additional under the filters', g.additional && g.filters && g.additional.x === g.filters.x && g.additional.x >= g.main.x + g.main.w && g.additional.y >= g.filters.y + g.filters.h - 1, JSON.stringify({ filters: g.filters, additional: g.additional, main: g.main }));
    // 3columns
    setLayout('3columns');
    await open(page, base + categoryPath, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    g = await geometry();
    if (shots) await page.screenshot({ path: path.join(shots, 'sidebars_3columns.png') });
    check('3columns: filters left, products center, additional right', g.filters && g.additional && g.filters.x + g.filters.w <= g.main.x && g.additional.x >= g.main.x + g.main.w && Math.abs(g.additional.y - g.filters.y) < 4, JSON.stringify({ filters: g.filters, additional: g.additional, main: g.main }));
    // 1column
    setLayout('1column');
    await open(page, base + categoryPath, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    g = await geometry();
    if (shots) await page.screenshot({ path: path.join(shots, 'sidebars_1column.png') });
    check('1column: sidebars under the inline filters, above the product grid, once', g.inlineFilters && g.inlineSidebar && g.grid && g.inlineSidebar.y >= g.inlineFilters.y + g.inlineFilters.h - 1 && g.inlineSidebar.y + g.inlineSidebar.h <= g.grid.y + 1 && (await page.locator('[data-hyperion-wishlist-sidebar]').count()) === 1, JSON.stringify({ inlineFilters: g.inlineFilters, inlineSidebar: g.inlineSidebar, grid: g.grid }));
    setLayout('');
    // account page
    await open(page, base + '/customer/account/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    g = await geometry();
    if (shots) await page.screenshot({ path: path.join(shots, 'sidebars_account.png') });
    check('account: sidebars in the left column under the account menu', g.accountNav && g.accountSidebar && g.wishlist?.visible && g.accountSidebar.x === g.accountNav.x && g.accountSidebar.y >= g.accountNav.y + g.accountNav.h - 1 && !g.additional, JSON.stringify({ nav: g.accountNav, sidebar: g.accountSidebar, pageLayoutWrapper: g.additional }));
    check('account: no right-hand sidebar wrapper anywhere', (await page.locator('#maincontent > div > .sidebar-additional:visible').count()) === 0);
    check('account: the content starts at the container edge (no empty rail)', g.columns && g.main && g.main.x - g.columns.x <= 24 && g.main.w >= g.columns.w - 48, JSON.stringify({ columns: g.columns, main: g.main }));
    // Recently Ordered: the sample customer has orders, so the account sidebar lists their items.
    const reorder = await page.evaluate((sel) => {
        const root = document.querySelector(sel);
        const form = root?.querySelector('form[action*="checkout/cart/addgroup"]');
        const boxes = [...(form?.querySelectorAll('input[type="checkbox"][name="order_items[]"]') ?? [])];
        return {
            count: document.querySelectorAll(sel).length,
            inAccountSidebar: !!root?.closest('[data-hyperion-account-shell] .sidebar-additional, [data-hyperion-account-shell] aside'),
            visible: !!root && root.getBoundingClientRect().height > 0,
            method: form?.getAttribute('method') ?? '',
            formKey: !!form?.querySelector('input[name="form_key"]'),
            items: boxes.length,
            enabled: boxes.filter((b) => !b.disabled).length,
            deadInit: root?.querySelectorAll('[data-mage-init], script[type="text/x-magento-init"]').length ?? -1,
        };
    }, REORDER);
    check('account: Recently Ordered is in the account sidebar with a POST form, the form key and at most five items', reorder.count === 1 && reorder.visible && reorder.inAccountSidebar && reorder.method.toLowerCase() === 'post' && reorder.formKey && reorder.items > 0 && reorder.items <= 5 && reorder.deadInit === 0, JSON.stringify(reorder));
    if (reorder.enabled > 0) {
        const quoteItems = () => sql(`SELECT GROUP_CONCAT(i.item_id) FROM quote_item i JOIN quote q ON q.entity_id = i.quote_id WHERE q.is_active = 1 AND q.customer_id = (SELECT entity_id FROM customer_entity WHERE email = 'roni_cost@example.com') AND i.parent_item_id IS NULL`).trim().replace(/^NULL$/, '');
        const before = new Set(quoteItems().split(',').filter(Boolean));
        const ticked = await page.evaluate((sel) => {
            const box = [...document.querySelectorAll(`${sel} input[type="checkbox"][name="order_items[]"]`)].find((b) => !b.disabled);
            const label = box ? document.querySelector(`label[for="${box.id}"]`) : null;
            return { id: box?.id ?? '', name: (label?.textContent ?? '').replace(/\s+/g, ' ').trim() };
        }, REORDER);
        await page.check(`#${ticked.id}`);
        // Core's addgroup goes back to the page of the form (or to the cart with "redirect to cart" on).
        await Promise.all([page.waitForNavigation({ timeout: 30000 }).catch(() => {}), page.click(`${REORDER} form button[type="submit"]`)]);
        await page.waitForLoadState('networkidle').catch(() => {});
        const added = quoteItems().split(',').filter((id) => id && !before.has(id));
        reorderAdded.push(...added);
        await open(page, base + '/checkout/cart/', { waitUntil: 'networkidle' });
        const cartNames = await page.evaluate(() => [...document.querySelectorAll('[data-hyperion-cart-item]')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
        check('account: Recently Ordered adds the ticked item to the cart', ticked.name !== '' && cartNames.some((text) => text.includes(ticked.name)) && added.length >= 1, JSON.stringify({ ticked: ticked.name, added: added.length }));
    } else {
        check('account: Recently Ordered offers at least one item that can be added (every item is out of stock)', false, JSON.stringify(reorder));
    }
    await open(page, base + categoryPath, { waitUntil: 'networkidle' });
    check('category page as a customer with orders: no Recently Ordered block', (await page.locator(REORDER).count()) === 0 && (await page.locator('form[action*="checkout/cart/addgroup"]').count()) === 0);
    // a guest on 3columns: the wishlist / compare rail is empty, the page keeps two columns
    const guest = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
    const guestPage = await guest.newPage();
    setLayout('3columns');
    await open(guestPage, base + categoryPath, { waitUntil: 'networkidle' });
    const guestGrid = await guestPage.evaluate(() => { const c = document.querySelector('.page-columns'); const m = document.querySelector('.column.main'); return { columns: getComputedStyle(c).gridTemplateColumns.split(' ').length, mainRight: Math.round(m.getBoundingClientRect().right), columnsRight: Math.round(c.getBoundingClientRect().right) }; });
    check('3columns as a guest: the empty right rail goes, the content reaches the container edge', guestGrid.columns === 2 && guestGrid.columnsRight - guestGrid.mainRight <= 24, JSON.stringify(guestGrid));
    // A guest never gets Recently Ordered: not on a category, not on the home page, not on the sign in page.
    const guestReorder = [];
    for (const target of [categoryPath, '/', '/customer/account/login/', '/customer/account/']) {
        await open(guestPage, base + target, { waitUntil: 'networkidle' });
        const found = (await guestPage.locator(REORDER).count()) + (await guestPage.locator('form[action*="checkout/cart/addgroup"]').count());
        if (found) guestReorder.push(`${target}: ${found}`);
    }
    check('guest: no Recently Ordered block on the category, home, sign in and account pages', guestReorder.length === 0, guestReorder.join(' | '));
    await guest.close();
    setLayout('');
    // wishlist feature off: no wishlist sidebar element at all
    magento('config:set wishlist/general/active 0 >/dev/null'); flush();
    await open(page, base + categoryPath, { waitUntil: 'networkidle' });
    check('wishlist disabled: the wishlist sidebar is not rendered, compare still is', (await page.locator('hyperion-wishlist-sidebar').count()) === 0 && (await page.locator('hyperion-compare-sidebar').count()) === 1);
    magento('config:set wishlist/general/show_in_sidebar 0 >/dev/null; bin/magento config:set wishlist/general/active 1 >/dev/null'); flush();
    await open(page, base + categoryPath, { waitUntil: 'networkidle' });
    check('wishlist sidebar switched off in config: not rendered', (await page.locator('hyperion-wishlist-sidebar').count()) === 0);
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 3).join(' | '));
} finally {
    setLayout('');
    for (const [configPath, snapshot] of previousWishlist) restoreConfig(configPath, snapshot);
    clearLists();
    removeReorderLines();
    flush();
    await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }));
process.exit(failed.length ? 1 : 0);

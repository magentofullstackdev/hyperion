// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the Hyperion Mega Menu (admin side): creates a
// temporary admin user on the install (`bin/magento admin:user:create`, removed
// at the end), signs in with it, creates a group through the form, opens the builder,
// imports the categories, selects a node (the inspector form arrives by
// fetch), saves a badge, drags a root item above another (the move endpoint
// reorders), adds a root item, switches to a store view and overrides a
// title (store value), then reads the storefront fragment to confirm the
// badge, the order and the override, and deletes the group. Screenshots of
// the builder when a shots directory is given (one per admin theme).
// node e2e/pw-megamenu-admin.mjs <baseUrl> <slotDir> [shotsDir]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> ...');
    process.exit(2);
}
const slotDir = path.resolve(process.argv[3] || '.');
const shots = process.argv[4] ? path.resolve(process.argv[4]) : '';
if (shots) fs.mkdirSync(shots, { recursive: true });

const adminUser = 'hyperion_e2e_admin';
const adminPassword = 'E2e' + Math.random().toString(36).slice(2, 10) + 'Aa1';
const identifier = 'e2e_admin_menu';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 260) : ''}`);
};
const compose = (service, cmd, user) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...(user ? ['-u', user] : []), service, 'bash', '-c', cmd], { encoding: 'utf8' });
const sql = (q) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(q)} 2>/dev/null`).trim();
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const cleanup = () => {
    sql(`DELETE FROM hyperion_megamenu_group WHERE identifier = '${identifier}'`);
    sql(`DELETE FROM admin_user WHERE username = '${adminUser}'`);
    magento('cache:clean block_html full_page >/dev/null');
    try { compose('varnish', "varnishadm ban 'req.url ~ .' >/dev/null"); } catch (e) { /* none */ }
};
const createAdmin = () => magento(`admin:user:create --admin-user=${adminUser} --admin-password=${adminPassword} --admin-email=${adminUser}@example.com --admin-firstname=Hyperion --admin-lastname=E2E >/dev/null`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 80)}`); });
const menuUrl = async (uiId) => page.evaluate((id) => document.querySelector(`[data-ui-id="${id}"] a`)?.getAttribute('href') || '', uiId);
try {
    cleanup();
    createAdmin();
    // ---- sign in
    await page.goto(base + '/admin/', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="login[username]"]', adminUser);
    await page.fill('input[name="login[password]"]', adminPassword);
    await Promise.all([page.waitForURL(/\/admin\/(admin\/)?(dashboard|index)/, { timeout: 30000 }), page.click('button.action-login')]);
    check('admin: signed in', /dashboard|index/.test(page.url()), page.url().replace(base, ''));
    const gridUrl = await menuUrl('menu-magentofullstackdev-hyperionmegamenu-group');
    check('admin: Content > Menu > Menu Management is in the menu', /hyperion_megamenu\/group/.test(gridUrl), gridUrl.replace(base, ''));

    // ---- groups grid and form
    await page.goto(gridUrl, { waitUntil: 'networkidle' });
    check('admin: the groups grid renders (UI component)', await page.locator('.admin__data-grid-wrap, .data-grid').count() > 0 && await page.locator('button#add, [data-ui-id="add-button"], button.action-primary').count() > 0);
    await page.click('button#add, [data-ui-id="add-button"]');
    await page.waitForSelector('input[name="title"]', { timeout: 30000 });
    await page.fill('input[name="title"]', 'E2E admin menu');
    await page.fill('input[name="identifier"]', identifier);
    await page.fill('input[name="priority"]', '5');
    await page.click('button#save, [data-ui-id="save-button"]');
    await page.waitForSelector('.message-success', { timeout: 30000 });
    const groupId = Number(sql(`SELECT group_id FROM hyperion_megamenu_group WHERE identifier = '${identifier}'`));
    check('admin: the group form saves the group', groupId > 0 && /saved/i.test(await page.locator('.message-success').first().textContent()), `group ${groupId}`);

    // ---- the website selection must round-trip: the UI multiselect compares option values (strings) strictly
    await page.goto(gridUrl, { waitUntil: 'networkidle' });
    const editHref = await page.evaluate((id) => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').find((h) => new RegExp(`group/edit/group_id/${id}(/|$)`).test(h)) || '', groupId);
    await page.goto(editHref, { waitUntil: 'networkidle' });
    await page.waitForSelector('select[name="website_ids"]', { timeout: 30000 });
    const websiteValue = await page.evaluate(() => [...document.querySelector('select[name="website_ids"]').options].map((o) => o.value).find((v) => v !== '0') || '');
    await page.selectOption('select[name="website_ids"]', [websiteValue]);
    // waitForURL would resolve at once on the edit page itself: wait for the save POST to answer instead
    await Promise.all([page.waitForResponse((r) => /group\/save/.test(r.url()) && r.request().method() === 'POST', { timeout: 30000 }), page.click('button#save, [data-ui-id="save-button"]')]);
    await page.waitForLoadState('networkidle');
    const storedWebsites = sql(`SELECT website_ids FROM hyperion_megamenu_group WHERE group_id = ${groupId}`);
    await page.goto(editHref, { waitUntil: 'networkidle' });
    await page.waitForSelector('select[name="website_ids"]', { timeout: 30000 });
    await sleep(800);
    const shownWebsites = await page.evaluate(() => [...document.querySelector('select[name="website_ids"]').selectedOptions].map((o) => o.value));
    check('admin: the website selection is stored and shown again by the form', storedWebsites === websiteValue && shownWebsites.length === 1 && shownWebsites[0] === websiteValue, `stored ${storedWebsites}, shown ${shownWebsites.join(',')}`);

    // ---- builder
    await page.goto(gridUrl, { waitUntil: 'networkidle' });
    const builderHref = await page.evaluate((id) => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').find((h) => new RegExp(`hyperion_megamenu/item/builder/group_id/${id}(/|$)`).test(h)) || '', groupId);
    check('admin: the grid offers Manage Items', /item\/builder/.test(builderHref));
    await page.goto(builderHref, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-hmm-tree] .hmm-placeholder, [data-hmm-tree] .hmm-row', { timeout: 30000 });
    check('builder: the page renders with the store switcher and the toolbar', await page.locator('[data-hyperion-megamenu-builder] .store-switcher, [data-hyperion-megamenu-builder] #store-change-button, [data-hyperion-megamenu-builder] select#store_switcher').count() > 0 && await page.locator('[data-hmm-action="import"]').count() === 1 && await page.locator('[data-hmm-tree] .hmm-placeholder').count() === 1);
    page.once('dialog', (d) => d.accept());
    await page.click('[data-hmm-action="import"]');
    await page.waitForSelector('[data-hmm-tree] .hmm-row', { timeout: 30000 });
    const rows = await page.locator('[data-hmm-tree] .hmm-row').count();
    const roots = await page.locator('[data-hmm-tree] > .hmm-list > .hmm-node').count();
    check('builder: Import from Categories fills the tree without a page reload', rows >= 10 && roots >= 4 && /imported/i.test(await page.locator('[data-hmm-messages]').textContent()), `${rows} rows, ${roots} roots`);
    const firstTitle = (await page.locator('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(1) > .hmm-row .hmm-title').textContent()).trim();
    const secondTitle = (await page.locator('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(2) > .hmm-row .hmm-title').textContent()).trim();

    // ---- inspector: select the second root, give it a badge
    const t0 = Date.now();
    await page.click('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(2) > .hmm-row');
    await page.waitForSelector('[data-hmm-inspector] [data-hmm-form]', { timeout: 15000 });
    const formMs = Date.now() - t0;
    check('builder: clicking a node loads its form by fetch (no reload)', (await page.inputValue('[data-hmm-form] input[name="title"]')) === secondTitle && (await page.locator('[data-hmm-form] [data-hmm-target="category"]:not([hidden])').count()) >= 1, `${formMs} ms, title "${secondTitle}"`);
    await page.fill('[data-hmm-form] input[name="badge_text"]', 'SALE');
    await page.selectOption('[data-hmm-form] select[name="badge_color"]', 'danger');
    await page.click('[data-hmm-form] button[type="submit"]');
    await page.waitForSelector('[data-hmm-tree] .hmm-badge-danger', { timeout: 15000 });
    check('builder: saving the form updates the tree in place', (await page.locator('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(2) .hmm-badge').textContent()).trim() === 'SALE');

    // ---- drag and drop: the second root before the first
    const source = page.locator('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(2) > .hmm-row');
    const target = page.locator('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(1) > .hmm-row');
    const box = await target.boundingBox();
    await source.dragTo(target, { targetPosition: { x: 40, y: Math.max(2, Math.round(box.height * 0.15)) } });
    await sleep(1500);
    const newFirst = (await page.locator('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(1) > .hmm-row .hmm-title').textContent()).trim();
    const dbOrder = sql(`SELECT title FROM hyperion_megamenu_item WHERE group_id = ${groupId} AND parent_id = 0 ORDER BY position, item_id LIMIT 2`).split('\n');
    check('builder: drag and drop reorders the roots (tree and database)', newFirst === secondTitle && dbOrder[0] === secondTitle && dbOrder[1] === firstTitle, `${newFirst} | db ${dbOrder.join(',')}`);

    // ---- add a root custom link
    await page.click('[data-hmm-action="add-root"]');
    await page.waitForSelector('[data-hmm-inspector] [data-hmm-form] input[name="item_id"][value="0"]', { state: 'attached', timeout: 15000 });
    await page.fill('[data-hmm-form] input[name="title"]', 'E2E link');
    await page.selectOption('[data-hmm-form] select[name="item_type"]', 'custom');
    await page.fill('[data-hmm-form] input[name="target_custom"]', '{storeurl}e2e-link');
    await page.click('[data-hmm-form] button[type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-hmm-tree] .hmm-title')].some((t) => t.textContent === 'E2E link'), null, { timeout: 15000 });
    check('builder: Add Root Item creates the item and shows it last', (await page.locator('[data-hmm-tree] > .hmm-list > .hmm-node:last-child .hmm-title').textContent()).trim() === 'E2E link');

    if (shots) await page.screenshot({ path: path.join(shots, 'megamenu_admin_builder.png') });

    // ---- store view scope: override the title of the (now) first root
    const storeId = Number(sql('SELECT MIN(store_id) FROM store WHERE store_id > 0'));
    await page.goto(builderHref.replace(/\/$/, '') + '/store/' + storeId + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-hmm-tree] .hmm-row', { timeout: 30000 });
    await page.click('[data-hmm-tree] > .hmm-list > .hmm-node:nth-child(1) > .hmm-row');
    await page.waitForSelector('[data-hmm-form] [data-hmm-use-default="title"]', { timeout: 15000 });
    check('builder: a store view shows "Use Default Value" and locks the structure fields', (await page.locator('[data-hmm-form] input[name="title"]').isDisabled()) && (await page.locator('[data-hmm-form] select[name="item_type"]').isDisabled()));
    await page.uncheck('[data-hmm-form] [data-hmm-use-default="title"]');
    await page.fill('[data-hmm-form] input[name="title"]', secondTitle + ' (store)');
    await page.click('[data-hmm-form] button[type="submit"]');
    await page.waitForSelector('[data-hmm-tree] .hmm-tag-override', { timeout: 15000 });
    const storeRow = sql(`SELECT title FROM hyperion_megamenu_item_store WHERE store_id = ${storeId} AND item_id IN (SELECT item_id FROM hyperion_megamenu_item WHERE group_id = ${groupId} AND title = '${secondTitle.replace(/'/g, "''")}')`);
    check('builder: the store view saves a store value, the default title stays', storeRow === secondTitle + ' (store)' && sql(`SELECT COUNT(*) FROM hyperion_megamenu_item WHERE group_id = ${groupId} AND title = '${secondTitle.replace(/'/g, "''")}'`) === '1', storeRow);

    // ---- storefront
    const fragment = await (await ctx.request.get(base + '/hyperion/navigation/menu')).text();
    const firstLink = (fragment.match(/<li class="[^"]*"[^>]*><div[^>]*><a [^>]*>([^<]+)/) || ['', ''])[1];
    check('storefront: the fragment shows the group with the new order, the badge and the store title', /data-hyperion-megamenu="e2e_admin_menu"/.test(fragment) && firstLink === secondTitle + ' (store)' && /data-hyperion-badge>SALE</.test(fragment) && /e2e-link/.test(fragment), `first: "${firstLink}"`);
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 3).join(' | '));
} finally {
    cleanup();
    await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

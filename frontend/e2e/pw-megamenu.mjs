// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the Hyperion Mega Menu (storefront side): with no
// group the navigation is the category tree; the fixture
// (e2e/fixtures/megamenu-fixture.php) creates the `main_navigation` group
// (categories imported, a 12 column mega panel with a promo CMS block
// column, badges, a store view title override, a custom and an external
// link, an `empty` label with system links, a disabled item) and the check
// reads the ESI fragment and the pages: panel grid and columns, badges,
// override, links, hidden item, cache tags and Varnish purge on save,
// desktop hover panel and the mobile drawer accordion in a browser. The
// fixture is removed at the end.
// node e2e/pw-megamenu.mjs <baseUrl> <slotDir> [shotsDir]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'megamenu-fixture.php');

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 260) : ''}`);
};
const compose = (service, cmd, user) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...(user ? ['-u', user] : []), service, 'bash', '-c', cmd], { encoding: 'utf8' });
const fixture = (action) => compose('php-fpm', `cd /var/www/html && php /tmp/megamenu-fixture.php /var/www/html ${action}`, 'www-data').trim();
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const ban = () => { try { compose('varnish', "varnishadm ban 'req.url ~ .' >/dev/null"); } catch (e) { /* no varnish */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The backend answers 5xx for a moment after a flush: retry. X-Magento-Debug
// asks the VCL for the debug exchange: the cache verdict (x-magento-cache-debug)
// and x-magento-cache-control are stripped otherwise.
const get = async (ctx, p, headers = {}) => {
    for (let i = 0; i < 4; i++) {
        const r = await ctx.request.get(base + p, { headers: { 'X-Magento-Debug': '1', ...headers }, maxRedirects: 0 });
        if (r.status() < 500) return { status: r.status(), headers: r.headers(), text: await r.text() };
        await sleep(2500);
    }
    return { status: 599, headers: {}, text: '' };
};
const fragmentPath = '/hyperion/navigation/menu';

execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURE, 'php-fpm:/tmp/megamenu-fixture.php']);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 80)}`); });
let summary = null;
try {
    // ---- no group: the category tree
    fixture('remove');
    magento('cache:clean block_html full_page >/dev/null'); ban(); await sleep(2000);
    const plain = await get(ctx, fragmentPath);
    // A group of the install's own (not the fixture) may already drive the header: the fallback cannot be observed then.
    const ownGroup = (plain.text.match(/data-hyperion-megamenu="([^"]*)"/) || [])[1];
    check('fallback: without a group the fragment is the category tree', plain.status === 200 && /data-hyperion-topmenu/.test(plain.text) && /women\.html/.test(plain.text) && (!ownGroup || ownGroup !== 'main_navigation'), ownGroup ? `skipped: the install's group "${ownGroup}" is active (${plain.status}, ${plain.text.length} chars)` : `${plain.status}, ${plain.text.length} chars`);

    // ---- the fixture group
    summary = JSON.parse(fixture('apply'));
    await sleep(1500);
    const menu = await get(ctx, fragmentPath);
    const html = menu.text;
    check('fixture: group created and categories imported', summary.group_id > 0 && summary.imported >= 10, JSON.stringify(summary));
    check('menu: the fragment renders the mega menu group', /data-hyperion-topmenu data-hyperion-megamenu="main_navigation"/.test(html), (html.match(/data-hyperion-megamenu="[^"]*"/) || [''])[0]);
    const womenItem = (html.match(/<li class="[^"]*"[^>]*data-hyperion-mega-item>[\s\S]*?data-hyperion-mega-panel>[\s\S]*?<\/div><\/div><\/li>/) || [''])[0];
    check('menu: Women is a 12 column mega panel inside the site container', /data-hyperion-mega-panel><div class="container mx-auto px-4 py-6 grid grid-cols-12 gap-6">/.test(womenItem) && /women\.html/.test(womenItem));
    const columns = (womenItem.match(/data-hyperion-mega-column/g) || []).length;
    check('menu: the imported children are 3 column headers with their subcategories, the promo block a 6 column cell', columns >= 3 && (womenItem.match(/col-span-3 min-w-0/g) || []).length >= 2 && /col-span-6 min-w-0" data-hyperion-mega-column data-hyperion-mega-block>[\s\S]*data-hyperion-promo/.test(womenItem), `${columns} columns`);
    check('menu: no flyout hooks inside the panel columns', !/data-hyperion-mega-column[\s\S]*?data-hyperion-submenu/.test(womenItem));
    check('menu: Men carries the SALE badge in the danger tone', /men\.html[^>]*>Men<span class="[^"]*bg-error text-on-error" data-hyperion-badge>SALE<\/span>/.test(html));
    check('menu: the store view override renames Gear and adds its own badge', /gear\.html[^>]*>Gear &amp; More<span class="[^"]*bg-success text-on-success" data-hyperion-badge>NEW<\/span>/.test(html));
    check('menu: a custom {storeurl} link, an external nofollow link in a new tab', new RegExp(`href="${base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/catalogsearch/result/\\?q=bag"`).test(html) && /href="https:\/\/example\.com\/docs"[^>]*target="_blank" rel="noopener nofollow"/.test(html), (html.match(/href="[^"]*example\.com[^>]*>/) || [''])[0]);
    const label = (html.match(/<li class="[^"]*hyperion-account-label"[\s\S]*?<\/ul><\/li>/) || [''])[0];
    check('menu: the empty label is a span with a flyout of system links and a product', /<span class="[^"]*" data-hyperion-menu-label>Account<\/span>/.test(label) && /customer\/account\/login/.test(label) && /wishlist\//.test(label) && /joust-duffle-bag\.html/.test(label), label.length + ' chars');
    check('menu: the disabled item is not rendered', !/Hidden item/.test(html) && !/\/hidden"/.test(html));
    check('menu: public for an hour at the edge', /s-maxage=3600/.test(menu.headers['x-magento-cache-control'] || menu.headers['cache-control'] || ''), menu.headers['x-magento-cache-control']);
    const tagsLine = compose('php-fpm', 'curl -s -D - -o /dev/null -H "Host: ' + new URL(base).host + '" -H "X-Forwarded-Proto: https" http://web:8080' + fragmentPath + ' | grep -i "^X-Magento-Tags"');
    check('menu: X-Magento-Tags carry the group, the categories, the product and the block', /hyperion_megamenu,/.test(tagsLine) && /hyperion_megamenu_g_\d+/.test(tagsLine) && /cat_c_\d+/.test(tagsLine) && /cat_p_\d+/.test(tagsLine) && /cms_b_\d+/.test(tagsLine), tagsLine.trim().slice(0, 160));

    // ---- Varnish purge on save: the badge changes through a model save, the next fetch is a MISS with the new text
    await get(ctx, fragmentPath);
    const hit = await get(ctx, fragmentPath);
    compose('php-fpm', `cd /var/www/html && php -r 'require "app/bootstrap.php"; $b = \\Magento\\Framework\\App\\Bootstrap::create("/var/www/html", $_SERVER); $om = $b->getObjectManager(); $om->get(\\Magento\\Framework\\App\\State::class)->setAreaCode("adminhtml"); $r = $om->get(\\Magentofullstackdev\\HyperionMegaMenu\\Model\\ResourceModel\\Item::class); $i = $om->get(\\Magentofullstackdev\\HyperionMegaMenu\\Model\\ItemFactory::class)->create(); $r->load($i, ${summary.men_item}); $i->setData("badge_text", "HOT"); $r->save($i);'`, 'www-data');
    await sleep(1000);
    const afterSave = await get(ctx, fragmentPath);
    check('cache: an item save purges the fragment at the edge and in the block cache', hit.headers['x-magento-cache-debug'] === 'HIT' && afterSave.headers['x-magento-cache-debug'] === 'MISS' && /data-hyperion-badge>HOT</.test(afterSave.text), `${hit.headers['x-magento-cache-debug']} then ${afterSave.headers['x-magento-cache-debug']}, badge ${(afterSave.text.match(/data-hyperion-badge>[A-Z]*/) || [''])[0]}`);

    // ---- in a browser: the desktop panel opens on hover, the drawer accordion on mobile
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.hover('[data-hyperion-topmenu] > li[data-hyperion-mega-item] > div > a');
    await page.waitForTimeout(400);
    const desktop = await page.evaluate(() => {
        const panel = document.querySelector('header [data-hyperion-topmenu] [data-hyperion-mega-panel]');
        const header = document.querySelector('header');
        if (!panel || !header) return null;
        const p = panel.getBoundingClientRect(); const h = header.getBoundingClientRect();
        return { display: getComputedStyle(panel).display, left: Math.round(p.left), width: Math.round(p.width), headerWidth: Math.round(h.width), top: Math.round(p.top), headerBottom: Math.round(h.bottom), columns: panel.querySelectorAll('[data-hyperion-mega-column]').length, promo: !!panel.querySelector('[data-hyperion-promo]') };
    });
    if (shots) await page.screenshot({ path: path.join(shots, 'megamenu_desktop.png') });
    check('browser: hovering Women opens the full width panel under the header', desktop && desktop.display !== 'none' && desktop.left <= 1 && desktop.width >= desktop.headerWidth - 2 && Math.abs(desktop.top - desktop.headerBottom) <= 2 && desktop.columns >= 3 && desktop.promo, JSON.stringify(desktop));
    // The panel anchors to the header: between the root link and the panel there is a strip of header where
    // :hover is lost (lib/mega-hover.js + the bridge in _topmenu.css keep it open). Cross it slowly, pixel by pixel.
    const strip = await page.evaluate(() => {
        const a = document.querySelector('[data-hyperion-topmenu] > li[data-hyperion-mega-item] > div > a');
        const panel = document.querySelector('header [data-hyperion-topmenu] [data-hyperion-mega-panel]');
        const r = a.getBoundingClientRect(); const p = panel.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), from: Math.round(r.bottom) - 2, to: Math.round(p.top) + 8 };
    });
    const stripStates = [];
    for (let y = strip.from; y <= strip.to; y += 2) {
        await page.mouse.move(strip.x, y);
        await sleep(60);
        stripStates.push(await page.evaluate(() => getComputedStyle(document.querySelector('header [data-hyperion-topmenu] [data-hyperion-mega-panel]')).display));
    }
    check('browser: the panel stays open while the pointer crosses the strip between the link and the panel', stripStates.length > 3 && stripStates.every((d) => d === 'block'), `${strip.to - strip.from} px, ${stripStates.filter((d) => d !== 'block').length} closed samples`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.click('hyperion-dropdown[placement="drawer"] button[slot="trigger"]');
    await page.waitForTimeout(500);
    const mobile = await page.evaluate(() => {
        const drawer = document.querySelector('hyperion-dropdown[placement="drawer"]');
        const root = drawer?.querySelector('[data-hyperion-topmenu][data-hyperion-megamenu]');
        if (!root) return null;
        const women = [...root.querySelectorAll(':scope > li')].find((li) => /women\.html/.test(li.querySelector('a')?.getAttribute('href') || ''));
        const toggle = women?.querySelector('[data-hyperion-submenu-toggle]');
        const sub = women?.querySelector('[data-hyperion-submenu]');
        return { rootVisible: root.getBoundingClientRect().width > 0, hasToggle: !!toggle, subHidden: sub ? sub.classList.contains('hidden') : null, panel: !!root.querySelector('[data-hyperion-mega-panel]'), promo: !!root.querySelector('[data-hyperion-promo]'), badge: !!root.querySelector('[data-hyperion-badge]') };
    });
    check('browser: the drawer shows the mega menu as an accordion (no panel, no promo block, badges kept)', mobile && mobile.rootVisible && mobile.hasToggle && mobile.subHidden === true && !mobile.panel && !mobile.promo && mobile.badge, JSON.stringify(mobile));
    await page.click('hyperion-dropdown[placement="drawer"] [data-hyperion-topmenu][data-hyperion-megamenu] > li:nth-child(2) [data-hyperion-submenu-toggle]');
    await page.waitForTimeout(300);
    const opened = await page.evaluate(() => { const sub = document.querySelector('hyperion-dropdown[placement="drawer"] [data-hyperion-megamenu] > li:nth-child(2) [data-hyperion-submenu]'); return sub ? { hidden: sub.classList.contains('hidden'), links: sub.querySelectorAll('a').length } : null; });
    if (shots) await page.screenshot({ path: path.join(shots, 'megamenu_mobile.png') });
    check('browser: the accordion toggle reveals the subcategories', opened && opened.hidden === false && opened.links >= 2, JSON.stringify(opened));
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 3).join(' | '));
} finally {
    fixture('remove');
    compose('php-fpm', 'rm -f /tmp/megamenu-fixture.php');
    magento('cache:clean block_html full_page >/dev/null'); ban();
    await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

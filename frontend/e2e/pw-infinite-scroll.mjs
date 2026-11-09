// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the infinite loading of the listings: the three
// configuration modes on a category and on the search results, the Load more
// button (appended page, status line, focus, last page), the automatic mode
// and its cap, the category attribute override in both directions, the append
// fragment, a logged in customer (the caller clears the customer_login
// reCAPTCHA type for the run, see docs/development.md). Configuration and attribute values are restored.
// node e2e/pw-infinite-scroll.mjs <baseUrl> <slotDir> [shotsDir]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '');
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> ...');
    process.exit(2);
}
const slotDir = path.resolve(process.argv[3] || '.');
const shots = process.argv[4] ? path.resolve(process.argv[4]) : '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'infinite-scroll-fixture.php');

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 260) : ''}`);
};
const compose = (service, cmd, user) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...(user ? ['-u', user] : []), service, 'bash', '-c', cmd], { encoding: 'utf8' });
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const ban = () => { try { compose('varnish', "varnishadm ban 'req.url ~ .' >/dev/null"); } catch { /* no varnish */ } };
const flush = () => { magento('cache:clean config full_page block_html >/dev/null'); ban(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const configShow = (p) => { try { return magento(`config:show ${p} 2>/dev/null`).trim(); } catch { return ''; } };
const original = { mode: configShow('hyperion/catalog/infinite_scroll') || 'disabled', cap: configShow('hyperion/catalog/infinite_scroll_auto_pages') || '3' };
const setMode = (mode, cap) => {
    magento(`config:set hyperion/catalog/infinite_scroll ${mode} >/dev/null`);
    if (cap !== undefined) magento(`config:set hyperion/catalog/infinite_scroll_auto_pages ${cap} >/dev/null`);
    flush();
};
const fixture = (action, urlKey, mode = '') => JSON.parse(compose('php-fpm', `php /tmp/infinite-scroll-fixture.php /var/www/html ${action} ${urlKey} ${mode}`, 'www-data').trim().split('\n').pop());
const get = async (ctx, p) => {
    for (let i = 0; i < 4; i++) {
        const r = await ctx.request.get(base + p, { maxRedirects: 0 });
        if (r.status() < 500) return { status: r.status(), headers: r.headers(), text: await r.text() };
        await sleep(2500);
    }
    return { status: 599, headers: {}, text: '' };
};
const WOMEN = u('/women/tops-women.html');
const MEN = u('/men/tops-men.html');
const TILES = '#hyperion-product-grid [data-hyperion-tiles] > li';
const FOOT = '[data-hyperion-load-more]';
const BUTTON = '[data-hyperion-load-more-button]';
const hasPager = (html) => /data-hyperion-limiter|aria-label="Next page"|aria-current="page"/.test(html);
const foot = (html) => (html.match(/<div id="hyperion-load-more"[\s\S]*?<\/div>/) || [''])[0];
// The element, not the attribute name: the inline critical sheet of the listing carries the
// `[data-hyperion-load-more]` rules on every category page.
const hasFoot = (html) => /<div id="hyperion-load-more"/.test(html);

execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURE, 'php-fpm:/tmp/infinite-scroll-fixture.php']);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 80)}`); });
const tiles = () => page.locator(TILES).count();
const status = async () => (await page.locator(`${FOOT} [data-hyperion-load-more-status]`).textContent().catch(() => '') || '').trim();
const footMode = () => page.getAttribute(FOOT, 'data-hyperion-load-more-mode').catch(() => null);
const waitTiles = (n) => page.waitForFunction(([sel, min]) => document.querySelectorAll(sel).length >= min, [TILES, n], { timeout: 20000 });
try {
    fixture('remove', 'tops-women'); fixture('remove', 'tops-men');

    // ---- disabled: the pager
    setMode('disabled', 3);
    let html = (await get(ctx, WOMEN)).text;
    check('disabled: the category keeps the pager and has no Load more', hasPager(html) && !hasFoot(html));

    // ---- button mode
    setMode('button');
    html = (await get(ctx, WOMEN)).text;
    const f = foot(html);
    check('button: the grid ends with the status and a Load more link to page 2 (no pager)', /Showing 12 of 50 products/.test(f) && /href="[^"]*\?p=2"/.test(f) && /data-hyperion-load-more-mode="button"/.test(f) && /hx-trigger="click"/.test(f) && /append=1/.test(f) && !hasPager(html), f.replace(/\s+/g, ' ').slice(0, 200));
    const append = await get(ctx, '/hyperion/category/filter?id=' + (html.match(/hyperion\/category\/filter\/?\?id=(\d+)/) || [])[1] + '&p=2&append=1&bogus=1');
    check('button: the append fragment answers the tiles of the page and the foot out of band, no grid wrapper', append.status === 200 && /^\s*<li/.test(append.text) && /hx-swap-oob="true"/.test(append.text) && !/data-hyperion-product-grid/.test(append.text) && /Showing 24 of 50 products/.test(append.text) && (append.text.match(/<li class="flex">/g) || []).length === 12, `${append.status}, ${(append.text.match(/<li class="flex">/g) || []).length} tiles`);
    await page.goto(base + WOMEN, { waitUntil: 'networkidle' });
    const before = await tiles();
    await page.focus(BUTTON);
    await page.keyboard.press('Enter');
    await waitTiles(24);
    await sleep(600);
    const focused = await page.evaluate(() => document.activeElement?.matches('[data-hyperion-load-more-button]') || false);
    check('button: Load more appends page 2 under the tiles, updates the status, keeps the focus on the new link and the URL', before === 12 && (await tiles()) === 24 && /Showing 24 of 50 products/.test(await status()) && focused && !/[?&]p=/.test(page.url()), `${before} -> ${await tiles()}, focus ${focused}, ${page.url().replace(base, '')}`);
    if (shots) await page.screenshot({ path: path.join(shots, 'infinite_button.png'), fullPage: false });
    await page.goto(base + WOMEN + '?p=5', { waitUntil: 'networkidle' });
    check('button: the last page says every product is shown and has no link', /You have seen all 50 products/.test(await status()) && (await page.locator(BUTTON).count()) === 0, await status());

    // ---- automatic mode with a cap of 1
    setMode('scroll', 1);
    await page.goto(base + WOMEN, { waitUntil: 'networkidle' });
    const trigger = await page.getAttribute(BUTTON, 'hx-trigger');
    check('scroll: the link triggers on intersect while the cap allows it', (await footMode()) === 'scroll' && /intersect/.test(trigger || ''), trigger);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitTiles(24);
    await sleep(600);
    check('scroll: reaching the end loads page 2 automatically; past the cap the button takes over', (await tiles()) === 24 && (await footMode()) === 'button' && !/intersect/.test((await page.getAttribute(BUTTON, 'hx-trigger')) || ''), `${await tiles()} tiles, foot ${await footMode()}`);
    setMode('scroll', 0);
    await page.goto(base + WOMEN, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitTiles(24);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitTiles(36);
    check('scroll: without a cap every page loads automatically', (await tiles()) >= 36 && (await footMode()) === 'scroll', `${await tiles()} tiles`);

    // ---- category override, both directions
    fixture('apply', 'tops-women', 'disabled'); flush();
    const womenHtml = (await get(ctx, WOMEN)).text; const menHtml = (await get(ctx, MEN)).text;
    check('override: a category set to Disabled keeps the pager while the configuration is Automatic (other categories load automatically)', hasPager(womenHtml) && !hasFoot(womenHtml) && /data-hyperion-load-more-mode="scroll"/.test(menHtml));
    setMode('disabled'); fixture('apply', 'tops-women', 'button'); flush();
    const womenHtml2 = (await get(ctx, WOMEN)).text; const menHtml2 = (await get(ctx, MEN)).text;
    check('override: a category set to Load more button gets the button while the configuration is Disabled (other categories keep the pager)', /data-hyperion-load-more-mode="button"/.test(womenHtml2) && !hasPager(womenHtml2) && hasPager(menHtml2) && !hasFoot(menHtml2));
    fixture('remove', 'tops-women'); flush();

    // ---- search results follow the configuration
    setMode('button');
    const searchHtml = (await get(ctx, '/catalogsearch/result/?q=jacket')).text;
    const total = Number((searchHtml.match(/Showing 12 of (\d+) products/) || [])[1] || 0);
    check('search: the results page ends with Load more against the search fragment, and the sort select swaps the grid through it', total > 12 && /data-hyperion-load-more-mode="button"/.test(searchHtml) && /hx-get="[^"]*hyperion\/catalog\/search[^"]*append=1"/.test(searchHtml) && /select[^>]*name="product_list_order"[^>]*hx-get="[^"]*hyperion\/catalog\/search/.test(searchHtml.replace(/\n/g, ' ')), `${total} products`);
    await page.goto(base + '/catalogsearch/result/?q=jacket', { waitUntil: 'networkidle' });
    await page.click(BUTTON);
    await waitTiles(Math.min(24, total));
    await sleep(600);
    check('search: Load more appends page 2 of the results', (await tiles()) === Math.min(24, total) && (total <= 24 ? new RegExp(`You have seen all ${total} products`).test(await status()) : /Showing 24 of/.test(await status())), `${await tiles()} tiles, ${await status()}`);

    // ---- a logged in customer
    await page.goto(base + '/customer/account/login/', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="login[username]"]', 'roni_cost@example.com');
    await page.fill('input[name="login[password]"]', 'roni_cost3@example.com');
    await Promise.all([page.waitForURL(/customer\/account\/?/, { timeout: 20000 }), page.click('form[action*="loginPost"] button[type="submit"]')]);
    check('customer: login', /customer\/account/.test(page.url()), page.url().replace(base, ''));
    await page.goto(base + WOMEN, { waitUntil: 'networkidle' });
    await page.click(BUTTON);
    await waitTiles(24);
    await sleep(400);
    check('customer: Load more works for a logged in customer', (await tiles()) === 24 && /Showing 24 of 50 products/.test(await status()) && (await page.locator('#hyperion-account-menu a, #hyperion-account-menu button').count()) > 0, `${await tiles()} tiles`);

    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (e) {
    check('script completed', false, e.message);
} finally {
    try { fixture('remove', 'tops-women'); fixture('remove', 'tops-men'); } catch { /* fixture gone */ }
    try { setMode(original.mode, original.cap); } catch { /* restore failed */ }
    await browser.close();
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed }, null, 2));
process.exit(failed.length ? 1 : 0);

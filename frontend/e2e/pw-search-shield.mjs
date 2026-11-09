// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of Hyperion Search and the anti-abuse shield: the two-column
// autocomplete (sidebar with
// recent searches from localStorage, popular searches and categories; product
// column with the engine total, "View All (+N)", the 4-column grid on desktop
// that is a list on a phone, bold query highlighting, no review stars) and its
// two cache layers (Varnish HIT, app cache hit), the SKU badge, typo tolerance
// on the results page, promoted SKUs, stop words, the zero-results fallback,
// Varnish query sorting, the filter guard (unknown parameters dropped, too many
// filters refused, robots directive), the suggest freshness (a
// cached answer of a word no product matched shows the product created and
// indexed afterwards, through the app cache and Varnish) and the rate limiter
// (429 with Retry-After). Settings changed for the run are restored and the
// fixture product removed; the rate limit checks run last because the client's
// budget stays spent for the rest of the 10 second window.
// node e2e/pw-search-shield.mjs <baseUrl> <slotDir>
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
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'search-freshness-fixture.php');
// A word no sample product carries: the suggest answers it with no product until the fixture creates one.
const FRESH_WORD = 'hyperionfreshnesscheck';

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
const configSet = (p, v) => magento(`config:set ${p} ${JSON.stringify(String(v))} >/dev/null`);
const configUnset = (p) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "DELETE FROM core_config_data WHERE path = '${p}' AND scope = 'default' AND scope_id = 0" 2>/dev/null`);
const flush = () => { magento('cache:flush >/dev/null'); try { compose('varnish', "varnishadm ban 'req.url ~ .' >/dev/null"); } catch { /* no varnish */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fixture = (action) => JSON.parse(compose('php-fpm', `php /tmp/search-freshness-fixture.php /var/www/html ${action} ${FRESH_WORD}`, 'www-data').trim().split('\n').pop());
const removeFixture = () => { try { fixture('remove'); } catch (e) { console.error('fixture removal failed: ' + String(e.message).slice(0, 200)); } };
const TOUCHED = ['hyperion_search/general/fuzziness', 'hyperion_search/general/promoted_skus', 'hyperion_search/general/stop_words',
    'hyperion/security/search_suggest_limit', 'hyperion/security/catalog_filter_limit'];
const original = Object.fromEntries(TOUCHED.map((p) => {
    let v;
    try { v = magento(`config:show ${p} 2>/dev/null`).trim(); } catch { v = ''; }
    return [p, v];
}));
const restore = () => {
    for (const p of TOUCHED) {
        if (original[p] === '') configUnset(p); else configSet(p, original[p]);
    }
    flush();
};

const browser = await chromium.launch({ headless: true, ...launchOptions() });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
// X-Magento-Debug asks the VCL for the debug exchange: the cache verdict
// (x-magento-cache-debug) and the Hyperion markers are stripped otherwise.
const get = async (p, headers = {}) => {
    const r = await ctx.request.get(base + p, { headers: { 'X-Magento-Debug': '1', ...headers }, maxRedirects: 0 });
    return { status: r.status(), headers: r.headers(), text: await r.text() };
};
// Magento escapes attribute values with numeric entities (&#x7B; ...) besides the named ones.
const decodeAttr = (v) => v.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const tileSkus = (html) => [...html.matchAll(/data-hyperion-product-meta="([^"]+)"/g)].map((m) => {
    try { return JSON.parse(decodeAttr(m[1])).sku; } catch { return null; }
}).filter(Boolean);
const headingText = (html) => decodeAttr(((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || ['', ''])[1]).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURE, 'php-fpm:/tmp/search-freshness-fixture.php']);
try {
    // A product left behind by an aborted run would answer the freshness query from the start.
    removeFixture();
    flush();
    // A search records its term (with its result count) in the store's search terms: the "bag"
    // term feeds the popular searches section below on a store nobody searched yet.
    await get('/catalogsearch/result/?q=bag');
    // ---- autocomplete: sections, Varnish, app cache
    const first = await get('/hyperion/search/suggest?q=bag');
    const sections = [...first.text.matchAll(/data-hyperion-suggest-section="([a-z]+)"/g)].map((m) => m[1]);
    check('suggest: terms, categories and products for "bag"', first.status === 200 && ['terms', 'categories', 'products'].every((s) => sections.includes(s)), JSON.stringify(sections));
    check('suggest: category rows show their path', /Gear \/ (<[^>]+>)*Bag/.test(first.text), (first.text.match(/Gear \/ [\s\S]{0,80}/) || [''])[0].replace(/<[^>]+>/g, ''));
    check('suggest: product cards carry thumbnail, name and price, no review stars', /data-hyperion-suggest-section="products"[\s\S]*<img src="[^"]+"[\s\S]*line-clamp-2[\s\S]*font-bold text-secondary/.test(first.text) && !/review|rating/i.test(first.text));
    const shown = Number((first.text.match(/data-hyperion-suggest-shown="(\d+)"/) || [])[1]);
    const total = Number((first.text.match(/data-hyperion-suggest-total="(\d+)"/) || [])[1]);
    const productItems = (first.text.match(/data-hyperion-product-id="\d+"/g) || []).length;
    check('suggest: four products of the engine total, "Products (N)" in the heading', shown === 4 && productItems === 4 && total > shown && new RegExp(`Products\\s*<span[^>]*>\\(${total}\\)</span>`).test(first.text), `${shown} of ${total}`);
    const viewAll = decodeAttr(((first.text.match(/data-hyperion-suggest-view-all>([\s\S]*?)<\/a>/) || ['', ''])[1])).trim();
    check('suggest: "View All (+N)" counts the products the dropdown hides', viewAll === `View All (+${total - shown})`, viewAll);
    const strongBag = /<strong class="font-bold text-primary">bag<\/strong>/i;
    const productsBlock = (first.text.match(/data-hyperion-suggest-section="products"[\s\S]*$/) || [''])[0];
    const sideBlock = (first.text.match(/data-hyperion-suggest-aside[\s\S]*?<\/aside>/) || [''])[0];
    check('suggest: the query is bold in product names, popular terms and category paths', strongBag.test(productsBlock) && (sideBlock.match(/<strong class="font-bold text-primary">bag<\/strong>/gi) || []).length >= 2 && /Gear \/ <strong class="font-bold text-primary">Bag<\/strong>s/.test(sideBlock), `${(first.text.match(/<strong class="font-bold text-primary">/g) || []).length} highlights`);
    check('suggest: the recent searches section ships hidden (client-side only)', /<section data-hyperion-recent-searches hidden>/.test(first.text) && !/data-hyperion-recent-term/.test(first.text));
    // Desktop grid vs phone list, and the recent searches pills from localStorage.
    const openSearch = async (text) => {
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
        await page.click('[data-hyperion-search-toggle]');
        await page.locator('#header-search-input').pressSequentially(text, { delay: 60 });
        await page.waitForSelector('[data-hyperion-search-suggest]', { timeout: 15000 });
    };
    const layout = () => page.evaluate(() => {
        const list = document.querySelector('[data-hyperion-suggest-products]');
        const item = list?.firstElementChild;
        const aside = document.querySelector('[data-hyperion-suggest-aside]');
        const recent = document.querySelector('[data-hyperion-recent-searches]');
        const pills = [...document.querySelectorAll('[data-hyperion-recent-term]')].map((a) => a.getAttribute('data-hyperion-recent-term'));
        const box = (el) => el?.getBoundingClientRect();
        return {
            display: list ? getComputedStyle(list).display : '', columns: list ? getComputedStyle(list).gridTemplateColumns.split(' ').length : 0,
            itemDirection: item ? getComputedStyle(item).flexDirection : '', asideLeftOfMain: !!aside && !!list && box(aside).right <= box(list).left + 1,
            asideAboveMain: !!aside && !!list && box(aside).bottom <= box(list).top + 1, recentHidden: recent ? recent.hidden : null, pills,
            width: document.querySelector('[data-hyperion-search-suggest]')?.getBoundingClientRect().width || 0,
        };
    });
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('hyperion_recent_searches'));
    await openSearch('bag');
    const desktop = await layout();
    check('layout: desktop (1366px) is a two-column dropdown with a 4-column product grid', desktop.display === 'grid' && desktop.columns === 4 && desktop.itemDirection === 'column' && desktop.asideLeftOfMain && desktop.width > 900, JSON.stringify(desktop));
    check('recent searches: hidden while the shopper never searched', desktop.recentHidden === true && desktop.pills.length === 0, JSON.stringify(desktop.pills));
    await page.keyboard.press('Enter');
    await page.waitForURL(/catalogsearch\/result/, { timeout: 15000 });
    const stored = await page.evaluate(() => localStorage.getItem('hyperion_recent_searches'));
    check('recent searches: a submitted search is recorded in localStorage', /"bag"/.test(stored || ''), stored);
    await openSearch('ba');
    const withPills = await layout();
    check('recent searches: pills from localStorage, hydrated after the swap, the server HTML untouched', withPills.recentHidden === false && withPills.pills.includes('bag') && (await get('/hyperion/search/suggest?q=ba')).text.indexOf('data-hyperion-recent-term') === -1, JSON.stringify(withPills.pills));
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await layout();
    check('layout: below 1024px the same markup is a vertical stack with a compact product list', phone.display !== 'grid' && phone.itemDirection === 'row' && phone.asideAboveMain, JSON.stringify({ display: phone.display, itemDirection: phone.itemDirection, asideAboveMain: phone.asideAboveMain }));
    await page.setViewportSize({ width: 1366, height: 900 });
    const second = await get('/hyperion/search/suggest?q=bag');
    check('suggest: second identical request is a Varnish HIT', second.headers['x-magento-cache-debug'] === 'HIT' && first.headers['x-magento-cache-debug'] === 'MISS', `${first.headers['x-magento-cache-debug']} then ${second.headers['x-magento-cache-debug']}`);
    check('suggest: browsers never store it (no-store), Varnish MISS/HIT only', /no-store/.test(second.headers['cache-control'] || ''), second.headers['cache-control']);
    const normalized = await get('/hyperion/search/suggest?q=%20BAG%20%20');
    check('suggest: " BAG  " is the same query (app cache hit on a Varnish miss)', normalized.headers['x-magento-cache-debug'] === 'MISS' && normalized.headers['x-hyperion-suggest-cache'] === 'hit' && normalized.text === first.text, `${normalized.headers['x-magento-cache-debug']} / app ${normalized.headers['x-hyperion-suggest-cache']}`);
    const sku = await get('/hyperion/search/suggest?q=24-mb0');
    check('suggest: a SKU query shows the SKU badge', /data-hyperion-suggest-sku/.test(sku.text) && /24-MB0\d/.test(sku.text), (sku.text.match(/24-MB0\d/) || [''])[0]);
    const short = await get('/hyperion/search/suggest?q=b');
    check('suggest: a one-letter query is an empty public fragment', short.status === 200 && short.text.trim() === '', `${short.status} ${short.text.length} chars`);

    // ---- typo tolerance on the results page
    const fuzzyOn = await get('/catalogsearch/result/?q=jost+dufle');
    check('fuzziness: "jost dufle" finds the Joust Duffle Bag', /Joust Duffle Bag/.test(fuzzyOn.text), String(tileSkus(fuzzyOn.text).slice(0, 3)));
    configSet('hyperion_search/general/fuzziness', 'off'); flush();
    const fuzzyOff = await get('/catalogsearch/result/?q=jost+dufle');
    check('fuzziness: off, the same query has no product', tileSkus(fuzzyOff.text).length === 0 && /no results/i.test(fuzzyOff.text), String(tileSkus(fuzzyOff.text).length));
    // The engine's phrase suggester proposes a nearby term (it differs per engine version: "josi duffle",
    // "jost double"); the page shows that term's products instead of a dead end.
    const similarBlock = (fuzzyOff.text.match(/data-hyperion-zero-results-similar[\s\S]*?<\/section>/) || [''])[0];
    check('zero results: the engine\'s spelling suggestion fills the page with products', /similar term &quot;[^&]+&quot;/.test(similarBlock) && (similarBlock.match(/<li /g) || []).length > 0, `${(similarBlock.match(/similar term &quot;[^&]+&quot;/) || ['no similar section'])[0]}, ${(similarBlock.match(/<li /g) || []).length} products`);
    configSet('hyperion_search/general/fuzziness', 'auto'); flush();

    // ---- promoted SKU: the last tile of "bag" becomes the first
    const plain = await get('/catalogsearch/result/?q=bag');
    const skus = tileSkus(plain.text);
    const promoted = skus[skus.length - 1];
    configSet('hyperion_search/general/promoted_skus', promoted); flush();
    const boosted = await get('/catalogsearch/result/?q=bag');
    check('promoted SKU: the promoted product leads the results', skus.length > 3 && tileSkus(boosted.text)[0] === promoted && skus[0] !== promoted, `${promoted}: position ${skus.indexOf(promoted) + 1} -> 1 of ${skus.length}`);
    const unrelated = await get('/catalogsearch/result/?q=hoodie');
    check('promoted SKU: never added to results it does not match', !tileSkus(unrelated.text).includes(promoted), String(tileSkus(unrelated.text).slice(0, 3)));
    configUnset('hyperion_search/general/promoted_skus'); flush();

    // ---- stop words
    configSet('hyperion_search/general/stop_words', 'the, for'); flush();
    const stopped = await get('/catalogsearch/result/?q=the+bag+for');
    const heading = headingText(stopped.text);
    check('stop words: "the bag for" is searched (and shown) as "bag"', /'bag'$/.test(heading) && tileSkus(stopped.text).length > 0, `heading "${heading}", ${tileSkus(stopped.text).length} tiles`);
    configUnset('hyperion_search/general/stop_words'); flush();

    // ---- zero results fallback
    const zero = await get('/catalogsearch/result/?q=zzzzqqq+yyyyqqq');
    check('zero results: nonsense still gets the popular categories, never a dead end', tileSkus(zero.text).length === 0 && /data-hyperion-zero-results-popular/.test(zero.text) && /Popular categories/.test(zero.text));

    // ---- Varnish query sorting
    const categoryPath = u('/men/tops-men.html');
    const a = await get(categoryPath + '?product_list_order=name&p=1');
    const b = await get(categoryPath + '?p=1&product_list_order=name');
    check('varnish: the parameter order does not matter (second order is a HIT)', a.headers['x-magento-cache-debug'] === 'MISS' && b.headers['x-magento-cache-debug'] === 'HIT', `${a.headers['x-magento-cache-debug']} then ${b.headers['x-magento-cache-debug']}`);

    // ---- filter guard
    const bogus = await get(categoryPath + '?filtro1=x&filtro2=y');
    check('filter guard: bogus parameters are dropped and the page renders', bogus.status === 200 && /<h1/.test(bogus.text) && !/filtro1/.test(bogus.text), `${bogus.status}, filtro1 in markup: ${/filtro1/.test(bogus.text)}`);
    const categoryHtml = (await get(categoryPath)).text;
    const color = (categoryHtml.match(/[?&]color=(\d+)/) || [])[1];
    const size = (categoryHtml.match(/[?&]size=(\d+)/) || [])[1];
    const two = await get(`${categoryPath}?color=${color}&size=${size}`);
    check('filter guard: two filters serve the page with noindex (header and meta)', two.status === 200 && /noindex/.test(two.headers['x-robots-tag'] || '') && /<meta name="robots" content="NOINDEX,NOFOLLOW"/.test(two.text), `${two.headers['x-robots-tag']}`);
    const one = await get(`${categoryPath}?color=${color}`);
    check('filter guard: one filter stays indexable', one.status === 200 && !/noindex/.test(one.headers['x-robots-tag'] || '') && !/NOINDEX/.test(one.text));
    const six = await get(`${categoryPath}?color=${color}&size=${size}&material=1&style_general=2&pattern=3&climate=4`);
    check('filter guard: six filters are refused (400, noindex, before the layout)', six.status === 400 && /noindex/.test(six.headers['x-robots-tag'] || ''), `${six.status} ${six.headers['x-robots-tag']}`);
    const categoryId = (categoryHtml.match(/hyperion\/category\/filter\/?\?id=(\d+)|[?&]id=(\d+)/) || [])[1];
    const fragmentSix = categoryId ? await get(`/hyperion/category/filter?id=${categoryId}&color=${color}&size=${size}&material=1&style_general=2&pattern=3&climate=4`) : { status: 0 };
    check('filter guard: the layered navigation fragment refuses six filters too', fragmentSix.status === 400, `id ${categoryId}: ${fragmentSix.status}`);

    // ---- suggest freshness: an answer cached before a product existed carries no product tag, so only
    // the index run can drop it (Cache::flush() from the fulltext indexer plugin, app cache + Varnish BAN)
    const freshPath = `/hyperion/search/suggest?q=${FRESH_WORD}`;
    const staleFirst = await get(freshPath);
    const staleSecond = await get(freshPath);
    const staleVariant = await get(`/hyperion/search/suggest?q=%20${FRESH_WORD.toUpperCase()}%20`);
    const noProduct = (r) => r.status === 200 && !/data-hyperion-product-id="\d+"/.test(r.text) && !/HYP-FRESH-/.test(r.text);
    check('freshness: an unknown word is answered with no product and cached in both layers', noProduct(staleFirst) && noProduct(staleSecond) && staleSecond.headers['x-magento-cache-debug'] === 'HIT' && staleVariant.headers['x-hyperion-suggest-cache'] === 'hit', `${staleFirst.headers['x-magento-cache-debug']} then ${staleSecond.headers['x-magento-cache-debug']}, variant app ${staleVariant.headers['x-hyperion-suggest-cache']}`);
    let created = null;
    try {
        created = fixture('apply');
        // An install may index by schedule, so the stock, price, EAV and category indexes of the new
        // product are rebuilt too (the search container filters on them); the fulltext reindex
        // comes last. No flush of our own: that reindex must have dropped the cached answers.
        magento('indexer:reindex cataloginventory_stock catalog_product_price catalog_product_attribute catalog_category_product catalogsearch_fulltext >/dev/null');
        const freshSame = await get(freshPath);
        const freshVariant = await get(`/hyperion/search/suggest?q=%20${FRESH_WORD.toUpperCase()}%20`);
        // The query is highlighted inside the product name (<strong>), so compare the text without tags.
        const shows = (r) => r.status === 200 && r.text.replace(/<[^>]+>/g, '').includes(created.name) && /data-hyperion-product-id="\d+"/.test(r.text);
        check('freshness: after the product is created and indexed the same URL is a Varnish MISS (BAN) with the product, and the app cache was flushed too', shows(freshSame) && freshSame.headers['x-magento-cache-debug'] === 'MISS' && freshSame.headers['x-hyperion-suggest-cache'] !== 'hit' && shows(freshVariant) && freshVariant.headers['x-hyperion-suggest-cache'] === 'hit', `${created.sku}: same ${freshSame.headers['x-magento-cache-debug']} / app ${freshSame.headers['x-hyperion-suggest-cache'] || 'miss'}, variant app ${freshVariant.headers['x-hyperion-suggest-cache'] || 'miss'}, shown ${shows(freshSame)}`);
    } finally {
        removeFixture();
        flush();
    }

    // ---- rate limiter (last: the budget of this client stays spent for the window)
    configSet('hyperion/security/search_suggest_limit', '8'); configSet('hyperion/security/catalog_filter_limit', '5'); flush();
    // The limiter counts in 10 second windows of the server clock (same host as this
    // script): start right after a boundary so the whole burst lands in one window.
    await sleep(10000 - (Date.now() % 10000) + 150);
    const statuses = [];
    let limited = null;
    for (let i = 0; i < 14; i++) {
        const r = await get(`/hyperion/search/suggest?q=zz${Date.now()}${i}`);
        statuses.push(r.status);
        if (r.status === 429 && !limited) limited = r;
    }
    check('rate limiter: a burst of uncached suggest requests is cut off with 429', statuses.filter((s) => s === 429).length >= 4 && statuses.slice(0, 8).every((s) => s === 200), statuses.join(','));
    check('rate limiter: 429 carries Retry-After 10, no-store and noindex', limited && limited.headers['retry-after'] === '10' && /no-store/.test(limited.headers['cache-control']) && /noindex/.test(limited.headers['x-robots-tag'] || ''), limited ? JSON.stringify({ retry: limited.headers['retry-after'], cc: limited.headers['cache-control'] }) : 'no 429');
    await sleep(10000 - (Date.now() % 10000) + 150);
    const filterStatuses = [];
    for (let i = 0; i < 9; i++) {
        filterStatuses.push((await get(`/hyperion/category/filter?id=${categoryId}&color=${color}&p=${i + 2}&product_list_limit=${12 + i}`)).status);
    }
    check('rate limiter: the layered navigation fragment has its own budget', filterStatuses.filter((s) => s === 429).length >= 3 && filterStatuses.slice(0, 5).every((s) => s === 200), filterStatuses.join(','));
    await sleep(100);
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
} finally {
    restore();
    await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

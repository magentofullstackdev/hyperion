// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check that a listing keeps its layered filters through every control:
// sort, direction, grid / list switch, page size, pager, Back and Forward,
// Load more and the automatic loading, on a category and on the search
// results; that two quick filter clicks end in one consistent state; and that
// a page number far past the end answers 200. Guest only. The infinite
// loading mode (`hyperion/catalog/infinite_scroll`) is switched for part of
// the run and restored.
// node e2e/pw-listing-state.mjs <baseUrl> <slotDir> [shotsDir]
// <slotDir> is the Magento install directory (the Docker Compose project of the store).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeConfigSnapshot } from './lib/config-snapshot.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <slotDir> [shotsDir]');
    process.exit(2);
}
const u = makeUrl(await resolveUrlSuffix(base));
const slotDir = path.resolve(process.argv[3] || '.');
const shots = process.argv[4] ? path.resolve(process.argv[4]) : '';
if (shots) fs.mkdirSync(shots, { recursive: true });

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
const { configSnapshot, restoreConfig } = makeConfigSnapshot((query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`));
// The two settings the run switches, as stored before it: a setting that only had its config.xml default gets no row at the end.
const MODE_PATHS = ['hyperion/catalog/infinite_scroll', 'hyperion/catalog/infinite_scroll_auto_pages'];
const original = MODE_PATHS.map((configPath) => [configPath, configSnapshot(configPath)]);
const restoreMode = () => {
    for (const [configPath, snapshot] of original) restoreConfig(configPath, snapshot);
    flush();
};
// The cap in force before the run, for the steps that switch the mode and keep the cap.
const originalCap = configShow('hyperion/catalog/infinite_scroll_auto_pages') || '3';
let currentMode = '';
const setMode = (mode, cap) => {
    if (mode === currentMode && cap === undefined) return;
    magento(`config:set hyperion/catalog/infinite_scroll ${mode} >/dev/null`);
    if (cap !== undefined) magento(`config:set hyperion/catalog/infinite_scroll_auto_pages ${cap} >/dev/null`);
    flush();
    currentMode = mode;
};

const JACKETS = u('/women/tops-women/jackets-women.html');
const TOPS = u('/women/tops-women.html');
const searchPath = (query) => `/catalogsearch/result/?q=${encodeURIComponent(query)}`;
// The search queries tried in order until one offers a filter option that spans more than one page.
const SEARCH_QUERIES = ['jacket', 'tee', 'pant', 'strap', 'top', 'bag'];
const GRID = '#hyperion-product-grid';
const TILES = `${GRID} [data-hyperion-tiles] > li`;
const NAV = '#hyperion-layered-nav';
const BUTTON = '[data-hyperion-load-more-button]';
const NEXT = `${GRID} nav a[aria-label="Next page"]`;
const FRAGMENT = /\/hyperion\/(category\/filter|catalog\/search)/;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const helper = await ctx.newPage();
const problems = [];
let loads = 0;
page.on('load', () => { loads++; });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`));
for (const p of [page, helper]) {
    p.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 80)}`); });
}

/** What the shopper sees of the listing: the toolbar count, the tile names, the address bar, the active filter chips. */
const readState = (p) => p.evaluate(([grid, tiles, nav]) => {
    const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const countLine = text(document.querySelector(`${grid} [data-hyperion-toolbar] p`));
    return {
        count: Number((countLine.match(/\d+/) || [NaN])[0]),
        tileNames: [...document.querySelectorAll(`${tiles} h2 a`)].map(text),
        url: location.href,
        filterChips: [...document.querySelectorAll(`${nav} a[data-hyperion-filter]`)].map((a) => a.getAttribute('data-hyperion-filter')),
    };
}, [GRID, TILES, NAV]);
const sameState = (a, b) => a.count === b.count && a.url === b.url && a.tileNames.join('|') === b.tileNames.join('|') && a.filterChips.join('|') === b.filterChips.join('|');
const brief = (s) => `${s.count} products, ${s.tileNames.length} tiles, chips [${s.filterChips.join(',')}], ${s.url.replace(base, '')}`;
const subsetOf = (names, expected) => names.length > 0 && names.every((n) => expected.includes(n));
const hasParam = (url, name, value) => {
    const v = new URL(url).searchParams.get(name);
    return value === undefined ? v !== null : v === String(value);
};
/** Runs an action that issues a listing fragment request and waits until its swap has settled. */
const swap = async (action) => {
    await Promise.all([page.waitForResponse((r) => FRAGMENT.test(r.url()), { timeout: 20000 }), action()]);
    await sleep(500);
};
const pageSizes = (p) => p.evaluate(() => [...document.querySelectorAll('[data-hyperion-toolbar] select[name="product_list_limit"] option')].map((o) => Number(o.value)).filter((n) => n > 0));

/**
 * The filter options the layered navigation offers: request variable, value
 * (read from the option's own link, never assumed) and product count.
 */
const filterOptions = (p) => p.evaluate((nav) => [...document.querySelectorAll(`${nav} details[data-hyperion-filter]`)].flatMap((details) => {
    const name = details.getAttribute('data-hyperion-filter');
    return [...details.querySelectorAll('a[hx-get]')].map((a, index) => {
        const numbers = ((a.getAttribute('aria-label') || a.textContent || '').match(/\d+/g) || []).map(Number);
        return { name, index, value: new URL(a.href).searchParams.get(name), count: numbers.length ? numbers[numbers.length - 1] : 0 };
    }).filter((o) => o.value);
}), NAV);
const clickOption = (option) => page.evaluate(([nav, o]) => {
    const details = document.querySelector(`${nav} details[data-hyperion-filter="${o.name}"]`);
    details.open = true;
    details.querySelectorAll('a[hx-get]')[o.index].click();
}, [NAV, option]);
/**
 * The first option of the preferred filter (any filter otherwise, in the
 * order of the navigation) with more than minCount products and, when the
 * listing total is given, fewer products than the whole listing.
 */
const pickOption = (options, preferred, minCount = 0, total = Infinity) => {
    const usable = options.filter((o) => o.count > minCount && o.count < total);
    return preferred.map((name) => usable.find((o) => o.name === name)).find(Boolean) || usable[0] || null;
};
/** Every product name of a filtered listing, from full page loads of its public URL. */
const expectedSet = async (publicUrl) => {
    const url = new URL(publicUrl);
    for (const name of ['p', 'product_list_limit', 'product_list_order', 'product_list_dir', 'product_list_mode']) url.searchParams.delete(name);
    await helper.goto(url.href, { waitUntil: 'domcontentloaded' });
    const largest = Math.max(0, ...(await pageSizes(helper)));
    if (largest) url.searchParams.set('product_list_limit', String(largest));
    const names = [];
    let total = 0;
    for (let p = 1; p <= 12; p++) {
        url.searchParams.set('p', String(p));
        await helper.goto(url.href, { waitUntil: 'domcontentloaded' });
        const state = await readState(helper);
        if (Number.isFinite(state.count)) total = state.count;
        const fresh = state.tileNames.filter((n) => !names.includes(n));
        names.push(...fresh);
        if (!fresh.length || names.length >= total) break;
    }
    return { names, total };
};
/** Every hx-get of the toolbar, the pager and Load more carries the filter. */
const controlsCarry = (name, value) => page.evaluate(([grid, n, v]) => {
    const controls = [...document.querySelectorAll(`${grid} [data-hyperion-toolbar] [hx-get], ${grid} nav[aria-label="Pagination"] [hx-get], #hyperion-load-more [hx-get]`)];
    const missing = controls.filter((el) => new URL(el.getAttribute('hx-get'), location.href).searchParams.get(n) !== v);
    return { total: controls.length, missing: missing.map((el) => el.getAttribute('hx-get')) };
}, [GRID, name, value]);

/** Checks 6 to 9 on the listing the page shows (one filter active, more than one page): pager, Back, Forward, the static URLs. */
const pagerAndHistory = async (label, option, expected, skipReason = '') => {
    const first = await readState(page);
    if (skipReason) {
        console.log(`SKIP  ${label}: pager, Back and Forward on the filtered listing: ${skipReason}`);
        return;
    }
    if ((await page.locator(NEXT).count()) === 0) {
        check(`${label}: the filtered listing has a second page to walk to`, false, brief(first));
        return;
    }
    await swap(() => page.click(NEXT));
    const second = await readState(page);
    check(`${label}: the next page shows filtered products only, none of page 1, and the address keeps the filter and the page`,
        second.count === first.count && subsetOf(second.tileNames, expected.names) && !second.tileNames.some((n) => first.tileNames.includes(n))
        && hasParam(second.url, option.name, option.value) && hasParam(second.url, 'p', 2) && second.filterChips.length === 1, brief(second));
    const carried = await controlsCarry(option.name, option.value);
    check(`${label}: every toolbar and pager request URL carries the active filter`, carried.total > 2 && carried.missing.length === 0, `${carried.total} controls, missing: ${carried.missing.slice(0, 2).join(' ')}`);

    const loadsBefore = loads;
    // The entry was pushed by htmx: the browser only pops the state, the page then reloads the public URL itself.
    await Promise.all([page.waitForEvent('load', { timeout: 20000 }), page.goBack()]);
    await page.waitForLoadState('networkidle');
    const back = await readState(page);
    const dom = await page.evaluate(() => {
        const sheets = [...document.querySelectorAll('link[data-hyperion-theme-css]')];
        return {
            dialogs: document.querySelectorAll('hyperion-confirm dialog').length,
            sheets: sheets.length,
            distinct: new Set(sheets.map((l) => l.href)).size,
            media: sheets.map((l) => l.media),
            snapshot: sessionStorage.getItem('htmx-history-cache'),
            navigation: performance.getEntriesByType('navigation')[0]?.type || '',
        };
    });
    check(`${label}: Back reloads the previous public URL as a document and shows the state it had`, loads === loadsBefore + 1 && sameState(back, first), `${loads - loadsBefore} load(s), ${dom.navigation}, ${brief(back)}`);
    check(`${label}: after Back the page is a fresh one (one confirm dialog, one theme stylesheet with media all, no htmx history snapshot)`,
        dom.dialogs === 1 && dom.sheets >= 1 && dom.sheets === dom.distinct && dom.media.every((m) => m === 'all') && dom.snapshot === null, JSON.stringify(dom));
    await Promise.all([page.waitForEvent('load', { timeout: 20000 }), page.goForward()]);
    await page.waitForLoadState('networkidle');
    const forward = await readState(page);
    check(`${label}: Forward shows the second page again`, sameState(forward, second), brief(forward));
};

try {
    // ---- category: sort, direction, mode and page size keep the filter
    setMode('disabled');
    await page.goto(base + JACKETS, { waitUntil: 'networkidle' });
    const unfiltered = await readState(page);
    const jacketOptions = await filterOptions(page);
    const color = pickOption(jacketOptions, ['color']);
    if (!color) throw new Error('the category offers no layered filter: ' + brief(unfiltered));
    await swap(() => clickOption(color));
    const filtered = await readState(page);
    check('category: a filter click narrows the listing, puts the filter in the address and shows its chip',
        filtered.count < unfiltered.count && filtered.count > 0 && hasParam(filtered.url, color.name, color.value) && filtered.filterChips.join() === color.name,
        `${unfiltered.count} -> ${brief(filtered)}`);
    const expected = await expectedSet(filtered.url);
    const keeps = (state) => state.count === filtered.count && subsetOf(state.tileNames, expected.names)
        && hasParam(state.url, color.name, color.value) && state.filterChips.join() === color.name;

    await swap(() => page.selectOption(`${GRID} select[name="product_list_order"]`, 'price'));
    let state = await readState(page);
    check('category: sorting by price keeps the filter (count, products, address, chip)', keeps(state) && hasParam(state.url, 'product_list_order', 'price'), brief(state));

    await swap(() => page.click(`${GRID} [data-hyperion-sort-direction]`));
    state = await readState(page);
    check('category: the direction toggle keeps the filter and the sort order', keeps(state) && hasParam(state.url, 'product_list_dir') && hasParam(state.url, 'product_list_order', 'price'), brief(state));

    if ((await page.locator(`${GRID} [data-hyperion-view-mode-link="list"]`).count()) > 0) {
        await swap(() => page.click(`${GRID} [data-hyperion-view-mode-link="list"]`));
        state = await readState(page);
        check('category: the list view switch keeps the filter', keeps(state) && hasParam(state.url, 'product_list_mode', 'list')
            && (await page.getAttribute(`${GRID} [data-hyperion-tiles]`, 'data-hyperion-list-mode')) === 'list', brief(state));
    } else {
        console.log('SKIP  category: the store shows one view mode, no grid / list switch to check');
    }

    const smallest = Math.min(...(await pageSizes(page)));
    await swap(() => page.selectOption(`${GRID} select[name="product_list_limit"]`, String(smallest)));
    state = await readState(page);
    check('category: the smallest page size keeps the filter and the count', keeps(state) && state.tileNames.length <= smallest && hasParam(state.url, 'product_list_limit', smallest), `limit ${smallest}, ${brief(state)}`);
    if (shots) await page.screenshot({ path: path.join(shots, 'listing_state_category.png'), fullPage: false });

    // ---- category: pager, Back, Forward on a filtered listing with several pages
    await page.goto(base + TOPS, { waitUntil: 'networkidle' });
    const topsLimit = Math.min(...(await pageSizes(page)));
    const size = pickOption(await filterOptions(page), ['size', 'color'], topsLimit);
    if (!size) throw new Error('no filter option of the category spans more than one page');
    await swap(() => clickOption(size));
    await swap(() => page.selectOption(`${GRID} select[name="product_list_limit"]`, String(topsLimit)));
    const topsFiltered = await readState(page);
    const topsExpected = await expectedSet(topsFiltered.url);
    check('category: the filtered listing counts what its public URL lists', topsFiltered.count === topsExpected.total && topsExpected.names.length === topsExpected.total, `${topsFiltered.count} / ${topsExpected.total} / ${topsExpected.names.length} names`);
    await pagerAndHistory('category', size, topsExpected);

    // ---- Load more and the automatic loading append filtered products only
    const filteredTops = `${base}${TOPS}?${encodeURIComponent(size.name)}=${encodeURIComponent(size.value)}`;
    setMode('button');
    await page.goto(filteredTops, { waitUntil: 'networkidle' });
    let before = await readState(page);
    let carried = await controlsCarry(size.name, size.value);
    const appendUrl = (await page.getAttribute(BUTTON, 'hx-get')) || '';
    check('load more: the link requests the next page of the filtered listing', carried.missing.length === 0 && /[?&]append=1/.test(appendUrl) && /[?&]p=2/.test(appendUrl), appendUrl);
    await swap(() => page.click(BUTTON));
    let after = await readState(page);
    let statusLine = ((await page.locator('[data-hyperion-load-more-status]').textContent()) || '').replace(/\s+/g, ' ').trim();
    let statusTotal = Number((statusLine.match(/\d+/g) || []).pop());
    check('load more: the appended tiles are filtered products, the status counts the filtered total and the address stays',
        after.tileNames.length > before.tileNames.length && subsetOf(after.tileNames, topsExpected.names) && new Set(after.tileNames).size === after.tileNames.length
        && statusTotal === topsExpected.total && after.url === before.url, `${before.tileNames.length} -> ${after.tileNames.length} tiles, "${statusLine}"`);

    setMode('scroll', 1);
    await page.goto(filteredTops, { waitUntil: 'networkidle' });
    before = await readState(page);
    await Promise.all([
        page.waitForResponse((r) => FRAGMENT.test(r.url()) && /append=1/.test(r.url()), { timeout: 20000 }),
        page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)),
    ]);
    await sleep(600);
    after = await readState(page);
    check('automatic loading: reaching the end appends filtered products only', after.tileNames.length > before.tileNames.length && subsetOf(after.tileNames, topsExpected.names) && after.url === before.url, `${before.tileNames.length} -> ${after.tileNames.length} tiles`);
    setMode('disabled', originalCap);

    // ---- two quick filter clicks: the second wins, the first is aborted
    await page.goto(base + JACKETS, { waitUntil: 'networkidle' });
    const pair = (await filterOptions(page)).filter((o) => o.name === color.name).slice(0, 2);
    if (pair.length < 2) {
        check('two quick filter clicks: the filter offers two options', false, `${pair.length} option(s) of ${color.name}`);
    } else {
        const issued = [];
        const finished = [];
        const onRequest = (r) => { if (FRAGMENT.test(r.url())) issued.push(r.url()); };
        const onFinished = (r) => { if (FRAGMENT.test(r.url())) finished.push(r.url()); };
        page.on('request', onRequest);
        page.on('requestfinished', onFinished);
        // The answers are held back so the first request is still in flight when the second click lands.
        await page.route(FRAGMENT, async (route) => {
            try {
                const response = await route.fetch();
                await sleep(700);
                await route.fulfill({ response });
            } catch { /* the page aborted the request */ }
        });
        await page.evaluate(([nav, a, b]) => {
            const details = document.querySelector(`${nav} details[data-hyperion-filter="${a.name}"]`);
            details.open = true;
            const links = details.querySelectorAll('a[hx-get]');
            const second = links[b.index];
            links[a.index].click();
            setTimeout(() => second.click(), 50);
        }, [NAV, pair[0], pair[1]]);
        await sleep(2500);
        await page.unroute(FRAGMENT);
        page.off('request', onRequest);
        page.off('requestfinished', onFinished);
        const raced = await readState(page);
        const racedExpected = await expectedSet(`${base}${JACKETS}?${encodeURIComponent(pair[1].name)}=${encodeURIComponent(pair[1].value)}`);
        const dimmed = await page.evaluate((grid) => document.querySelector(grid)?.classList.contains('htmx-request') || false, GRID);
        check('two quick filter clicks: the grid, the chips and the address all describe the second click',
            hasParam(raced.url, pair[1].name, pair[1].value) && raced.count === racedExpected.total && subsetOf(raced.tileNames, racedExpected.names)
            && raced.filterChips.join() === pair[1].name, brief(raced));
        check('two quick filter clicks: the first request is aborted, one answer is swapped and the grid is not left dimmed',
            issued.length === 2 && finished.length === 1 && hasParam(finished[0], pair[1].name, pair[1].value) && !dimmed, `${issued.length} issued, ${finished.length} finished, dimmed ${dimmed}`);
    }

    // ---- a page far past the end with a page size the store does not offer
    const categoryId = ((await (await ctx.request.get(base + JACKETS)).text()).match(/hyperion\/category\/filter\/?\?id=(\d+)/) || [])[1];
    const farPage = await ctx.request.get(`${base}${JACKETS}?product_list_limit=1&p=9000`, { maxRedirects: 0 });
    const farFragment = await ctx.request.get(`${base}/hyperion/category/filter/?id=${categoryId}&product_list_limit=1&p=9000`, { maxRedirects: 0 });
    const farSearch = await ctx.request.get(`${base}${searchPath(SEARCH_QUERIES[0])}&product_list_limit=1&p=9000`, { maxRedirects: 0 });
    check('a page number far past the end with an unknown page size answers 200 on the category, its fragment and the search results',
        farPage.status() === 200 && farFragment.status() === 200 && farSearch.status() === 200 && !!categoryId, `${farPage.status()} / ${farFragment.status()} / ${farSearch.status()}, category ${categoryId}`);

    // ---- search results: one filter through sort, page size, pager, Back, Forward
    // The filter option is chosen by its count: more products than the smallest page size (a second
    // page exists) and fewer than the whole result (the click narrows it). The category filter first.
    let query = '';
    let searchAll = null;
    let searchLimit = 0;
    let searchFilter = null;
    const offered = [];
    for (const candidate of SEARCH_QUERIES) {
        await page.goto(base + searchPath(candidate), { waitUntil: 'networkidle' });
        const all = await readState(page);
        const sizes = await pageSizes(page);
        const options = await filterOptions(page);
        offered.push(`${candidate}: ${Number.isFinite(all.count) ? all.count : 0} products, largest option ${Math.max(0, ...options.map((o) => (o.count < all.count ? o.count : 0)))}`);
        if (!sizes.length || !options.length) continue;
        const limit = Math.min(...sizes);
        const spanning = pickOption(options, ['cat'], limit, all.count);
        if (spanning) {
            [query, searchAll, searchLimit, searchFilter] = [candidate, all, limit, spanning];
            break;
        }
        // Kept in case no query has a second page: the first query whose results can at least be narrowed.
        const narrowing = pickOption(options, ['cat'], 0, all.count);
        if (narrowing && !searchFilter) [query, searchAll, searchLimit, searchFilter] = [candidate, all, limit, narrowing];
    }
    if (!searchFilter) throw new Error('no search query offers a layered filter that narrows its results: ' + offered.join('; '));
    const searchSkip = searchFilter.count > searchLimit ? '' : `no filter option of the tried queries has more than ${searchLimit} products (${offered.join('; ')})`;
    if (page.url() !== base + searchPath(query)) await page.goto(base + searchPath(query), { waitUntil: 'networkidle' });
    console.log(`search: query "${query}", filter ${searchFilter.name}=${searchFilter.value} (${searchFilter.count} of ${searchAll.count} products), page size ${searchLimit}`);
    await swap(() => clickOption(searchFilter));
    const searchFiltered = await readState(page);
    check('search: a filter click narrows the results, keeps the query, puts the filter in the address and shows its chip',
        searchFiltered.count < searchAll.count && searchFiltered.count > 0 && hasParam(searchFiltered.url, 'q', query)
        && hasParam(searchFiltered.url, searchFilter.name, searchFilter.value) && searchFiltered.filterChips.join() === searchFilter.name, `${searchAll.count} -> ${brief(searchFiltered)}`);
    const searchExpected = await expectedSet(searchFiltered.url);
    const searchKeeps = (s) => s.count === searchFiltered.count && subsetOf(s.tileNames, searchExpected.names) && hasParam(s.url, 'q', query)
        && hasParam(s.url, searchFilter.name, searchFilter.value) && s.filterChips.join() === searchFilter.name;
    await swap(() => page.selectOption(`${GRID} select[name="product_list_order"]`, 'price'));
    state = await readState(page);
    check('search: sorting by price keeps the filter and the query', searchKeeps(state) && hasParam(state.url, 'product_list_order', 'price'), brief(state));
    await swap(() => page.selectOption(`${GRID} select[name="product_list_limit"]`, String(searchLimit)));
    state = await readState(page);
    check('search: the smallest page size keeps the filter and the count', searchKeeps(state) && state.tileNames.length <= searchLimit && hasParam(state.url, 'product_list_limit', searchLimit), `limit ${searchLimit}, ${brief(state)}`);
    await pagerAndHistory('search', searchFilter, searchExpected, searchSkip);
    if (shots) await page.screenshot({ path: path.join(shots, 'listing_state_search.png'), fullPage: false });

    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (e) {
    check('script completed', false, e.message);
} finally {
    try { restoreMode(); } catch { /* restore failed */ }
    await browser.close();
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(`${results.length - failed.length} / ${results.length} passed`);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed }, null, 2));
process.exit(failed.length ? 1 : 0);

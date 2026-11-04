// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the PDP / PLP completeness: Open Graph tags, low
// stock and quantity increments, product video, MAP on a configurable,
// bundle running total, review breakdown, grid / list switch, per-page
// limiter. node e2e/pw-catalog-completeness.mjs <baseUrl> <slotDir>
// Applies e2e/fixtures/sprint1-fixtures.php (MAP on MH01, a video on
// 24-MB01, stock config) and removes it at the end. Exit code 1 on failure.
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
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sprint1-fixtures.php');
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };

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
const fixtures = (args) => compose('php-fpm', `cd /var/www/html && php /tmp/sprint1-fixtures.php /var/www/html ${args}`, 'www-data').trim();
execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURES, 'php-fpm:/tmp/sprint1-fixtures.php']);
const applied = fixtures('apply');
console.log('fixtures:', applied);
magento('indexer:reindex catalog_product_price cataloginventory_stock catalogsearch_fulltext 2>/dev/null | tail -1');
magento('cache:flush');

const browser = await chromium.launch({ headless: true, ...launchOptions() });
async function newJourney() {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
    return { ctx, page, problems };
}
async function login(page) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', CUSTOMER.email);
    await page.fill('#pass', CUSTOMER.password);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
    return !page.url().includes('/login');
}

try {
    const j = await newJourney();
    const { page } = j;

    // ---- Open Graph (server markup)
    const pdpHtml = await (await page.context().request.get(base + u('/joust-duffle-bag.html'))).text();
    const og = Object.fromEntries([...pdpHtml.matchAll(/<meta property="([^"]+)" content="([^"]*)"\/>/g)].map((m) => [m[1], m[2]]));
    check('open graph: title, type, url, image, description, price, currency, availability', og['og:type'] === 'product' && og['og:title'] === 'Joust Duffle Bag' && /joust-duffle-bag/.test(og['og:url']) && /\.jpg/.test(og['og:image'] || '') && (og['og:description'] || '').length > 10 && /^\d+\.\d\d$/.test(og['product:price:amount'] || '') && /^[A-Z]{3}$/.test(og['product:price:currency'] || '') && og['product:availability'] === 'instock', JSON.stringify(og).slice(0, 220));
    check('open graph: not emitted on a category page', !/<meta property="og:type"/.test(await (await page.context().request.get(base + u('/gear/bags.html'))).text()));

    // ---- stock notices, qty rules, video, breakdown on the PDP
    await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
    const pdp = await page.evaluate(() => ({
        low: document.querySelector('[data-hyperion-low-stock]')?.textContent.trim() || '',
        increments: document.querySelector('[data-hyperion-qty-increments]')?.textContent.trim() || '',
        qty: { value: document.querySelector('#qty')?.value, min: document.querySelector('#qty')?.getAttribute('min'), step: document.querySelector('#qty')?.getAttribute('step'), max: document.querySelector('#qty')?.getAttribute('max') },
        videoThumbs: document.querySelector('hyperion-gallery')?.shadowRoot?.querySelectorAll('[part="thumb"][data-type="video"]').length ?? -1,
        breakdown: document.querySelector('[data-hyperion-rating-breakdown]')?.getAttribute('data-hyperion-rating-breakdown') || '',
        rows: document.querySelectorAll('[data-hyperion-rating-row]').length,
        bars: Array.from(document.querySelectorAll('[data-hyperion-rating-row] [role="progressbar"]')).map((b) => Number(b.getAttribute('aria-valuenow'))),
    }));
    check('stock: "Only N left" under the threshold', /^Only \d+ left$/.test(pdp.low), pdp.low);
    check('stock: quantity increments notice and step / min on the input', /increments of 2$/.test(pdp.increments) && pdp.qty.step === '2' && pdp.qty.min === '2' && pdp.qty.value === '2', JSON.stringify(pdp));
    const videoOk = /"video_entry":\d+|"video_entry":"exists"/.test(applied);
    check(videoOk ? 'video: a video thumbnail in the gallery' : 'video: fixture could not add a video entry (skipped)', !videoOk || pdp.videoThumbs === 1, videoOk ? String(pdp.videoThumbs) : applied.slice(0, 160));
    if (videoOk && pdp.videoThumbs === 1) {
        const frame = await page.evaluate(async () => {
            const g = document.querySelector('hyperion-gallery');
            g.shadowRoot.querySelector('[part="thumb"][data-type="video"]').click();
            await g.updateComplete;
            const src = g.shadowRoot.querySelector('[part="video-frame"]')?.getAttribute('src') || '';
            g.shadowRoot.querySelector('[part="thumb"]:not([data-type="video"])').click();
            await g.updateComplete;
            return { src, after: !!g.shadowRoot.querySelector('[part="video-frame"]') };
        });
        check('video: picking the slide mounts a nocookie iframe, leaving it unmounts it', frame.src.includes('youtube-nocookie.com/embed/') && !frame.after, JSON.stringify(frame));
    }
    const reviewCount = Number(sql("select count(distinct r.review_id) from review r join review_store rs on rs.review_id = r.review_id join rating_option_vote v on v.review_id = r.review_id join catalog_product_entity p on p.entity_id = r.entity_pk_value where p.sku = '24-MB01' and r.status_id = 1 and rs.store_id = 1") || 0);
    check(reviewCount > 0 ? 'reviews: rating breakdown with five rows and percentages that add up' : 'reviews: product has no approved reviews with votes (skipped)', reviewCount === 0 || (Number(pdp.breakdown) === reviewCount && pdp.rows === 5 && Math.abs(pdp.bars.reduce((a, b) => a + b, 0) - 100) <= 2), JSON.stringify({ reviewCount, breakdown: pdp.breakdown, rows: pdp.rows, bars: pdp.bars }));

    // ---- MAP on a configurable: swatches never reveal the real price
    await page.goto(base + '/' + sql("select request_path from url_rewrite where entity_type = 'product' and entity_id = (select entity_id from catalog_product_entity where sku = 'MH01') and store_id = 1 and redirect_type = 0 and metadata is null limit 1"), { waitUntil: 'networkidle' });
    const mapBefore = await page.evaluate(() => ({ popup: !!document.querySelector('#hyperion-product-price [data-hyperion-msrp-open]'), text: document.querySelector('#hyperion-product-price')?.innerText.replace(/\s+/g, ' ') || '' }));
    check('map: configurable renders "Click for price" instead of a price', mapBefore.popup && !/\$\d|€\d/.test(mapBefore.text.replace(/.*Click for price/, '')), mapBefore.text.slice(0, 120));
    const swatchCount = await page.locator('hyperion-swatches').count();
    if (swatchCount) {
        await page.evaluate(async () => {
            const sw = document.querySelector('hyperion-swatches');
            const cfg = JSON.parse(sw.getAttribute('config'));
            for (const attr of Object.values(cfg.attributes)) sw._selectOption(String(attr.id), String(attr.options[0].id));
            await sw.updateComplete;
        });
        await page.waitForTimeout(300);
        const mapAfter = await page.evaluate(() => ({
            popup: !!document.querySelector('#hyperion-product-price [data-hyperion-msrp-open]'),
            struck: document.querySelector('#hyperion-product-price .map-old-price')?.innerText.trim() || '',
            text: document.querySelector('#hyperion-product-price')?.innerText.replace(/\s+/g, ' ') || '',
            actual: document.querySelector('#hyperion-product-price template[data-hyperion-msrp-dialog]')?.content.querySelector('.actual-price')?.textContent.trim() || '',
        }));
        check('map: after picking a variant the real price stays hidden, the MSRP and the popup price are updated', mapAfter.popup && /99/.test(mapAfter.struck) && !/\$5\d|€5\d/.test(mapAfter.text) && /\d/.test(mapAfter.actual), JSON.stringify(mapAfter).slice(0, 220));
    }

    // ---- bundle running total
    await page.goto(base + u('/hyperion-travel-kit.html'), { waitUntil: 'networkidle' });
    const bundle = await page.evaluate(async () => {
        const el = document.querySelector('hyperion-bundle-options');
        const total = () => el.querySelector('[data-hyperion-bundle-total]').textContent.trim();
        const before = total();
        const linesBefore = el.querySelectorAll('[data-hyperion-bundle-summary-list] li').length;
        const box = el.querySelector('input[type="checkbox"]:not(:checked)');
        box?.click();
        const afterCheck = total();
        const qty = el.querySelector('[data-hyperion-bundle-qty]');
        if (qty) { qty.value = '2'; qty.dispatchEvent(new Event('input', { bubbles: true })); }
        return { before, afterCheck, afterQty: total(), linesBefore, linesAfter: el.querySelectorAll('[data-hyperion-bundle-summary-list] li').length, label: el.querySelector('[data-hyperion-bundle-summary]')?.innerText.includes('Price as configured') };
    });
    const num = (s) => Number(String(s).replace(/[^\d.,]/g, '').replace(',', '.'));
    check('bundle: "Price as configured" follows selections and quantities, with a summary list', bundle.label && bundle.linesBefore >= 1 && bundle.linesAfter === bundle.linesBefore + 1 && num(bundle.afterCheck) > num(bundle.before) && num(bundle.afterQty) > num(bundle.afterCheck), JSON.stringify(bundle));

    // ---- swatch filters in the layered navigation
    await page.goto(base + u('/women/tops-women.html'), { waitUntil: 'networkidle' });
    const readSwatchFilter = (code) => {
        const list = document.querySelector(`[data-hyperion-swatch-filter="${code}"]`);
        if (!list) return null;
        const chips = Array.from(list.querySelectorAll('a[data-hyperion-swatch-option]'));
        const contract = (a) => (a.getAttribute('hx-get') || '').includes('/hyperion/category/filter') && (a.getAttribute('hx-get') || '').includes(`&${code}=`)
            && a.getAttribute('hx-target') === '#hyperion-product-grid' && a.getAttribute('hx-swap') === 'outerHTML' && (a.getAttribute('hx-push-url') || '').includes(`${code}=`);
        return {
            kind: list.getAttribute('data-hyperion-swatch-kind'),
            chips: chips.length,
            htmx: chips.every(contract),
            labels: chips.every((a) => /^.+ \(\d+\)$/.test(a.getAttribute('aria-label') || '') && a.getAttribute('title') === a.getAttribute('aria-label')),
            types: [...new Set(chips.map((a) => a.getAttribute('data-hyperion-swatch-type')))],
            painted: chips.filter((a) => /^(#|rgb)/.test(a.querySelector('span[aria-hidden="true"]')?.style.backgroundColor || '')).length,
            round: chips.filter((a) => getComputedStyle(a.querySelector('span[aria-hidden="true"]') || a).borderRadius !== '0px').length,
            light: chips.filter((a) => (a.querySelector('span')?.className || '').includes('ring-inset')).length,
            silent: chips.every((a) => a.getAttribute('data-hyperion-swatch-type') !== 'color' || a.textContent.trim() === ''),
            texts: chips.map((a) => a.textContent.trim()).filter(Boolean),
        };
    };
    const colorFilter = await page.evaluate(`(${readSwatchFilter.toString()})('color')`);
    const sizeFilter = await page.evaluate(`(${readSwatchFilter.toString()})('size')`);
    check('swatch filters: the Color filter renders colour chips with a background colour and no visible text', !!colorFilter && colorFilter.kind === 'visual' && colorFilter.chips > 0 && colorFilter.types.includes('color') && colorFilter.painted === colorFilter.chips && colorFilter.round === colorFilter.chips && colorFilter.silent, JSON.stringify(colorFilter).slice(0, 220));
    check('swatch filters: white colours carry the inner ring', !!colorFilter && colorFilter.light >= 1 && colorFilter.light < colorFilter.chips, JSON.stringify({ light: colorFilter?.light, chips: colorFilter?.chips }));
    check('swatch filters: the Size filter renders text pills with the swatch text', !!sizeFilter && sizeFilter.kind === 'text' && sizeFilter.chips > 0 && sizeFilter.types.join() === 'text' && sizeFilter.texts.length === sizeFilter.chips && sizeFilter.painted === 0, JSON.stringify(sizeFilter).slice(0, 220));
    check('swatch filters: every chip is a link with the HTMX contract of a text item and a "Label (count)" accessible name', !!colorFilter && !!sizeFilter && colorFilter.htmx && sizeFilter.htmx && colorFilter.labels && sizeFilter.labels);
    const tilesBefore = await page.evaluate(() => document.querySelectorAll('[data-hyperion-tile]').length);
    const firstChip = await page.evaluate(() => {
        const list = document.querySelector('[data-hyperion-swatch-filter="color"]');
        list.closest('details').open = true;
        const a = list.querySelector('a[data-hyperion-swatch-option]');
        return { option: a.getAttribute('data-hyperion-swatch-option'), label: a.getAttribute('aria-label'), count: Number((a.getAttribute('aria-label').match(/\((\d+)\)$/) || [])[1]) };
    });
    await Promise.all([
        page.waitForResponse((r) => r.url().includes('/hyperion/category/filter') && r.url().includes(`color=${firstChip.option}`)),
        page.click(`[data-hyperion-swatch-filter="color"] a[data-hyperion-swatch-option="${firstChip.option}"]`),
    ]);
    await page.waitForTimeout(800);
    const afterChip = await page.evaluate(() => ({
        url: location.search,
        tiles: document.querySelectorAll('[data-hyperion-tile]').length,
        active: document.querySelector('#hyperion-active-filters')?.innerText.replace(/\s+/g, ' ').trim() || '',
        sizeChips: document.querySelectorAll('[data-hyperion-swatch-filter="size"] a[data-hyperion-swatch-option]').length,
        colorFacet: !!document.querySelector('[data-hyperion-swatch-filter="color"]'),
        colorChip: !!document.querySelector('#hyperion-active-filters a[data-hyperion-filter="color"]'),
    }));
    const colorName = firstChip.label.replace(/ \(\d+\)$/, '');
    check('swatch filters: clicking a colour chip swaps the grid, pushes the URL and shows the colour in the active filters', /color=\d+/.test(afterChip.url) && afterChip.tiles > 0 && afterChip.tiles <= Math.max(firstChip.count, 1) && (afterChip.tiles !== tilesBefore || afterChip.tiles === firstChip.count) && afterChip.active.includes('Color') && afterChip.active.includes(colorName), JSON.stringify({ firstChip, tilesBefore, afterChip }).slice(0, 220));
    // The fragment swaps the layered navigation out of band with the state of the new URL: like the server
    // render of that URL, the Size pills stay and the applied Color facet leaves the list, its chip is in the state block.
    check('swatch filters: the swapped navigation keeps the Size pills, drops the applied Color facet and shows its chip', afterChip.sizeChips > 0 && !afterChip.colorFacet && afterChip.colorChip, JSON.stringify({ sizeChips: afterChip.sizeChips, colorFacet: afterChip.colorFacet, colorChip: afterChip.colorChip }));
    await page.goto(base + u('/women/tops-women.html') + afterChip.url, { waitUntil: 'networkidle' });
    const reloaded = await page.evaluate(`(${readSwatchFilter.toString()})('size')`);
    check('swatch filters: the server render with an active colour keeps the Size pills and drops the Color chips', !!reloaded && reloaded.kind === 'text' && reloaded.chips > 0 && reloaded.htmx && await page.evaluate(() => !document.querySelector('[data-hyperion-swatch-filter="color"]') && (document.querySelector('#hyperion-active-filters')?.innerText || '').includes('Color')), JSON.stringify(reloaded).slice(0, 200));
    const searchHtml = await (await page.context().request.get(base + '/catalogsearch/result/?q=jacket')).text();
    const searchFilterLinks = [...searchHtml.matchAll(/hx-get="([^"]*)&(?:amp;)?cat=\d+"/g)].map((m) => m[1]);
    check(searchFilterLinks.length ? 'swatch filters: search result filters target the search fragment endpoint' : 'swatch filters: search for "jacket" has no category filter (fragment endpoint check skipped)', searchFilterLinks.every((u) => u.includes('/hyperion/catalog/search/?q=jacket')), searchFilterLinks.slice(0, 2).join(' | '));

    // ---- grid / list switch and the limiter
    await page.goto(base + u('/women/tops-women.html'), { waitUntil: 'networkidle' });
    check('listing: grid mode with a grid / list switch', await page.evaluate(() => document.querySelector('[data-hyperion-list-mode]')?.getAttribute('data-hyperion-list-mode') === 'grid' && document.querySelectorAll('[data-hyperion-view-mode-link]').length === 2));
    await Promise.all([page.waitForResponse((r) => r.url().includes('/hyperion/category/filter') && r.url().includes('product_list_mode=list')), page.click('[data-hyperion-view-mode-link="list"]')]);
    await page.waitForTimeout(800);
    const list = await page.evaluate(() => ({
        mode: document.querySelector('[data-hyperion-list-mode]')?.getAttribute('data-hyperion-list-mode'),
        url: location.search,
        descriptions: document.querySelectorAll('[data-hyperion-tile-description]').length,
        rowTiles: document.querySelectorAll('[data-hyperion-tile].flex-row').length,
        active: document.querySelector('[data-hyperion-view-mode-link="list"]')?.getAttribute('aria-current'),
    }));
    check('listing: list mode over HTMX, URL updated, horizontal cards with a description', list.mode === 'list' && /product_list_mode=list/.test(list.url) && list.rowTiles > 0 && list.active === 'true', JSON.stringify(list));
    await Promise.all([page.waitForResponse((r) => r.url().includes('/hyperion/category/filter')), page.selectOption('[data-hyperion-toolbar] select[name="product_list_order"]', 'name')]);
    await page.waitForTimeout(600);
    check('listing: a sort change keeps the list mode', await page.evaluate(() => document.querySelector('[data-hyperion-list-mode]')?.getAttribute('data-hyperion-list-mode') === 'list'));
    check('listing: a sort change pushes the page URL, never the fragment route', await page.evaluate(() => !location.pathname.startsWith('/hyperion/') && /product_list_order=name/.test(location.search)), page.url().replace(base, ''));
    // The first anchor of a tile is the image link (empty text): the tile's image alt names the product.
    const firstTileBefore = await page.evaluate(() => document.querySelector('[data-hyperion-tile] img')?.getAttribute('alt'));
    await Promise.all([page.waitForResponse((r) => r.url().includes('/hyperion/category/filter') && r.url().includes('product_list_dir=desc')), page.click('[data-hyperion-toolbar] [data-hyperion-sort-direction="desc"]')]);
    await page.waitForTimeout(600);
    const direction = await page.evaluate((before) => ({
        url: location.pathname + location.search,
        first: document.querySelector('[data-hyperion-tile] img')?.getAttribute('alt'),
        flipped: document.querySelector('[data-hyperion-tile] img')?.getAttribute('alt') !== before,
        nextToggle: document.querySelector('[data-hyperion-toolbar] [data-hyperion-sort-direction]')?.getAttribute('data-hyperion-sort-direction'),
        dirInput: document.querySelector('[data-hyperion-toolbar] input[name="product_list_dir"]')?.value,
    }), firstTileBefore);
    check('listing: the sort direction toggle swaps the grid through the fragment and pushes the page URL', !direction.url.startsWith('/hyperion/') && /product_list_dir=desc/.test(direction.url) && direction.flipped && direction.nextToggle === 'asc' && direction.dirInput === 'desc', JSON.stringify(direction));
    check('listing: list mode reachable by URL (search uses plain links)', (await (await page.context().request.get(base + '/catalogsearch/result/?q=bag&product_list_mode=list')).text()).includes('data-hyperion-list-mode="list"'));

    check('customer: login', await login(page), page.url().replace(base, ''));
    await page.goto(base + '/sales/order/history/', { waitUntil: 'networkidle' });
    const limiter = await page.evaluate(() => ({
        present: !!document.querySelector('[data-hyperion-limiter]'),
        links: Array.from(document.querySelectorAll('[data-hyperion-limiter] a')).map((a) => a.textContent.trim()),
        current: document.querySelector('[data-hyperion-limiter] [aria-current="true"]')?.textContent.trim(),
        orders: document.querySelectorAll('[data-hyperion-order-row], table tbody tr').length,
    }));
    check('pager: per-page limiter on the order history', limiter.present && limiter.current === '10' && limiter.links.includes('20') && limiter.links.includes('50'), JSON.stringify(limiter));
    const href = await page.locator('[data-hyperion-limiter] a').first().getAttribute('href');
    await page.goto(href, { waitUntil: 'networkidle' });
    check('pager: following a limiter link applies the limit', /limit=20/.test(page.url()) && await page.evaluate(() => document.querySelector('[data-hyperion-limiter] [aria-current="true"]')?.textContent.trim() === '20'), page.url().replace(base, ''));
    check('no page errors / HTTP 5xx', j.problems.length === 0, j.problems.slice(0, 4).join(' | '));
    await j.ctx.close();
} finally {
    await browser.close();
    console.log('fixtures:', fixtures('remove'));
    compose('php-fpm', 'rm -f /tmp/sprint1-fixtures.php');
    magento('indexer:reindex catalog_product_price cataloginventory_stock 2>/dev/null | tail -1');
    magento('cache:flush');
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

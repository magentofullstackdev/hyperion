// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the PDP / PLP completeness: Open Graph tags, low
// stock and quantity increments, product video, MAP on a configurable,
// bundle running total, review breakdown, grid / list switch, per-page
// limiter; one set of Open Graph tags whoever emits them (the theme, or a
// platform SEO module together with its JSON-LD Product); bundle prices under
// an including-tax catalog display; the variant price in the number format of
// a decimal-comma store view. node e2e/pw-catalog-completeness.mjs <baseUrl> <slotDir>
// Applies e2e/fixtures/sprint1-fixtures.php (MAP on MH01, a video on
// 24-MB01, stock config) and e2e/fixtures/tax-display-fixture.php for the
// bundle tax check, and removes both. Exit code 1 on failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeConfigSnapshot } from './lib/config-snapshot.mjs';

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
const TAX_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tax-display-fixture.php');
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
const taxFixture = (args = '') => JSON.parse(compose('php-fpm', `cd /var/www/html && php /tmp/tax-display-fixture.php /var/www/html ${args}`, 'www-data').trim().split('\n').pop());
// The amount of a formatted price as a number, whatever the symbols of the store view.
const amountOf = (text) => {
    const digits = String(text).replace(/[^\d.,]/g, '');
    const decimal = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
    return decimal === -1 ? Number(digits) : Number(digits.slice(0, decimal).replace(/[.,]/g, '') + '.' + digits.slice(decimal + 1));
};
// The bundle form as the shopper sees it: every selection with its label amount and `data-price`,
// the chosen ones, the running total and the "From" amount of the price box above.
const readBundle = (page) => page.evaluate(() => {
    const el = document.querySelector('hyperion-bundle-options');
    if (!el) return null;
    const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const options = [...el.querySelectorAll('[data-hyperion-bundle-option]')].map((fieldset) => ({
        required: !!fieldset.querySelector('[required]') || !!fieldset.querySelector('legend [aria-hidden="true"]'),
        selections: [...fieldset.querySelectorAll('[data-price][data-name]')].map((input) => ({
            name: input.getAttribute('data-name'),
            price: Number(input.getAttribute('data-price')),
            qty: Number(input.getAttribute('data-qty') || 1),
            chosen: input.tagName === 'OPTION' ? input.selected : input.checked,
            label: text(input.tagName === 'OPTION' ? input : input.closest('label')),
        })),
    }));
    return {
        base: Number(el.getAttribute('data-base-price') || 0),
        options,
        total: text(el.querySelector('[data-hyperion-bundle-total]')),
        summary: [...el.querySelectorAll('[data-hyperion-bundle-summary-list] li')].map((li) => text(li)),
        priceBox: text(document.querySelector('[data-hyperion-pdp-price]')),
    };
});
execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURES, 'php-fpm:/tmp/sprint1-fixtures.php']);
// The fixture removal deletes these rows; a value the store had before the run is put back after it.
const { configSnapshot, restoreConfig } = makeConfigSnapshot(sql);
const fixtureConfig = ['sales/msrp/enabled', 'cataloginventory/options/stock_threshold_qty', 'cataloginventory/item_options/enable_qty_increments', 'cataloginventory/item_options/qty_increments']
    .map((configPath) => [configPath, configSnapshot(configPath)]);
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

    // ---- Open Graph: one set of tags, from the theme or from a platform SEO module
    const pdpHtml = await (await page.context().request.get(base + u('/joust-duffle-bag.html'))).text();
    await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'domcontentloaded' });
    const readHead = () => {
        const metas = {};
        for (const meta of document.head.querySelectorAll('meta[property]')) {
            (metas[meta.getAttribute('property')] ??= []).push(meta.getAttribute('content') ?? '');
        }
        const types = [];
        const collect = (node) => {
            if (Array.isArray(node)) { node.forEach(collect); return; }
            if (!node || typeof node !== 'object') return;
            if (node['@type']) types.push(...[].concat(node['@type']));
            if (node['@graph']) collect(node['@graph']);
        };
        const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
        let unreadable = 0;
        for (const script of scripts) {
            try { collect(JSON.parse(script.textContent)); } catch { unreadable += 1; }
        }
        return { metas, jsonLd: { scripts: scripts.length, inHead: document.head.querySelectorAll('script[type="application/ld+json"]').length, unreadable, types } };
    };
    const head = await page.evaluate(readHead);
    const og = head.metas;
    // A platform SEO module marks its Open Graph output with og:locale; the theme never emits it.
    const ogOwner = og['og:locale'] ? 'platform SEO module' : 'theme';
    console.log(`open graph owner: ${ogOwner}; JSON-LD scripts in the head: ${head.jsonLd.inHead}`);
    const one = (property) => (og[property] ?? []).length === 1;
    const atMostOne = (property) => (og[property] ?? []).length <= 1;
    const first = (property) => (og[property] ?? [''])[0];
    check(
        `open graph: exactly one og:title, og:type, og:url and og:image on a product page (${ogOwner})`,
        ['og:title', 'og:type', 'og:url', 'og:image'].every(one)
            && ['og:description', 'product:price:amount', 'product:price:currency', 'product:availability', 'og:site_name'].every(atMostOne),
        JSON.stringify(Object.fromEntries(Object.entries(og).map(([property, values]) => [property, values.length])))
    );
    check(
        'open graph: title, type, url, image, description, price, currency, availability',
        first('og:type') === 'product' && first('og:title') === 'Joust Duffle Bag' && /joust-duffle-bag/.test(first('og:url')) && /\.(jpe?g|png|webp|avif)/i.test(first('og:image'))
            && first('og:description').length > 10 && /^\d+([.,]\d+)?$/.test(first('product:price:amount')) && (ogOwner !== 'theme' || /^\d+\.\d\d$/.test(first('product:price:amount')))
            && /^[A-Z]{3}$/.test(first('product:price:currency')) && /^(in ?stock|out ?of ?stock|oos)$/i.test(first('product:availability')),
        JSON.stringify(Object.fromEntries(Object.entries(og).map(([property, values]) => [property, values[0]]))).slice(0, 220)
    );
    if (ogOwner === 'theme') {
        check('open graph: not emitted on a category page', !/<meta\s+property="og:type"/.test(await (await page.context().request.get(base + u('/gear/bags.html'))).text()));
    } else {
        await page.goto(base + u('/gear/bags.html'), { waitUntil: 'domcontentloaded' });
        const categoryOg = (await page.evaluate(readHead)).metas;
        check(
            'open graph: the SEO module emits one set on a category page too',
            Object.entries(categoryOg).filter(([property]) => property.startsWith('og:')).every(([, values]) => values.length === 1),
            JSON.stringify(Object.fromEntries(Object.entries(categoryOg).map(([property, values]) => [property, values.length])))
        );
    }
    if (head.jsonLd.inHead > 0) {
        // The platform emits the product as JSON-LD: one Product (or ProductGroup), and the server markup carries no second one as microdata.
        const products = head.jsonLd.types.filter((type) => type === 'Product' || type === 'ProductGroup').length;
        check('structured data: exactly one JSON-LD Product on the product page', products === 1 && head.jsonLd.unreadable === 0, JSON.stringify(head.jsonLd));
        check('structured data: no microdata Product next to the JSON-LD one in the server markup', !/itemtype="https?:\/\/schema\.org\/Product"/i.test(pdpHtml), (pdpHtml.match(/itemtype="[^"]*schema\.org\/Product"/i) || [''])[0]);
    } else {
        console.log('structured data: no JSON-LD in the head, the theme microdata is the only Product (JSON-LD checks skipped)');
    }

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
    await page.reload({ waitUntil: 'networkidle' });
    // The option amounts of the stock tax display, to compare with the including-tax ones below.
    const bundleExcluding = await readBundle(page);
    check('bundle: the summary names the selections in plain text (no literal HTML entity)', !!bundleExcluding && bundleExcluding.summary.length >= 1 && bundleExcluding.summary.every((line) => !/&[a-z]+;|&#/i.test(line)), JSON.stringify(bundleExcluding?.summary ?? []).slice(0, 220));

    // ---- the variant price keeps the number format of a decimal-comma store view
    const commaStore = sql("select code from store where code in ('it_it', 'de_de') and is_active = 1 order by code desc limit 1");
    if (!commaStore) {
        console.log('SKIP  price format: no it_it / de_de store view on this install');
    } else {
        const k = await newJourney();
        // Core's store switch by request parameter; the store cookie keeps it for the context.
        await k.page.goto(base + u('/radiant-tee.html') + `?___store=${commaStore}`, { waitUntil: 'networkidle' });
        await k.page.waitForFunction(() => !!document.querySelector('hyperion-swatches')?.shadowRoot, null, { timeout: 15000 }).catch(() => {});
        const picked = await k.page.evaluate(async () => {
            const sw = document.querySelector('hyperion-swatches');
            if (!sw) return null;
            const cfg = JSON.parse(sw.getAttribute('config'));
            const target = document.querySelector(sw.getAttribute('price-target'));
            const text = (node) => (node?.textContent ?? '').replace(/^\s+|\s+$/g, '');
            const serverNode = target?.querySelector('[data-price-amount]');
            const server = { text: text(serverNode?.querySelector('.price') ?? serverNode), amount: Number(serverNode?.getAttribute('data-price-amount')) };
            for (const attr of Object.values(cfg.attributes)) sw._selectOption(String(attr.id), String(attr.options[0].id));
            await sw.updateComplete;
            const productId = String(sw._currentProductId ?? '');
            return {
                lang: document.documentElement.lang,
                decimalSymbol: cfg.priceFormat?.decimalSymbol ?? null,
                pattern: cfg.priceFormat?.pattern ?? null,
                server,
                productId,
                amount: Number(cfg.optionPrices?.[productId]?.finalPrice?.amount),
                client: text(target?.querySelector('span')),
            };
        });
        if (!picked || picked.decimalSymbol !== ',') {
            console.log(`SKIP  price format: store view ${commaStore} does not use a decimal comma (${JSON.stringify(picked).slice(0, 160)})`);
        } else {
            check(`price format: after a swatch pick on ${commaStore} the price uses the decimal comma`, picked.productId !== '' && /\d,\d{2}(?!\d)/.test(picked.client) && !/\d\.\d{2}(?!\d)/.test(picked.client), JSON.stringify(picked).slice(0, 220));
            const sameAmount = Math.abs(picked.server.amount - picked.amount) < 0.005;
            check(
                sameAmount
                    ? 'price format: the picked variant prints the same text the server rendered for that amount'
                    : 'price format: the picked variant has another amount than the server-rendered one (text comparison skipped)',
                !sameAmount || picked.client === picked.server.text,
                JSON.stringify({ server: picked.server, client: picked.client, amount: picked.amount })
            );
        }
        check('price format: no page errors / HTTP 5xx', k.problems.length === 0, k.problems.slice(0, 4).join(' | '));
        await k.ctx.close();
    }

    // ---- bundle under an including-tax catalog display: option labels, running total and price box agree
    {
        execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', TAX_FIXTURE, 'php-fpm:/tmp/tax-display-fixture.php']);
        let tax = { applied: false, reason: 'fixture did not run' };
        try {
            tax = taxFixture();
            if (!tax.applied) {
                console.log(`SKIP  bundle tax display: ${tax.reason}`);
            } else {
                magento('cache:flush');
                const k = await newJourney();
                await k.page.goto(base + u('/hyperion-travel-kit.html'), { waitUntil: 'networkidle' });
                const taxed = await readBundle(k.page);
                const factor = 1 + tax.rate / 100;
                const before = (bundleExcluding?.options ?? []).flatMap((option) => option.selections);
                const after = (taxed?.options ?? []).flatMap((option) => option.selections);
                check(
                    `bundle tax display: every option amount includes the tax (${tax.rate} %)`,
                    after.length > 0 && after.length === before.length && after.every((selection, i) => Math.abs(selection.price - before[i].price * factor) < 0.011),
                    JSON.stringify(after.map((selection, i) => [before[i]?.price, selection.price])).slice(0, 220)
                );
                check(
                    'bundle tax display: each option label prints its own amount',
                    after.length > 0 && after.every((selection) => Math.abs(amountOf(selection.label.slice(selection.label.lastIndexOf('+'))) - selection.price) < 0.006),
                    JSON.stringify(after.map((selection) => [selection.label, selection.price])).slice(0, 220)
                );
                const chosen = after.filter((selection) => selection.chosen);
                const expectedTotal = (taxed?.base ?? 0) + chosen.reduce((sum, selection) => sum + selection.price, 0);
                check(
                    'bundle tax display: the running total is the sum of the chosen option amounts',
                    chosen.length > 0 && Math.abs(amountOf(taxed.total) - expectedTotal) < 0.011,
                    JSON.stringify({ total: taxed?.total, expectedTotal, chosen: chosen.map((selection) => selection.price) })
                );
                // The price box starts "From" the cheapest selection of every required option (or the cheapest one of all).
                const required = (taxed?.options ?? []).filter((option) => option.required && option.selections.length);
                const cheapest = (option) => Math.min(...option.selections.map((selection) => selection.price));
                const expectedFrom = (taxed?.base ?? 0) + (required.length
                    ? required.reduce((sum, option) => sum + cheapest(option), 0)
                    : Math.min(...after.map((selection) => selection.price)));
                const from = amountOf((taxed?.priceBox.match(/\d[\d.,]*/) || [''])[0]);
                check(
                    'bundle tax display: the "From" amount of the price box agrees with the option amounts',
                    after.length > 0 && Math.abs(from - expectedFrom) < 0.011 * Math.max(1, required.length),
                    JSON.stringify({ priceBox: taxed?.priceBox, from, expectedFrom })
                );
                check('bundle tax display: no page errors / HTTP 5xx', k.problems.length === 0, k.problems.slice(0, 4).join(' | '));
                await k.ctx.close();
            }
        } finally {
            const removed = taxFixture('--remove');
            compose('php-fpm', 'rm -f /tmp/tax-display-fixture.php');
            magento('cache:flush');
            if (tax.applied) check('bundle tax display: the tax configuration is back as it was found', removed.removed === true, JSON.stringify(removed));
        }
    }

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
    check('swatch filters: the Color filter renders color chips with a background color and no visible text', !!colorFilter && colorFilter.kind === 'visual' && colorFilter.chips > 0 && colorFilter.types.includes('color') && colorFilter.painted === colorFilter.chips && colorFilter.round === colorFilter.chips && colorFilter.silent, JSON.stringify(colorFilter).slice(0, 220));
    check('swatch filters: white colors carry the inner ring', !!colorFilter && colorFilter.light >= 1 && colorFilter.light < colorFilter.chips, JSON.stringify({ light: colorFilter?.light, chips: colorFilter?.chips }));
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
    check('swatch filters: clicking a color chip swaps the grid, pushes the URL and shows the color in the active filters', /color=\d+/.test(afterChip.url) && afterChip.tiles > 0 && afterChip.tiles <= Math.max(firstChip.count, 1) && (afterChip.tiles !== tilesBefore || afterChip.tiles === firstChip.count) && afterChip.active.includes('Color') && afterChip.active.includes(colorName), JSON.stringify({ firstChip, tilesBefore, afterChip }).slice(0, 220));
    // The fragment swaps the layered navigation out of band with the state of the new URL: like the server
    // render of that URL, the Size pills stay and the applied Color facet leaves the list, its chip is in the state block.
    check('swatch filters: the swapped navigation keeps the Size pills, drops the applied Color facet and shows its chip', afterChip.sizeChips > 0 && !afterChip.colorFacet && afterChip.colorChip, JSON.stringify({ sizeChips: afterChip.sizeChips, colorFacet: afterChip.colorFacet, colorChip: afterChip.colorChip }));
    await page.goto(base + u('/women/tops-women.html') + afterChip.url, { waitUntil: 'networkidle' });
    const reloaded = await page.evaluate(`(${readSwatchFilter.toString()})('size')`);
    check('swatch filters: the server render with an active color keeps the Size pills and drops the Color chips', !!reloaded && reloaded.kind === 'text' && reloaded.chips > 0 && reloaded.htmx && await page.evaluate(() => !document.querySelector('[data-hyperion-swatch-filter="color"]') && (document.querySelector('#hyperion-active-filters')?.innerText || '').includes('Color')), JSON.stringify(reloaded).slice(0, 200));
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
    for (const [configPath, snapshot] of fixtureConfig) restoreConfig(configPath, snapshot);
    compose('php-fpm', 'rm -f /tmp/sprint1-fixtures.php');
    magento('indexer:reindex catalog_product_price cataloginventory_stock 2>/dev/null | tail -1');
    magento('cache:flush');
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
console.log(`${results.length - failed.length} / ${results.length} passed`);
process.exit(failed.length ? 1 : 0);

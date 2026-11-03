#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the per variant "Only N left" notice on a configurable product page.
// Usage: node e2e/pw-variant-stock.mjs <baseUrl> <slotDir>
// Lowers the stock of one child of the Radiant Tee (WS12-S-Orange, 3 units) through
// e2e/fixtures/variant-stock-fixture.php, sets cataloginventory/options/stock_threshold_qty to 10,
// opens the product page, picks that variant (notice shown), picks another one (notice hidden),
// then restores the quantity and the setting and checks that the config carries no notices
// without a threshold. No login needed. Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> <slotDir>');
    process.exit(2);
}
const slot = args.find((a) => !a.startsWith('http') && !a.startsWith('--')) ?? '.';
const slotDir = path.resolve(slot);
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'variant-stock-fixture.php');
const PARENT_SKU = 'WS12';
const LOW_SKU = 'WS12-S-Orange';
const LOW_QTY = 3;
const THRESHOLD = 10;
const THRESHOLD_PATH = 'cataloginventory/options/stock_threshold_qty';

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
const configValue = (p) => { const v = sql(`select value from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`); return v === '' ? null : v; };
function restoreConfig(p, previous) {
    if (previous === null) sql(`delete from core_config_data where scope = 'default' and scope_id = 0 and path = '${p}'`);
    else magento(`config:set ${p} ${JSON.stringify(previous)}`);
}
const setStock = (sku, qty) => JSON.parse(compose('php-fpm', `cd /var/www/html && php /tmp/variant-stock-fixture.php /var/www/html set ${sku} ${qty}`, 'www-data').trim());
function reindexStock() {
    // Both indexers exist on MSI, only the first one without it.
    for (const indexer of ['cataloginventory_stock', 'inventory']) {
        try { magento(`indexer:reindex ${indexer} 2>&1 | tail -1`); } catch (_e) { /* not installed */ }
    }
    magento('cache:flush');
}
const productPath = (sku) => sql(`select request_path from url_rewrite where entity_type = 'product' and entity_id = (select entity_id from catalog_product_entity where sku = '${sku}') and store_id = 1 and redirect_type = 0 and metadata is null limit 1`);

execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', FIXTURE, 'php-fpm:/tmp/variant-stock-fixture.php']);
const lowChildId = Number(sql(`select entity_id from catalog_product_entity where sku = '${LOW_SKU}'`));
const pdpPath = '/' + productPath(PARENT_SKU);
const previousThreshold = configValue(THRESHOLD_PATH);
const stock = setStock(LOW_SKU, LOW_QTY);
console.log('fixture:', JSON.stringify(stock), 'child id', lowChildId, 'pdp', pdpPath);
magento(`config:set ${THRESHOLD_PATH} ${THRESHOLD}`);
reindexStock();

const browser = await chromium.launch({ headless: true, ...launchOptions() });
const problems = [];
try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });

    await page.goto(base + pdpPath, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('hyperion-swatches')?.shadowRoot?.querySelector('[data-option-id]'), null, { timeout: 20000 }).catch(() => {});

    const markup = await page.evaluate((childId) => {
        const sw = document.querySelector('hyperion-swatches');
        const cfg = JSON.parse(sw.getAttribute('config'));
        const target = document.getElementById('hyperion-variant-stock');
        return {
            notices: cfg.stockNotices ?? null,
            variants: Object.keys(cfg.index ?? {}).length,
            lowInIndex: Boolean(cfg.index?.[String(childId)]),
            targetPresent: !!target,
            targetHidden: target ? target.hidden : null,
            targetText: target ? target.textContent.trim() : null,
            stockTarget: sw.getAttribute('stock-target'),
        };
    }, lowChildId);
    check('config: stockNotices carries exactly the lowered child', JSON.stringify(markup.notices) === JSON.stringify({ [lowChildId]: `Only ${LOW_QTY} left` }), JSON.stringify(markup.notices));
    check('markup: hidden variant stock element and the stock-target of the swatches', markup.targetPresent && markup.targetHidden === true && markup.targetText === '' && markup.stockTarget === '#hyperion-variant-stock', JSON.stringify(markup));
    check('config: the lowered child is a variant of the page', markup.lowInIndex && markup.variants > 1, `variants ${markup.variants}`);

    const picked = await page.evaluate(async (childId) => {
        const sw = document.querySelector('hyperion-swatches');
        const cfg = JSON.parse(sw.getAttribute('config'));
        const options = cfg.index[String(childId)];
        for (const [attrId, optionId] of Object.entries(options)) sw._selectOption(String(attrId), String(optionId));
        await sw.updateComplete;
        const target = document.getElementById('hyperion-variant-stock');
        return { productId: sw._currentProductId, hidden: target.hidden, text: target.textContent.trim(), display: getComputedStyle(target).display };
    }, lowChildId);
    check('pick: the lowered variant shows "Only 3 left"', String(picked.productId) === String(lowChildId) && !picked.hidden && picked.text === `Only ${LOW_QTY} left` && picked.display !== 'none', JSON.stringify(picked));

    const other = await page.evaluate(async (childId) => {
        const sw = document.querySelector('hyperion-swatches');
        const cfg = JSON.parse(sw.getAttribute('config'));
        // Every size exists in every colour on the sample data, so any other variant is reachable option by option.
        const otherId = Object.keys(cfg.index).find((id) => String(id) !== String(childId));
        for (const [attrId, optionId] of Object.entries(cfg.index[otherId])) sw._selectOption(String(attrId), String(optionId));
        await sw.updateComplete;
        const target = document.getElementById('hyperion-variant-stock');
        return { productId: sw._currentProductId, otherId, hidden: target.hidden, text: target.textContent.trim(), display: getComputedStyle(target).display };
    }, lowChildId);
    check('pick: a variant with more stock hides the notice', String(other.productId) === String(other.otherId) && other.hidden && other.text === '' && other.display === 'none', JSON.stringify(other));
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
    await ctx.close();
} finally {
    await browser.close();
    setStock(LOW_SKU, stock.previous_qty);
    restoreConfig(THRESHOLD_PATH, previousThreshold);
    reindexStock();
    console.log('stock and config restored');
}

// Without a threshold (the default) the config carries no notices at all.
if (previousThreshold === null || Number(previousThreshold) <= 0) {
    const ctx = await (await chromium.launch({ headless: true, ...launchOptions() })).newContext({ ignoreHTTPSErrors: true });
    const html = await (await ctx.request.get(base + pdpPath)).text();
    check('threshold 0: no stockNotices in the swatch config', html.includes('hyperion-swatches') && !html.includes('stockNotices'), `${html.length} bytes`);
    await ctx.browser().close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
process.exit(failed.length ? 1 : 0);

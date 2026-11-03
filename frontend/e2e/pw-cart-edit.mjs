#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the cart line edit: the cart line "Edit" opens core's checkout/cart/configure page
// with the line's options and quantity preselected, and "Update Cart" replaces the line in place.
// Usage: node e2e/pw-cart-edit.mjs <baseUrl> <slotDir>
// Guest only (no reCAPTCHA relaxation needed). A configurable (Chaz Kangeroo Hoodie, MH01) with a
// chosen size, colour and quantity 2, then a bundle (Luma's Sprite Yoga Companion Kit when it is
// saleable, else the sample data Travel Kit). The install directory is used to look up product URLs.
// Exit code 1 on any failure.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
const CONFIGURABLE_SKU = 'MH01';
const BUNDLE_PATHS = ['/sprite-yoga-companion-kit.html', '/hyperion-travel-kit.html'];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail).slice(0, 220) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 220) : ''}`);
};
function compose(service, cmd, user) {
    const userArgs = user ? ['-u', user] : [];
    return execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...userArgs, service, 'bash', '-c', cmd], { encoding: 'utf8' });
}
const sql = (query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`).trim();
const productPath = (sku) => '/' + sql(`select request_path from url_rewrite where entity_type = 'product' and entity_id = (select entity_id from catalog_product_entity where sku = '${sku}') and store_id = 1 and redirect_type = 0 and metadata is null limit 1`);

const browser = await chromium.launch({ headless: true, ...launchOptions() });
// X-Magento-Debug: the VCL shows the cache verdict only on a debug exchange.
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 1000 }, extraHTTPHeaders: { 'X-Magento-Debug': '1' } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });

async function toast() {
    await page.waitForFunction(() => { const n = document.querySelector('#hyperion-notification'); return n && !n.hidden && n.innerText.trim().length > 0; }, null, { timeout: 25000 }).catch(() => {});
    return page.evaluate(() => { const n = document.querySelector('#hyperion-notification'); return n ? { tone: n.getAttribute('data-tone'), text: n.innerText.trim().replace(/\s+/g, ' ').slice(0, 140) } : null; });
}
const waitSwatches = () => page.waitForFunction(() => document.querySelector('hyperion-swatches')?.shadowRoot?.querySelector('[data-option-id]'), null, { timeout: 20000 }).catch(() => {});
const cartLines = () => page.evaluate(() => [...document.querySelectorAll('[data-hyperion-cart-item]')].map((li) => ({
    id: li.getAttribute('data-item-id'),
    name: li.querySelector('a.text-sm')?.textContent.trim() ?? '',
    options: li.querySelector('dl')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    qty: li.querySelector('input[name^="cart["]')?.value ?? '',
    edit: li.querySelector('[data-hyperion-cart-edit]')?.getAttribute('href') ?? '',
})));
// The state of the product form on a configure page.
const configureState = () => page.evaluate(() => {
    const form = document.querySelector('#product_addtocart_form');
    const sw = document.querySelector('hyperion-swatches');
    return {
        url: location.pathname,
        action: form?.getAttribute('action') ?? '',
        hxPost: form?.hasAttribute('hx-post') ?? null,
        item: form?.getAttribute('data-hyperion-cart-configure') ?? '',
        qty: document.querySelector('#qty')?.value ?? '',
        button: form?.querySelector('button[type="submit"]')?.textContent.trim() ?? '',
        deadInit: document.querySelectorAll('script[type="text/x-magento-init"], [data-mage-init]').length,
        requireCalls: [...document.scripts].filter((el) => !el.src && /\brequire(\.config)?\s*\(/.test(el.textContent)).length,
        notice: !!document.querySelector('[data-hyperion-cart-configure-notice]'),
        checked: sw ? [...sw.shadowRoot.querySelectorAll('[aria-checked="true"]')].map((b) => `${b.dataset.attributeId}=${b.dataset.optionId}`).sort() : [],
        inputs: form ? [...form.querySelectorAll('input[name^="super_attribute["]')].map((i) => `${i.name.replace(/\D/g, '')}=${i.value}`).sort() : [],
        bundle: Object.fromEntries([...document.querySelectorAll('[data-hyperion-bundle-option]')].map((fs) => {
            const select = fs.querySelector('select');
            const values = select
                ? [...select.selectedOptions].map((o) => o.value).filter((v) => v !== '')
                : [...fs.querySelectorAll('input[name^="bundle_option["]:checked')].map((i) => i.value).filter((v) => v !== '');
            return [fs.getAttribute('data-hyperion-bundle-option'), { values, qty: fs.querySelector('[data-hyperion-bundle-qty]')?.value ?? null }];
        })),
    };
});

try {
    // ------------------------------------------------------------ configurable: add with options and qty 2
    const pdpPath = productPath(CONFIGURABLE_SKU);
    await page.goto(base + pdpPath, { waitUntil: 'networkidle' });
    await waitSwatches();
    const chosen = await page.evaluate(async () => {
        const sw = document.querySelector('hyperion-swatches');
        const cfg = JSON.parse(sw.getAttribute('config'));
        const attrs = Object.values(cfg.attributes).sort((a, b) => Number(a.position) - Number(b.position));
        const picks = {};
        for (const attr of attrs) {
            // Not the first option: the test must not pass by accident on a "first option" default.
            const opt = attr.options.find((o, i) => i > 0 && sw._isOptionAvailable(attr.id, o.id)) ?? attr.options.find((o) => sw._isOptionAvailable(attr.id, o.id));
            sw._selectOption(String(attr.id), String(opt.id));
            picks[String(attr.id)] = { optionId: String(opt.id), label: opt.label, attribute: attr.label, code: attr.code };
        }
        await sw.updateComplete;
        return { picks, productId: String(cfg.productId), childId: String(sw._currentProductId), name: document.querySelector('#hyperion-product-title')?.innerText.trim() };
    });
    check('pdp: a variant chosen on the hoodie', Object.keys(chosen.picks).length >= 2 && chosen.childId !== 'null', JSON.stringify(Object.values(chosen.picks).map((p) => p.label)));
    await page.fill('#qty', '2');
    await page.click('#product_addtocart_form button[type="submit"]');
    const t1 = await toast();
    check('pdp: added to the cart (success toast)', t1?.tone === 'success', JSON.stringify(t1));

    // ------------------------------------------------------------ cart: the Edit link
    await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
    let lines = await cartLines();
    const expectedOptions = Object.values(chosen.picks).map((p) => p.label);
    check('cart: one line with the chosen options and qty 2', lines.length === 1 && lines[0].qty === '2' && expectedOptions.every((l) => lines[0].options.includes(l)), JSON.stringify(lines));
    const editMatch = lines[0]?.edit.match(/\/checkout\/cart\/configure\/id\/(\d+)\/product_id\/(\d+)\//);
    check('cart: Edit links to checkout/cart/configure with the item and the product', !!editMatch && editMatch[1] === lines[0].id && editMatch[2] === chosen.productId, lines[0]?.edit ?? '(none)');
    const itemId = editMatch?.[1] ?? '';

    const configureResponse = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/checkout/cart/configure/') && r.request().resourceType() === 'document', { timeout: 30000 }).catch(() => null),
        page.click('[data-hyperion-cart-edit]'),
    ]).then(([r]) => r);
    await page.waitForLoadState('networkidle');
    await waitSwatches();
    const cacheControl = configureResponse?.headers()['cache-control'] ?? '';
    const verdict = configureResponse?.headers()['x-magento-cache-debug'] ?? '';
    check('configure: page never cached (UNCACHEABLE, no public max-age)', configureResponse && configureResponse.status() === 200 && !/max-age=[1-9]/.test(cacheControl) && (verdict === '' || verdict === 'UNCACHEABLE'), `${configureResponse?.status()} ${cacheControl} ${verdict}`);
    let state = await configureState();
    const expectedPicks = Object.entries(chosen.picks).map(([attrId, p]) => `${attrId}=${p.optionId}`).sort();
    check('configure: product page with the form posting to updateItemOptions as a plain POST', state.url.includes('/checkout/cart/configure/') && state.action.includes(`/checkout/cart/updateItemOptions/id/${itemId}/`) && state.hxPost === false && state.item === itemId, JSON.stringify({ url: state.url, action: state.action, hxPost: state.hxPost, item: state.item }));
    check('configure: "Update Cart" button and the editing notice', state.button === 'Update Cart' && state.notice, JSON.stringify({ button: state.button, notice: state.notice }));
    check('configure: no RequireJS markup on the page (x-magento-init, require calls)', state.deadInit === 0 && state.requireCalls === 0, JSON.stringify({ deadInit: state.deadInit, requireCalls: state.requireCalls }));
    check('configure: quantity 2 preselected', state.qty === '2', state.qty);
    check('configure: the swatches and the hidden inputs carry the chosen options', JSON.stringify(state.checked) === JSON.stringify(expectedPicks) && JSON.stringify(state.inputs) === JSON.stringify(expectedPicks), JSON.stringify({ checked: state.checked, inputs: state.inputs, expected: expectedPicks }));

    // ------------------------------------------------------------ configure: change the colour, Update Cart
    const colourEntry = Object.entries(chosen.picks).find(([, p]) => p.code === 'color') ?? Object.entries(chosen.picks)[0];
    const newColour = await page.evaluate(async ([attrId, current]) => {
        const sw = document.querySelector('hyperion-swatches');
        const cfg = JSON.parse(sw.getAttribute('config'));
        const attr = cfg.attributes[attrId];
        const opt = attr.options.find((o) => String(o.id) !== current && sw._isOptionAvailable(attr.id, o.id));
        sw._selectOption(String(attr.id), String(opt.id));
        await sw.updateComplete;
        return { optionId: String(opt.id), label: opt.label };
    }, [colourEntry[0], colourEntry[1].optionId]);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
        page.click('#product_addtocart_form button[type="submit"]'),
    ]);
    check('update: back on the cart page', /\/checkout\/cart\/?$/.test(page.url().replace(base, '')), page.url().replace(base, ''));
    await page.waitForFunction(() => (document.querySelector('[data-hyperion-messages]')?.innerText ?? '').includes('updated'), null, { timeout: 10000 }).catch(() => {});
    const message = await page.evaluate(() => document.querySelector('[data-hyperion-messages]')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
    check('update: "was updated in your shopping cart" message', message.includes('was updated in your shopping cart'), message.slice(0, 120));
    lines = await cartLines();
    check('update: ONE line, the new colour, the old one gone, qty 2 kept', lines.length === 1 && lines[0].options.includes(newColour.label) && !lines[0].options.includes(colourEntry[1].label) && lines[0].qty === '2', JSON.stringify({ lines, newColour: newColour.label, oldColour: colourEntry[1].label }));

    // ------------------------------------------------------------ bundle: open the Edit with the options preselected
    let bundleName = '';
    let expectedBundle = null;
    for (const candidate of BUNDLE_PATHS) {
        await page.goto(base + candidate, { waitUntil: 'networkidle' });
        if (await page.locator('#product_addtocart_form [data-hyperion-bundle-option]').count() > 0) {
            bundleName = await page.evaluate(() => document.querySelector('#hyperion-product-title')?.innerText.trim() ?? '');
            break;
        }
    }
    check('bundle: a saleable bundle with options found', bundleName !== '', bundleName || BUNDLE_PATHS.join(', '));
    if (bundleName) {
        // Not the defaults: the last selection of every option, every changeable quantity 2.
        expectedBundle = await page.evaluate(() => {
            const out = {};
            for (const fs of document.querySelectorAll('[data-hyperion-bundle-option]')) {
                const select = fs.querySelector('select');
                let values;
                if (select) {
                    const options = [...select.options].filter((o) => o.value !== '');
                    const pick = options[options.length - 1];
                    for (const o of select.options) o.selected = o === pick;
                    values = [pick.value];
                } else {
                    const inputs = [...fs.querySelectorAll('input[name^="bundle_option["]')].filter((i) => i.value !== '');
                    const pick = inputs[inputs.length - 1];
                    for (const i of inputs) i.checked = i === pick;
                    values = [pick.value];
                }
                const qty = fs.querySelector('[data-hyperion-bundle-qty]');
                if (qty) qty.value = '2';
                out[fs.getAttribute('data-hyperion-bundle-option')] = { values, qty: qty ? '2' : null };
            }
            return out;
        });
        await page.click('#product_addtocart_form button[type="submit"]');
        const t2 = await toast();
        check('bundle: added to the cart (success toast)', t2?.tone === 'success', JSON.stringify(t2));
        await page.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        lines = await cartLines();
        const bundleLine = lines.find((l) => l.name === bundleName);
        check('cart: the bundle line has an Edit link', !!bundleLine && /\/checkout\/cart\/configure\/id\/\d+\/product_id\/\d+\//.test(bundleLine.edit), JSON.stringify(bundleLine));
        if (bundleLine) {
            await page.goto(base + bundleLine.edit.replace(base, ''), { waitUntil: 'networkidle' });
            state = await configureState();
            check('bundle configure: form posts to updateItemOptions, "Update Cart" button', state.action.includes(`/checkout/cart/updateItemOptions/id/${bundleLine.id}/`) && state.hxPost === false && state.button === 'Update Cart', JSON.stringify({ action: state.action, button: state.button }));
            check('bundle configure: every option preselected as chosen, quantities too', JSON.stringify(state.bundle) === JSON.stringify(expectedBundle), JSON.stringify({ actual: state.bundle, expected: expectedBundle }));
            // Update Cart on the bundle: still one bundle line, the whole cart still two lines.
            await page.fill('#qty', '3');
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
                page.click('#product_addtocart_form button[type="submit"]'),
            ]);
            lines = await cartLines();
            const after = lines.filter((l) => l.name === bundleName);
            check('bundle update: one bundle line with qty 3, two lines in the cart', after.length === 1 && after[0].qty === '3' && lines.length === 2, JSON.stringify(lines));
        }
    }
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
} finally {
    await ctx.close();
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => `${f.name}: ${f.detail}`) }, null, 2));
process.exit(failed.length ? 1 : 0);

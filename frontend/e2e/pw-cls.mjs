// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of layout stability and motion: the cumulative
// layout shift of the key page types must be 0 under a slow network and a
// slowed CPU, desktop and phone (the Layout Instability API reports every
// shift with its source); the server rendered skeletons of the swatches and
// of the gallery thumbnails measure exactly what the components render
// (chunks blocked vs upgraded); the motion knob and the view transitions are
// in place and a grid swap goes through them.
// node e2e/pw-cls.mjs <baseUrl> [--pages n]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> ...');
    process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 260) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = ['/', '/women/tops-women.html', '/women/tops-women.html?product_list_mode=list', '/radiant-tee.html', '/push-it-messenger-bag.html', '/catalogsearch/result/?q=jacket', '/women.html', '/checkout/cart/', '/contact/'];
const CATEGORY = '/women/tops-women.html';
const PDP = '/radiant-tee.html';

const browser = await chromium.launch({ headless: true });
const context = (mobile) => browser.newContext({ ignoreHTTPSErrors: true, viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const throttle = async (ctx, page) => {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
};
const observeShifts = (page) => page.addInitScript(() => {
    window.__shifts = [];
    const describe = (n) => (n && n.tagName ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : String(n));
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            window.__shifts.push({ value: e.value, t: Math.round(e.startTime), sources: (e.sources || []).slice(0, 3).map((s) => describe(s.node)) });
        }
    }).observe({ type: 'layout-shift', buffered: true });
});

try {
    // ---- CLS of every page type, desktop and phone, throttled
    for (const mobile of [false, true]) {
        const ctx = await context(mobile);
        const page = await ctx.newPage();
        await throttle(ctx, page);
        await observeShifts(page);
        const report = [];
        let worst = 0;
        for (const p of PAGES) {
            await ctx.clearCookies();
            await page.goto('about:blank');
            await page.goto(base + p, { waitUntil: 'load' });
            await sleep(5000);
            const shifts = await page.evaluate(() => window.__shifts);
            const cls = shifts.reduce((a, s) => a + s.value, 0);
            worst = Math.max(worst, cls);
            if (cls > 0) report.push(`${p} ${cls.toFixed(4)} (${shifts.map((s) => s.sources.join('|')).join('; ').slice(0, 120)})`);
        }
        check(`cls: no layout shift on ${PAGES.length} page types (${mobile ? 'phone' : 'desktop'}, slow network, 4x slower CPU)`, worst === 0, report.length ? report.join(' || ') : 'every page 0');
        await ctx.close();
    }

    // ---- skeleton parity: swatches on tiles and on the product page, gallery thumbnails
    const measure = async (url, block) => {
        const ctx = await context(false);
        const page = await ctx.newPage();
        if (block) await page.route(/hyperion-(swatches|gallery)[^/]*\.js/, (r) => r.abort());
        await page.goto(base + url, { waitUntil: 'networkidle' });
        await sleep(1500);
        const data = await page.evaluate(() => ({
            swatches: [...document.querySelectorAll('hyperion-swatches')].slice(0, 8).map((el) => Math.round(el.getBoundingClientRect().height)),
            tiles: [...document.querySelectorAll('[data-hyperion-tile]')].slice(0, 8).map((el) => Math.round(el.getBoundingClientRect().height)),
            gallery: Math.round(document.querySelector('hyperion-gallery')?.getBoundingClientRect().height || 0),
            column: Math.round(document.querySelector('[data-product-gallery] ~ div')?.getBoundingClientRect().height || 0),
            skeletons: document.querySelectorAll('[data-hyperion-swatch-skeleton], [data-hyperion-gallery-skeleton]').length,
            defined: !!customElements.get('hyperion-swatches'),
        }));
        await ctx.close();
        return data;
    };
    const tilesBefore = await measure(CATEGORY, true);
    const tilesAfter = await measure(CATEGORY, false);
    check('skeleton: the tile swatches skeleton has the height of the upgraded component (first 8 tiles)', tilesBefore.swatches.length > 0 && !tilesBefore.defined && tilesAfter.defined && tilesBefore.swatches.join() === tilesAfter.swatches.join() && tilesBefore.tiles.join() === tilesAfter.tiles.join() && tilesBefore.skeletons > 0, `swatches ${tilesBefore.swatches.join(',')} -> ${tilesAfter.swatches.join(',')}; tiles ${tilesBefore.tiles.join(',')} -> ${tilesAfter.tiles.join(',')}`);
    const pdpBefore = await measure(PDP, true);
    const pdpAfter = await measure(PDP, false);
    check('skeleton: the product page swatches and the gallery thumbnails hold the final heights', pdpBefore.swatches[0] > 0 && pdpBefore.swatches[0] === pdpAfter.swatches[0] && pdpBefore.gallery > 0 && pdpBefore.gallery === pdpAfter.gallery && pdpBefore.column === pdpAfter.column, `swatches ${pdpBefore.swatches[0]} -> ${pdpAfter.swatches[0]}, gallery ${pdpBefore.gallery} -> ${pdpAfter.gallery}, column ${pdpBefore.column} -> ${pdpAfter.column}`);

    // ---- motion: the knob, the view transitions and a grid swap through them
    const ctx = await context(false);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 100)));
    await page.goto(base + CATEGORY, { waitUntil: 'networkidle' });
    const motion = await page.evaluate(() => {
        const cfg = JSON.parse(document.querySelector('meta[name="htmx-config"]')?.getAttribute('content') || '{}');
        const knob = getComputedStyle(document.documentElement).getPropertyValue('--hyperion-motion-fast').trim();
        let viewTransitionRule = false, navigationRule = false, addedRule = false;
        for (const sheet of document.styleSheets) {
            try { for (const rule of sheet.cssRules) { const t = rule.cssText; if (/::view-transition-old\(root\)/.test(t)) viewTransitionRule = true; if (/@view-transition/.test(t) && /navigation:\s*auto/.test(t)) navigationRule = true; if (/\.htmx-added\s*\{\s*opacity:\s*0/.test(t)) addedRule = true; } } catch (e) { /* cross origin */ }
        }
        const knobMs = /ms$/.test(knob) ? parseFloat(knob) : parseFloat(knob) * 1000; // the minifier writes 120ms as .12s
        return { swapsWithoutViewTransitions: cfg.globalViewTransitions !== true, knob, knobMs, viewTransitionRule, navigationRule, addedRule };
    });
    check('motion: the knob is 120ms, the page cross-fade rules and the swap fade-in rule are present, htmx swaps stay off the View Transitions API', motion.swapsWithoutViewTransitions && motion.knobMs === 120 && motion.viewTransitionRule && motion.navigationRule && motion.addedRule, JSON.stringify(motion));
    const gridId = '#hyperion-product-grid';
    const dimming = [];
    const poll = setInterval(async () => { try { dimming.push(await page.evaluate((id) => document.querySelector(id)?.classList.contains('htmx-request') ? getComputedStyle(document.querySelector(id)).opacity : null, gridId)); } catch (e) { /* navigating */ } }, 40);
    await page.route(/hyperion\/category\/filter/, async (route) => { await sleep(600); await route.continue(); });
    await page.selectOption('[data-hyperion-toolbar] select[name="product_list_order"]', 'name');
    await page.waitForResponse((r) => /hyperion\/category\/filter/.test(r.url()));
    await sleep(800);
    clearInterval(poll);
    const dimmed = dimming.filter((o) => o !== null);
    // The opacity eases over the knob's 120ms: the first samples sit on the way down, the rest at 0.6.
    const settled = dimmed.filter((o) => Number(o) <= 0.61);
    check('motion: a grid swap dims the grid while loading and raises no page error', dimmed.length > 0 && settled.length >= dimmed.length / 2 && pageErrors.length === 0, `dimmed samples ${dimmed.length}, at 0.6: ${settled.length}, errors ${pageErrors.join(' | ')}`);
    await ctx.close();
} catch (e) {
    check('script completed', false, e.message);
} finally {
    await browser.close();
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed }, null, 2));
process.exit(failed.length ? 1 : 0);

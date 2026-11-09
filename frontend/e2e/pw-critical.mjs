// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the critical CSS per page type: on the home, CMS, category,
// search and product pages the inline critical sheet must paint the fold
// exactly as the full theme stylesheet does (the stylesheet request is
// aborted and the viewport screenshots are compared pixel by pixel, desktop
// and phone), the theme stylesheet must load without blocking and apply
// (`media` flipped to `all`), the mini-cart must still adopt it; on the pages
// without a critical sheet (cart, contact) the stylesheet link stays
// synchronous.
// node e2e/pw-critical.mjs <baseUrl>
import { createRequire } from 'node:module';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl>');
    process.exit(2);
}
const u = makeUrl(await resolveUrlSuffix(base));

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 300) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Typed pages: the critical sheet alone must paint the fold. The diff budget is
// a share of the viewport pixels (a thin edge of anti-aliasing is tolerated,
// an unstyled element is not).
const TYPED = [
    { type: 'cms', url: '/' },
    { type: 'cms', url: '/about-us' },
    { type: 'category', url: u('/women/tops-women.html') },
    { type: 'category', url: u('/women/tops-women.html?product_list_mode=list') },
    { type: 'category', url: '/catalogsearch/result/?q=jacket' },
    { type: 'category', url: u('/women.html') },
    { type: 'product', url: u('/radiant-tee.html') },
    { type: 'product', url: u('/push-it-messenger-bag.html') },
];
const UNTYPED = ['/checkout/cart/', '/contact/'];
const DIFF_BUDGET = 0.001;
const THEME_CSS = /\/assets\/entry\.[^/]*\.css/;

const browser = await chromium.launch({ headless: true });
const context = (mobile) => browser.newContext({ ignoreHTTPSErrors: true, viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });

// Both renders are compared after the components upgraded (the chunks follow
// the stylesheet, or its failure, and the skeletons are the components' own
// geometry: pw-cls.mjs checks that parity), so the comparison is about the
// styles and nothing else.
const settle = async (page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !!customElements.get('hyperion-mini-cart') && !!customElements.get('hyperion-dropdown'), null, { timeout: 10000 }).catch(() => {});
    await sleep(800);
};
const shoot = (page) => page.screenshot({ animations: 'disabled', caret: 'hide' });
// Pixel comparison inside a page: both PNGs are decoded on a canvas, a pixel
// counts as different when one channel differs by more than 8 (compression).
const diffRatio = (page, a, b) => page.evaluate(async ([pa, pb]) => {
    const load = (b64) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const [ia, ib] = await Promise.all([load(pa), load(pb)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const draw = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const da = draw(ia), db = draw(ib);
    let diff = 0;
    const rows = new Map();
    for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) {
            diff++;
            const y = Math.floor(i / 4 / w);
            rows.set(y, (rows.get(y) || 0) + 1);
        }
    }
    const worst = [...rows.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([y, n]) => `y${y}:${n}`);
    return { ratio: diff / (w * h), diff, w, h, worst };
}, [a.toString('base64'), b.toString('base64')]);

const linkState = (page) => page.evaluate(() => {
    const link = document.querySelector('link[rel="stylesheet"][data-hyperion-theme-css]');
    const critical = document.querySelector('style[data-hyperion-critical]');
    let rules;
    try { rules = link?.sheet ? link.sheet.cssRules.length : 0; } catch { rules = -2; }
    return {
        media: link?.media ?? null,
        rules,
        preload: !!document.querySelector('link[rel="preload"][as="style"]'),
        criticalType: critical?.getAttribute('data-hyperion-critical') ?? null,
        criticalBytes: critical?.textContent.length ?? 0,
        noscript: !!document.querySelector('noscript'),
        // The render blocking marker, HTMX initialized with the page's configuration
        // (the meta merged: allowEval off), the components upgraded after the sheet.
        expect: (() => { const l = document.head.querySelector('link[rel="expect"][blocking="render"]'); const id = l?.getAttribute('href') || ''; return id.startsWith('#') && !!document.getElementById(id.slice(1)); })(),
        htmx: window.htmx?.config?.allowEval === false,
        defined: !!customElements.get('hyperion-mini-cart'),
    };
});

try {
    for (const mobile of [false, true]) {
        const label = mobile ? 'phone' : 'desktop';
        const ctx = await context(mobile);
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 120)));
        const bad = [];
        page.on('response', (r) => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`); });

        for (const { type, url } of TYPED) {
            // Critical sheet only: the theme stylesheet never arrives.
            await page.route(THEME_CSS, (route) => route.abort());
            await page.goto(base + url, { waitUntil: 'load' });
            await settle(page);
            const alone = await linkState(page);
            const shotAlone = await shoot(page);
            await page.unroute(THEME_CSS);

            // Full sheet, same page.
            await page.goto(base + url, { waitUntil: 'load' });
            await settle(page);
            const full = await linkState(page);
            const shotFull = await shoot(page);

            const d = await diffRatio(page, shotAlone, shotFull);
            check(`${label} ${type} ${url}: the critical sheet alone paints the fold like the full sheet (diff ${(d.ratio * 100).toFixed(3)}%)`, d.ratio <= DIFF_BUDGET, `${d.diff} of ${d.w}x${d.h} pixels, worst rows ${d.worst.join(' ')}; alone media=${alone.media} rules=${alone.rules}`);
            check(`${label} ${type} ${url}: the theme stylesheet loads without blocking and applies (media all, preload, noscript, render blocking marker), HTMX is configured and the components upgraded`, full.media === 'all' && full.rules > 100 && full.preload && full.noscript && full.expect && full.criticalType === type && full.criticalBytes > 5000 && full.htmx && full.defined, JSON.stringify(full));
        }

        for (const url of UNTYPED) {
            const html = await (await page.request.get(base + url, { ignoreHTTPSErrors: true })).text();
            const sync = /<link rel="stylesheet" href="[^"]*\/assets\/entry\.[^"]*\.css" media="all" data-hyperion-theme-css>/.test(html);
            const print = /data-hyperion-theme-css[^>]*media="print"|media="print"[^>]*data-hyperion-theme-css/.test(html);
            const critical = html.match(/<style[^>]*data-hyperion-critical="([^"]*)"/);
            check(`${label} untyped ${url}: the theme stylesheet link stays synchronous with the tokens critical sheet`, sync && !print && critical && critical[1] === '', `sync=${sync} print=${print} critical=${critical ? JSON.stringify(critical[1]) : 'none'}`);
        }

        if (mobile) {
            await page.goto(base + '/', { waitUntil: 'networkidle' });
            await page.evaluate(() => document.querySelector('hyperion-mini-cart')?.shadowRoot?.querySelector('[part="trigger"]')?.click());
            await sleep(700);
            const adopted = await page.evaluate(() => {
                const mc = document.querySelector('hyperion-mini-cart');
                const root = mc?.shadowRoot;
                const sheets = root?.adoptedStyleSheets?.length ?? 0;
                const button = root?.querySelector('a[href*="checkout"], button, a');
                return { open: mc?.hasAttribute('open') ?? false, sheets, buttonBackground: button ? getComputedStyle(button).backgroundColor : null };
            });
            check('phone: the mini-cart still adopts the theme stylesheet into its shadow root', adopted.open && adopted.sheets > 0, JSON.stringify(adopted));
        }

        check(`${label}: no page errors / HTTP 5xx`, pageErrors.length === 0 && bad.length === 0, [...pageErrors, ...bad].join(' | '));
        await ctx.close();
    }
} catch (e) {
    check('script completed', false, e.message);
} finally {
    await browser.close();
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed }, null, 2));
process.exit(failed.length ? 1 : 0);

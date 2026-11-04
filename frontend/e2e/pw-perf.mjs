#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Quick lab performance probe for a Hyperion storefront (warm Varnish, second load measured).
// Usage: node e2e/pw-perf.mjs <baseUrl> [path ...]
// Prints per page: cache status, TTFB, DOMContentLoaded, load, LCP (+ element), CLS, request count,
// transfer size by type and how many requests went to third parties.
import { createRequire } from 'node:module';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
// PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host
// that is not in /etc/hosts yet (Chromium host resolver rules).
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const [base, ...paths] = process.argv.slice(2);
const u = makeUrl(await resolveUrlSuffix(base));
const pages = paths.length ? paths : ['/', u('/women/tops-women.html'), u('/juno-jacket.html'), '/checkout/cart/'];
const browser = await chromium.launch({ headless: true, ...launchOptions() });
const out = {};
for (const path of pages) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
    // The VCL delivers x-magento-cache-debug only on a debug exchange.
    await ctx.setExtraHTTPHeaders({ 'X-Magento-Debug': '1' });
    const warm = await ctx.newPage();
    await warm.goto(base + path, { waitUntil: 'networkidle' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
        window.__lcp = 0; window.__lcpEl = ''; window.__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lcp = e.startTime; window.__lcpEl = (e.element?.tagName ?? '') + ' ' + (e.url ?? '').split('/').pop().slice(0, 40); } }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    const resp = await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    out[path] = await page.evaluate(([cache, origin]) => {
        const nav = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource');
        const by = {};
        for (const r of res) {
            const t = /\.css(\?|$)/.test(r.name) ? 'css' : /\.m?js(\?|$)/.test(r.name) ? 'js' : /\.(png|jpe?g|webp|avif|svg|gif)(\?|$)/.test(r.name) ? 'img' : /\.woff2?(\?|$)/.test(r.name) ? 'font' : 'xhr/other';
            by[t] = by[t] || { n: 0, kb: 0 }; by[t].n++; by[t].kb += Math.round((r.transferSize || 0) / 1024);
        }
        return { cache, ttfbMs: Math.round(nav.responseStart - nav.requestStart), htmlKB: Math.round(nav.transferSize / 1024), dclMs: Math.round(nav.domContentLoadedEventEnd), loadMs: Math.round(nav.loadEventEnd), lcpMs: Math.round(window.__lcp), lcpEl: window.__lcpEl.trim(), cls: +window.__cls.toFixed(3), requests: res.length + 1, thirdParty: res.filter((r) => !r.name.startsWith(origin)).length, by };
    }, [resp.headers()['x-magento-cache-debug'] ?? '', base]);
    await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));

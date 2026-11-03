#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Headless Playwright smoke check for a Hyperion storefront page.
// Usage: node e2e/pw-check.mjs <url> [screenshot.png]
// Reports HTTP status, title, htmx presence, hyperion-* custom elements and
// whether they are defined, console errors/warnings, page errors, failed requests.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
// PW_HOST_RESOLVER="MAP shop.example 10.0.0.4" resolves an install's host
// that is not in /etc/hosts yet (Chromium host resolver rules).
const launchOptions = () => (process.env.PW_HOST_RESOLVER ? { args: [`--host-resolver-rules=${process.env.PW_HOST_RESOLVER}`] } : {});

const url = process.argv[2] ?? '';
if (!/^https?:\/\//.test(url)) {
    console.error('usage: node pw-check.mjs <url> [screenshot.png]');
    process.exit(2);
}
const browser = await chromium.launch({ headless: true, ...launchOptions() });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const consoleIssues = [], pageErrors = [], failedRequests = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleIssues.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => pageErrors.push(e.message));
page.on('requestfailed', r => failedRequests.push(`${r.failure()?.errorText} ${r.url()}`));
page.on('response', r => { if (r.status() >= 400) failedRequests.push(`HTTP ${r.status()} ${r.url()}`); });
const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
const title = await page.title();
const customEls = await page.evaluate(() => [...new Set([...document.querySelectorAll('*')].map(e => e.localName).filter(n => n.startsWith('hyperion-')))]);
const customElements_ = await page.evaluate(els => els.map(n => `${n}:${customElements.get(n) ? 'defined' : 'UNDEFINED'}`), customEls);
const htmx = await page.evaluate(() => (typeof window.htmx !== 'undefined' ? window.htmx.version : 'missing'));
if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: false });
console.log(JSON.stringify({ url, status: resp?.status(), title, htmx, customElements: customElements_, consoleIssues, pageErrors, failedRequests }, null, 2));
await browser.close();

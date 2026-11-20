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
// The checkout joins as a flow, guest and customer: every step of a guest
// order (load, email, country, address, shipping method, reload) must leave
// the layout where it was, and the server rendered skeleton of the checkout
// must put the contact card, the shipping card and the summary exactly where
// the application renders them (entry script blocked vs mounted).
// node e2e/pw-cls.mjs <baseUrl> [--only=<parts>] [--viewport=desktop|phone] [--dump=<file>] [--customer=<email>:<password>]
//   --only      comma separated: pages, skeletons, motion, checkout-flow,
//               checkout-parity, checkout-customer (default: all of them)
//   --viewport  limits the checkout parts to one viewport
//   --dump      writes every checkout measurement (layout shift entries with
//               their sources, every rectangle of the skeleton and of the
//               application) to a JSON file
//   --customer  an existing customer WITHOUT saved addresses for the customer
//               run; by default the script registers a new one
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const base = (process.argv[2] || '').replace(/\/$/, '');
const u = makeUrl(await resolveUrlSuffix(base));
if (!/^https?:\/\//.test(base)) {
    console.error('usage: node ' + process.argv[1].split('/').pop() + ' <baseUrl> ...');
    process.exit(2);
}
// Options are written --name=value.
const option = (name) => (process.argv.find((a) => a.startsWith(name + '=')) ?? '').slice(name.length + 1);
const PARTS = ['pages', 'skeletons', 'motion', 'checkout-flow', 'checkout-parity', 'checkout-customer'];
const only = option('--only') ? option('--only').split(',').map((p) => p.trim()) : PARTS;
if (only.some((p) => !PARTS.includes(p))) {
    console.error('--only takes: ' + PARTS.join(', '));
    process.exit(2);
}
const want = (part) => only.includes(part);
const VIEWPORTS = [false, true].filter((mobile) => !option('--viewport') || option('--viewport') === (mobile ? 'phone' : 'desktop'));
const viewportName = (mobile) => (mobile ? 'phone' : 'desktop');
const dumpFile = option('--dump');
const dump = { base, flow: {}, parity: {}, customer: {} };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 260) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = ['/', u('/women/tops-women.html'), u('/women/tops-women.html?product_list_mode=list'), u('/radiant-tee.html'), u('/push-it-messenger-bag.html'), '/catalogsearch/result/?q=jacket', u('/women.html'), '/checkout/cart/', '/contact/'];
const CATEGORY = u('/women/tops-women.html');
const PDP = u('/radiant-tee.html');

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
    // Shifts within 500 ms of an input are not part of the score; they are kept apart for the report.
    window.__inputShifts = [];
    const describe = (n) => (n && n.tagName ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : String(n));
    const box = (r) => (r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null);
    const detail = (s) => {
        const n = s.node && s.node.nodeType === 3 ? s.node.parentElement : s.node;
        return { tag: n && n.tagName ? n.tagName.toLowerCase() : String(n), id: (n && n.id) || '', classes: n && typeof n.className === 'string' ? n.className.trim() : '', inside: n && n.closest ? (n.closest('section[aria-labelledby], aside, details, footer, header')?.getAttribute('aria-labelledby') || n.closest('section[aria-labelledby], aside, details, footer, header')?.localName || '') : '', previous: box(s.previousRect), current: box(s.currentRect) };
    };
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
            const entry = { value: e.value, t: Math.round(e.startTime), sources: (e.sources || []).slice(0, 3).map((s) => describe(s.node)), detail: (e.sources || []).map(detail) };
            if (e.hadRecentInput) window.__inputShifts.push(entry);
            else window.__shifts.push(entry);
        }
    }).observe({ type: 'layout-shift', buffered: true });
});

// ---- checkout helpers
const DESKTOP_CHECKOUT = { width: 1280, height: 900 };
const checkoutContext = (mobile, storageState) => browser.newContext({ storageState, ignoreHTTPSErrors: true, viewport: mobile ? { width: 390, height: 844 } : DESKTOP_CHECKOUT, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const CART_PRODUCT = u('/fusion-backpack.html');
const ADDRESS_IT = { firstname: 'Ada', lastname: 'Layout', country_id: 'IT', street_0: 'Via Dante 7', postcode: '20121', city: 'Milano', region: 'Milano', telephone: '0212345678' };
const ADDRESS_US = { firstname: 'Ada', lastname: 'Layout', country_id: 'US', street_0: '6146 Honey Bluff Parkway', postcode: '49628-7978', city: 'Calder', region: 'Michigan', telephone: '5552293326' };
const watch = (page, problems) => {
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
};
// Resolves when no request has been in flight for `quiet` ms (the debounced saves of the checkout included).
const trackNetwork = (page) => {
    const pending = new Set();
    let last = Date.now();
    page.on('request', (r) => { pending.add(r); last = Date.now(); });
    const done = (r) => { pending.delete(r); last = Date.now(); };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    return async (quiet = 1500, max = 30000) => {
        const start = Date.now();
        await sleep(700);
        while (Date.now() - start < max) {
            if (pending.size === 0 && Date.now() - last >= quiet) return true;
            await sleep(100);
        }
        return false;
    };
};
const addToCart = async (page) => {
    await page.goto(base + CART_PRODUCT, { waitUntil: 'networkidle' });
    await Promise.all([
        page.waitForResponse((r) => /checkout\/cart\/add/.test(r.url()), { timeout: 30000 }),
        page.click('#product_addtocart_form button[type="submit"]'),
    ]);
    await sleep(800);
};
const openCheckout = async (page, waitUntil = 'load') => {
    await page.goto(base + '/checkout/', { waitUntil });
    await page.waitForSelector('[data-hyperion-place-order] button', { timeout: 45000 });
};
// The address form of a section ("shipping" or "billing"): fields are addressed by their ids.
const fillAddress = async (page, address, { prefix = 'hc-shipping', skipCountry = false } = {}) => {
    const field = (name) => page.locator(`#${prefix}-${name}`);
    await field('firstname').fill(address.firstname);
    await field('lastname').fill(address.lastname);
    if (!skipCountry) await field('country_id').selectOption(address.country_id);
    await field('street_0').fill(address.street_0);
    await field('postcode').fill(address.postcode);
    await field('city').fill(address.city);
    if (await field('region_id').count()) {
        const picked = await field('region_id').selectOption({ label: address.region }).catch(() => []);
        if (!picked.length) await field('region_id').selectOption({ index: 1 });
    } else if (await field('region').count()) {
        await field('region').fill(address.region);
    }
    await field('telephone').fill(address.telephone);
    await field('telephone').blur();
};
const waitForRates = (page) => page.waitForSelector('shipping-method-list [data-estimate-state="ready"] input[type="radio"]', { timeout: 45000 }).then(() => true).catch(() => false);
const methodRadios = (page) => page.locator('shipping-method-list input[type="radio"]:not([disabled])');
const changeShippingMethod = async (page) => {
    const radios = methodRadios(page);
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
        if (!(await radios.nth(i).isChecked())) {
            await radios.nth(i).scrollIntoViewIfNeeded();
            await sleep(700);
            await radios.nth(i).check();
            return true;
        }
    }
    return false;
};
const takeShifts = (page) => page.evaluate(() => {
    const taken = { counted: window.__shifts.slice(), input: window.__inputShifts.slice() };
    window.__shifts.length = 0;
    window.__inputShifts.length = 0;
    return taken;
});
const shiftSummary = (shifts) => shifts.map((s) => `${s.value.toFixed(4)} ${s.detail.slice(0, 2).map((d) => `${d.tag}${d.classes ? '.' + d.classes.split(/\s+/).slice(0, 2).join('.') : ''} y ${d.previous?.y}>${d.current?.y} h ${d.previous?.h}>${d.current?.h}`).join(' | ')}`).join('; ');

// Every rectangle of the checkout the skeleton models, in page coordinates, from the
// skeleton (while the application is not mounted) or from the application. The same
// keys in both, so the two can be laid side by side; a key without a box is null.
const collectCheckoutRects = () => {
    const n = (v) => Math.round(v * 10) / 10;
    const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return { x: n(r.x + window.scrollX), y: n(r.y + window.scrollY), w: n(r.width), h: n(r.height) };
    };
    const union = (els) => {
        const boxes = els.map(rect).filter(Boolean);
        if (!boxes.length) return null;
        const x = Math.min(...boxes.map((b) => b.x));
        const y = Math.min(...boxes.map((b) => b.y));
        return { x, y, w: n(Math.max(...boxes.map((b) => b.x + b.w)) - x), h: n(Math.max(...boxes.map((b) => b.y + b.h)) - y) };
    };
    const rects = {};
    const labels = {};
    const put = (key, el, label) => {
        rects[key] = Array.isArray(el) ? union(el.filter(Boolean)) : rect(el);
        if (label) labels[key] = label;
    };
    const list = (key, els, label) => els.forEach((el, i) => put(`${key}-${i + 1}`, el, label ? label(el) : ''));
    const app = document.querySelector('#checkout-root > checkout-app');
    const skeleton = document.querySelector('#checkout-root > [data-hyperion-checkout-skeleton]');
    const structure = [];
    // The Place Order bar sticks to the bottom of the viewport below the desktop layout: it is measured where it sits in the flow.
    const stickyBar = app?.querySelector('[data-hyperion-place-order-bar]');
    const stickyBefore = stickyBar ? stickyBar.style.position : '';
    if (stickyBar) stickyBar.style.position = 'static';
    if (app) {
        const q = (s, root = app) => root.querySelector(s);
        const all = (s, root = app) => [...root.querySelectorAll(s)];
        const contact = q('section[aria-labelledby="hc-email-heading"]');
        const shipping = q('section[aria-labelledby="hc-shipping-heading"]');
        const payment = q('section[aria-labelledby="hc-payment-heading"]');
        put('grid', q(':scope > div.grid'));
        put('summary-bar', q('[data-hyperion-summary-bar]')?.closest('details'));
        put('heading', q('[data-hyperion-checkout-sections] > h1'));
        put('contact', contact);
        put('contact-heading', contact && q('h2', contact));
        put('contact-body', q('checkout-email'));
        put('contact-field', q('checkout-email hc-text-input[name="email"]'));
        put('contact-login-line', q('[data-hyperion-login-slot]'));
        put('shipping', shipping);
        put('shipping-heading', shipping && q('h2', shipping));
        const addressHost = shipping || payment;
        const addressHeading = addressHost && q('checkout-shipping h3, checkout-payment address-form, checkout-payment address-selector', addressHost);
        const addressBody = addressHost && (q('address-selector', addressHost) || q('address-form', addressHost));
        put('address', [addressHeading, addressBody]);
        put('address-heading', addressHeading && addressHeading.localName === 'h3' ? addressHeading : null);
        const form = addressHost && q('address-form', addressHost);
        const names = (el) => (el.getAttribute('name') ? [el.getAttribute('name')] : [...el.querySelectorAll('hc-text-input, hc-select-input, [data-hyperion-region-placeholder]')].map((f) => f.getAttribute('name') || 'region placeholder')).join(' + ');
        list('address-row', form ? [...(q('.hc-fields', form) || form).children].filter((el) => el.getBoundingClientRect().height > 0) : [], names);
        list('address-card', addressHost ? all('[data-hyperion-address-card]', addressHost) : []);
        put('address-new', addressHost && q('[data-hyperion-address-new]', addressHost));
        put('address-save', addressHost && q('hc-checkbox[name="save_in_address_book"]', addressHost));
        const methods = q('shipping-method-list');
        put('shipping-methods', methods?.parentElement);
        put('shipping-methods-heading', methods?.parentElement && q('h3', methods.parentElement));
        put('shipping-methods-list', methods && q(':scope > div', methods));
        const rows = methods ? all('shipping-method-row', methods) : [];
        list('shipping-method-row', rows.length ? rows : methods ? [...(q(':scope > div', methods)?.children || [])].filter((el) => el.getBoundingClientRect().height > 0) : [], (el) => el.localName + (el.getAttributeNames().filter((a) => a.startsWith('data-')).map((a) => ' ' + a).join('')));
        if (methods) labels['shipping-methods-list'] = 'state ' + (q('[data-estimate-state]', methods)?.getAttribute('data-estimate-state') || '?');
        put('gift-options', q('checkout-gift-message'));
        put('payment', payment);
        put('payment-heading', payment && q('h2', payment));
        put('billing-same', q('hc-checkbox[name="billing_same_as_shipping"]'));
        const paymentList = q('payment-method-list');
        put('payment-methods', paymentList?.parentElement);
        put('payment-methods-heading', paymentList?.parentElement && q('h3', paymentList.parentElement));
        put('payment-methods-list', paymentList, paymentList ? `${all('payment-method-row', paymentList).length} method rows` : '');
        list('payment-method-row', paymentList ? all('payment-method-row', paymentList) : [], (el) => el.textContent.trim().replace(/\s+/g, ' ').slice(0, 48));
        put('agreements', q('checkout-agreements'));
        put('recaptcha-badge', q('hc-recaptcha-badge'));
        put('order-captcha', q('hc-order-captcha'));
        put('place-order', q('[data-hyperion-place-order-bar]'));
        put('place-order-total', q('[data-hyperion-place-order-total]'));
        put('place-order-button', q('[data-hyperion-place-order] button'));
        const rail = q('[data-hyperion-summary-rail]');
        put('summary', rail);
        put('summary-heading', rail && q('section > div', rail));
        list('summary-item', rail ? all('summary-item', rail) : []);
        put('totals', rail && q('summary-totals', rail)?.parentElement);
        list('total-row', rail ? all('[data-hyperion-totals] > [data-total]:not([data-total="grand_total"])', rail) : [], (el) => el.getAttribute('data-total'));
        put('grand-total', rail && q('[data-total="grand_total"]', rail));
        put('coupon', rail && q('coupon-form', rail));
        // What the sections really hold, one line per child: the boxes the skeleton has no key for show up here.
        for (const [name, host] of [['contact', contact], ['shipping', q('checkout-shipping > div')], ['address-selector', q('address-selector > *') ? q('address-selector') : null], ['shipping-methods', methods?.parentElement], ['shipping-method-list', methods], ['payment', payment], ['checkout-payment', q('checkout-payment > section')], ['sections', q('[data-hyperion-checkout-sections]')]]) {
            if (!host) continue;
            for (const child of host.children) {
                const box = rect(child);
                if (box) structure.push({ parent: name, tag: child.localName, classes: typeof child.className === 'string' ? child.className : '', hooks: child.getAttributeNames().filter((a) => a.startsWith('data-') || a === 'name' || a === 'aria-labelledby').map((a) => `${a}=${child.getAttribute(a)}`).join(' '), ...box });
            }
        }
    } else if (skeleton) {
        const part = (name, root = skeleton) => root.querySelector(`[data-hyperion-skeleton-part="${name}"]`);
        const all = (s, root = skeleton) => (root ? [...root.querySelectorAll(s)] : []);
        const contact = part('contact');
        const shipping = part('shipping');
        const payment = part('payment');
        const address = part('address');
        put('grid', skeleton);
        put('summary-bar', part('summary-bar'));
        put('heading', part('heading'));
        put('contact', contact);
        put('contact-heading', contact?.children[0]);
        put('contact-body', contact?.children[1]);
        put('contact-field', contact?.querySelector('[data-hyperion-skeleton-field]'));
        put('contact-login-line', contact?.querySelector('[data-hyperion-skeleton-login-line]'));
        put('shipping', shipping);
        put('shipping-heading', shipping?.children[0]);
        put('address', address);
        put('address-heading', address?.children[0]);
        list('address-row', all('[data-hyperion-skeleton-row]', address), (el) => el.getAttribute('data-hyperion-skeleton-row'));
        list('address-card', all('[data-hyperion-skeleton-address-card]', address));
        put('address-new', address?.querySelector('[data-hyperion-skeleton-address-new]'));
        put('address-save', address?.querySelector('[data-hyperion-skeleton-row="save_in_address_book"]'));
        const methods = part('shipping-methods');
        put('shipping-methods', methods);
        put('shipping-methods-heading', methods?.children[0]);
        put('shipping-methods-list', methods?.children[1]);
        list('shipping-method-row', methods?.children[1] ? [...methods.children[1].children] : []);
        put('gift-options', part('gift-options'));
        put('payment', payment);
        put('payment-heading', payment?.children[0]);
        put('billing-same', payment ? part('billing-same', payment) : null);
        const paymentMethods = part('payment-methods');
        put('payment-methods', paymentMethods);
        put('payment-methods-heading', paymentMethods?.children[0]);
        put('payment-methods-list', paymentMethods?.children[1]);
        list('payment-method-row', all('[data-hyperion-skeleton-payment-row]', paymentMethods));
        put('agreements', null);
        put('recaptcha-badge', null);
        put('order-captcha', null);
        const placeOrder = part('place-order');
        put('place-order', placeOrder);
        put('place-order-total', placeOrder && placeOrder.children.length > 1 ? placeOrder.children[0] : null);
        put('place-order-button', placeOrder?.lastElementChild);
        const summary = part('summary');
        put('summary', summary);
        put('summary-heading', summary?.firstElementChild?.children[0]);
        list('summary-item', all('[data-hyperion-skeleton-item]', summary));
        const totals = part('totals');
        put('totals', totals);
        list('total-row', all('[data-hyperion-skeleton-total]', totals));
        put('grand-total', totals?.firstElementChild?.lastElementChild);
        put('coupon', part('coupon'));
    }
    put('footer', document.querySelector('footer[role="contentinfo"]') || document.querySelector('footer'));
    if (stickyBar) stickyBar.style.position = stickyBefore;
    return { mode: app ? 'application' : skeleton ? 'skeleton' : 'none', scrollY: Math.round(window.scrollY), rects, labels, structure };
};
// Keeps the rectangles of the application's first frame: one animation frame after
// <checkout-app> has rendered its sections, before any answer of the server arrives.
const captureFirstFrame = (page) => page.addInitScript(`(() => {
    const collect = ${collectCheckoutRects.toString()};
    window.__checkoutFirstFrame = null;
    const observer = new MutationObserver(() => {
        if (!document.querySelector('#checkout-root > checkout-app [data-hyperion-checkout-sections]')) return;
        observer.disconnect();
        requestAnimationFrame(() => { window.__checkoutFirstFrame = collect(); });
    });
    observer.observe(document, { childList: true, subtree: true });
})();`);
const delta = (a, b) => (a && b ? { dx: +(b.x - a.x).toFixed(1), dy: +(b.y - a.y).toFixed(1), dw: +(b.w - a.w).toFixed(1), dh: +(b.h - a.h).toFixed(1) } : null);
const same = (a, b) => { const d = delta(a, b); return !!d && d.dx === 0 && d.dy === 0 && d.dw === 0 && d.dh === 0; };
const box = (r) => (r ? `${r.x},${r.y} ${r.w}x${r.h}` : 'none');
// One measurement of the checkout in a session: the skeleton (entry script blocked), the
// application's first frame and the settled application, same cookies, same viewport.
const measureCheckoutParity = async (ctx, problems) => {
    const mounted = await ctx.newPage();
    watch(mounted, problems);
    await captureFirstFrame(mounted);
    const settle = trackNetwork(mounted);
    await openCheckout(mounted, 'load');
    await mounted.evaluate(() => window.scrollTo(0, 0));
    await settle();
    const first = await mounted.evaluate(() => window.__checkoutFirstFrame);
    const settled = await mounted.evaluate(collectCheckoutRects);
    const entry = await mounted.evaluate(() => document.querySelector('#checkout-config ~ script[type="module"][src]')?.src || '');
    await mounted.close();
    const blocked = await ctx.newPage();
    // The entry script only: the stylesheet and the preloaded chunks still load, the application never mounts.
    await blocked.route((url) => entry !== '' && url.href.split('?')[0] === entry.split('?')[0], (r) => r.abort());
    await blocked.goto(base + '/checkout/', { waitUntil: 'load' });
    await sleep(1500);
    const skeleton = await blocked.evaluate(collectCheckoutRects);
    const footerBelow = await blocked.evaluate(() => {
        const s = document.querySelector('[data-hyperion-checkout-skeleton]');
        const f = document.querySelector('footer[role="contentinfo"]') || document.querySelector('footer');
        return !!s && !!f && f.getBoundingClientRect().top >= s.getBoundingClientRect().bottom;
    });
    await blocked.close();
    return { entry: entry.replace(base, ''), skeleton, first, settled, footerBelow };
};
const GATED = (mobile) => ['contact', 'shipping', mobile ? 'summary-bar' : 'summary'];
const reportParity = (scenario, mobile, m) => {
    const keys = [...new Set([...Object.keys(m.skeleton.rects), ...Object.keys(m.first?.rects || {}), ...Object.keys(m.settled.rects)])];
    const rows = keys.map((key) => ({ key, skeleton: m.skeleton.rects[key] ?? null, first: m.first?.rects[key] ?? null, settled: m.settled.rects[key] ?? null, label: [m.skeleton.labels[key], m.settled.labels[key]].filter(Boolean).join(' / ') }))
        .filter((r) => r.skeleton || r.first || r.settled);
    for (const r of rows) {
        r.mountDelta = delta(r.skeleton, r.first);
        r.settleDelta = delta(r.first, r.settled);
        if (!same(r.skeleton, r.first) || !same(r.first, r.settled)) console.log(`  RECT   ${scenario} ${viewportName(mobile)} ${r.key}: skeleton ${box(r.skeleton)} | first frame ${box(r.first)} | settled ${box(r.settled)}`);
    }
    const gated = GATED(mobile);
    const off = gated.filter((key) => !same(m.skeleton.rects[key], m.first?.rects[key]));
    check(`checkout skeleton (${scenario}, ${viewportName(mobile)}): the contact card, the shipping card and the summary sit where the application's first frame puts them`, m.skeleton.mode === 'skeleton' && m.first?.mode === 'application' && off.length === 0, off.length ? off.map((key) => `${key} ${box(m.skeleton.rects[key])} -> ${box(m.first?.rects[key])}`).join('; ') : gated.map((key) => `${key} ${box(m.skeleton.rects[key])}`).join('; '));
    const moved = gated.concat(['payment', 'footer']).filter((key) => m.first?.rects[key] && !same(m.first.rects[key], m.settled.rects[key]));
    check(`checkout application (${scenario}, ${viewportName(mobile)}): the cards of the first frame do not move or resize while the page settles`, m.first?.mode === 'application' && moved.length === 0, moved.map((key) => `${key} ${box(m.first.rects[key])} -> ${box(m.settled.rects[key])}`).join('; '));
    check(`checkout skeleton (${scenario}, ${viewportName(mobile)}): with the entry script blocked the skeleton stays and the footer is below it`, m.skeleton.mode === 'skeleton' && m.footerBelow, `entry ${m.entry}`);
    return { ...m, rows };
};

try {
    if (want('pages')) {
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
    }

    if (want('skeletons')) {
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
    }

    if (want('motion')) {
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
                try { for (const rule of sheet.cssRules) { const t = rule.cssText; if (/::view-transition-old\(root\)/.test(t)) viewTransitionRule = true; if (/@view-transition/.test(t) && /navigation:\s*auto/.test(t)) navigationRule = true; if (/\.htmx-added\s*\{\s*opacity:\s*0/.test(t)) addedRule = true; } } catch { /* cross origin */ }
            }
            const knobMs = /ms$/.test(knob) ? parseFloat(knob) : parseFloat(knob) * 1000; // the minifier writes 120ms as .12s
            return { swapsWithoutViewTransitions: cfg.globalViewTransitions !== true, knob, knobMs, viewTransitionRule, navigationRule, addedRule };
        });
        check('motion: the knob is 120ms, the page cross-fade rules and the swap fade-in rule are present, htmx swaps stay off the View Transitions API', motion.swapsWithoutViewTransitions && motion.knobMs === 120 && motion.viewTransitionRule && motion.navigationRule && motion.addedRule, JSON.stringify(motion));
        const gridId = '#hyperion-product-grid';
        const dimming = [];
        const poll = setInterval(async () => { try { dimming.push(await page.evaluate((id) => document.querySelector(id)?.classList.contains('htmx-request') ? getComputedStyle(document.querySelector(id)).opacity : null, gridId)); } catch { /* navigating */ } }, 40);
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
    }

    // ---- checkout: the guest flow, step by step, desktop and phone, throttled
    if (want('checkout-flow')) {
        for (const mobile of VIEWPORTS) {
            const name = viewportName(mobile);
            const problems = [];
            const steps = [];
            let ctx;
            try {
                ctx = await checkoutContext(mobile);
                const page = await ctx.newPage();
                watch(page, problems);
                await observeShifts(page);
                await addToCart(page);
                await throttle(ctx, page);
                const settle = trackNetwork(page);
                const step = async (title, action) => {
                    await takeShifts(page);
                    const note = await action();
                    await settle();
                    const { counted, input } = await takeShifts(page);
                    const cls = counted.reduce((a, s) => a + s.value, 0);
                    steps.push({ step: title, cls, note: note || '', shifts: counted, inputShifts: input });
                    console.log(`  STEP   ${name} ${title}: ${cls.toFixed(4)}${counted.length ? '  ' + shiftSummary(counted).slice(0, 600) : ''}${input.length ? `  (within 500 ms of an input, not counted: ${input.reduce((a, s) => a + s.value, 0).toFixed(4)})` : ''}${note ? '  [' + note + ']' : ''}`);
                };
                const email = page.locator('#hc-contact-email');
                // The load is measured from the navigation: the observer is buffered and installed before any script.
                await page.goto('about:blank');
                await openCheckout(page);
                await settle();
                {
                    const { counted, input } = await takeShifts(page);
                    const cls = counted.reduce((a, s) => a + s.value, 0);
                    steps.push({ step: 'load', cls, note: '', shifts: counted, inputShifts: input });
                    console.log(`  STEP   ${name} load: ${cls.toFixed(4)}${counted.length ? '  ' + shiftSummary(counted).slice(0, 600) : ''}`);
                }
                await step('email typed, invalid', async () => { await email.pressSequentially('not-an-email', { delay: 40 }); });
                await step('email typed, valid', async () => { await email.fill(''); await email.pressSequentially(`hyperion.cls.${Date.now()}@example.com`, { delay: 25 }); });
                // Later than the input window: a shift caused by the blur or by the availability answer is counted.
                await step('email blur', async () => { await sleep(700); await email.blur(); });
                await step('country United States', async () => { await page.locator('#hc-shipping-country_id').selectOption('US'); });
                await step('country United States to Italy', async () => { await page.locator('#hc-shipping-country_id').selectOption('IT'); });
                await step('address completed', async () => {
                    await fillAddress(page, ADDRESS_IT, { skipCountry: true });
                    return (await waitForRates(page)) ? `${await methodRadios(page).count()} usable shipping methods` : 'no shipping method arrived';
                });
                // The method change needs two usable methods; a store may ship abroad with one only.
                if (await methodRadios(page).count() < 2) {
                    await step('address changed to the United States', async () => {
                        await fillAddress(page, ADDRESS_US);
                        await page.waitForFunction(() => document.querySelectorAll('shipping-method-list [data-estimate-state="ready"] input[type="radio"]:not([disabled])').length > 1, null, { timeout: 45000 }).catch(() => {});
                        return `${await methodRadios(page).count()} usable shipping methods`;
                    });
                }
                let changed = false;
                await step('shipping method changed', async () => { changed = await changeShippingMethod(page); return changed ? '' : 'no second usable shipping method for this address'; });
                await step('reload', async () => {
                    await page.reload({ waitUntil: 'load' });
                    await page.waitForSelector('[data-hyperion-place-order] button', { timeout: 45000 });
                });
                const dirty = steps.filter((s) => s.cls > 0);
                check(`checkout flow: no layout shift through ${steps.length} steps of a guest (${name}, slow network, 4x slower CPU)`, dirty.length === 0, dirty.length ? dirty.map((s) => `${s.step} ${s.cls.toFixed(4)}`).join(' || ') : steps.map((s) => s.step).join(', '));
                check(`checkout flow: the address gets shipping methods and a second one can be chosen (${name})`, changed, steps.filter((s) => s.note).map((s) => `${s.step}: ${s.note}`).join('; '));
            } catch (e) {
                check(`checkout flow completed (${name})`, false, e.message);
            } finally {
                dump.flow[name] = steps;
                check(`checkout flow: no page errors, no HTTP 5xx (${name})`, problems.length === 0, problems.slice(0, 4).join(' | '));
                await ctx?.close();
            }
        }
    }

    // ---- checkout: skeleton against the application, guest, fresh quote and hydrated quote
    if (want('checkout-parity')) {
        for (const mobile of VIEWPORTS) {
            const name = viewportName(mobile);
            const problems = [];
            let ctx;
            try {
                ctx = await checkoutContext(mobile);
                const page = await ctx.newPage();
                await addToCart(page);
                dump.parity[`guest ${name}`] = reportParity('guest', mobile, await measureCheckoutParity(ctx, problems));
                // The same guest with an address and a shipping method saved on the quote: what a reload shows.
                const settle = trackNetwork(page);
                await openCheckout(page);
                await page.locator('#hc-contact-email').fill(`hyperion.cls.${Date.now()}@example.com`);
                await page.locator('#hc-contact-email').blur();
                await fillAddress(page, ADDRESS_IT);
                const rates = await waitForRates(page);
                await settle();
                await page.close();
                check(`checkout skeleton (guest with a saved quote, ${name}): the address was saved with a shipping method`, rates);
                dump.parity[`guest with a saved quote ${name}`] = reportParity('guest with a saved quote', mobile, await measureCheckoutParity(ctx, problems));
            } catch (e) {
                check(`checkout skeleton completed (guest, ${name})`, false, e.message);
            } finally {
                check(`checkout skeleton: no page errors, no HTTP 5xx (guest, ${name})`, problems.length === 0, problems.slice(0, 4).join(' | '));
                await ctx?.close();
            }
        }
    }

    // ---- checkout: a customer, first with an address typed in the checkout, then with a saved address
    if (want('checkout-customer')) {
        const given = option('--customer');
        const customer = given ? { email: given.slice(0, given.indexOf(':')), password: given.slice(given.indexOf(':') + 1), registered: false } : { email: `hyperion.cls.${Date.now()}@example.com`, password: `Cls-${Date.now()}-layout`, registered: true };
        dump.customer.email = customer.email;
        const sessions = [];
        const problems = [];
        const signIn = async (page) => {
            if (customer.registered && !customer.created) {
                await page.goto(base + '/customer/account/create/', { waitUntil: 'networkidle' });
                const form = page.locator('form:has(input[name="password_confirmation"])');
                await form.locator('input[name="firstname"]').fill('Ada');
                await form.locator('input[name="lastname"]').fill('Layout');
                await form.locator('input[name="email"]').fill(customer.email);
                // A store can ask for an address on the registration form.
                if (await form.locator('input[name="telephone"]').count() > 0) {
                    customer.addressAtRegistration = true;
                    await form.locator('input[name="telephone"]').fill('5550100');
                    await form.locator('input[name="street[0]"]').fill('1 Layout Street');
                    await form.locator('select[name="country_id"]').selectOption('US');
                    await form.locator('select[name="region_id"]').selectOption({ label: 'Michigan' });
                    await form.locator('input[name="city"]').fill('Calder');
                    await form.locator('input[name="postcode"]').fill('49628');
                }
                await form.locator('input[name="password"]').fill(customer.password);
                await form.locator('input[name="password_confirmation"]').fill(customer.password);
                await Promise.all([page.waitForURL(/customer\/account\/(index\/)?$/, { timeout: 45000 }).catch(() => {}), form.locator('button[type="submit"]').first().click()]);
                customer.created = true;
            } else {
                await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
                const form = page.locator('form:has(input[name="login[username]"])');
                await form.locator('input[name="login[username]"]').fill(customer.email);
                await form.locator('input[name="login[password]"]').fill(customer.password);
                await Promise.all([page.waitForURL(/customer\/account\/(index\/)?$/, { timeout: 45000 }).catch(() => {}), form.locator('button[type="submit"]').first().click()]);
            }
            await page.goto(base + '/customer/account/', { waitUntil: 'networkidle' });
            return !page.url().includes('/login');
        };
        // The reload of a customer whose quote already carries an address and a method, throttled.
        const reloadShift = async (ctx, scenario, mobile) => {
            const page = await ctx.newPage();
            watch(page, problems);
            await observeShifts(page);
            await throttle(ctx, page);
            const settle = trackNetwork(page);
            await openCheckout(page);
            await settle();
            const load = await takeShifts(page);
            await page.reload({ waitUntil: 'load' });
            await page.waitForSelector('[data-hyperion-place-order] button', { timeout: 45000 });
            await settle();
            const reload = await takeShifts(page);
            await page.close();
            const sum = (list) => list.reduce((a, s) => a + s.value, 0);
            for (const [title, taken] of [['load', load], ['reload', reload]]) console.log(`  STEP   ${viewportName(mobile)} ${scenario}, ${title}: ${sum(taken.counted).toFixed(4)}${taken.counted.length ? '  ' + shiftSummary(taken.counted).slice(0, 600) : ''}`);
            check(`checkout flow: no layout shift when a ${scenario} loads and reloads the checkout (${viewportName(mobile)}, slow network, 4x slower CPU)`, sum(load.counted) === 0 && sum(reload.counted) === 0, `load ${sum(load.counted).toFixed(4)}, reload ${sum(reload.counted).toFixed(4)}${load.counted.length + reload.counted.length ? '  ' + shiftSummary([...load.counted, ...reload.counted]).slice(0, 300) : ''}`);
            return [{ step: 'load', cls: sum(load.counted), shifts: load.counted, inputShifts: load.input }, { step: 'reload', cls: sum(reload.counted), shifts: reload.counted, inputShifts: reload.input }];
        };
        try {
            for (const mobile of VIEWPORTS) {
                // One sign in: the second viewport reuses the session cookies of the first.
                const ctx = await checkoutContext(mobile, sessions.length ? await sessions[0].ctx.storageState() : undefined);
                sessions.push({ mobile, ctx });
                const page = await ctx.newPage();
                let signedIn;
                if (sessions.length === 1) {
                    signedIn = await signIn(page);
                } else {
                    await page.goto(base + '/customer/account/', { waitUntil: 'networkidle' });
                    signedIn = !page.url().includes('/login');
                }
                check(`checkout customer: ${customer.registered && sessions.length === 1 ? 'a new customer is registered and' : 'the customer is'} signed in (${viewportName(mobile)})`, signedIn, customer.email);
                await page.close();
            }
            // 1. No saved address: the customer types one in the checkout, the quote keeps it with the method.
            {
                const page = await sessions[0].ctx.newPage();
                const settle = trackNetwork(page);
                await addToCart(page);
                await openCheckout(page);
                const cards = await page.locator('[data-hyperion-address-card]').count();
                if (customer.addressAtRegistration) {
                    check('checkout customer: the address the registration form asked for is offered as a saved address', cards >= 1, `${cards} saved address cards`);
                } else {
                    check('checkout customer: the customer starts without a saved address (the address form is offered)', cards === 0 && await page.locator('#hc-shipping-firstname').count() === 1, `${cards} saved address cards`);
                }
                if (cards === 0) await fillAddress(page, ADDRESS_US);
                const rates = await waitForRates(page);
                await settle();
                await page.close();
                check('checkout customer: the typed address was saved with a shipping method', rates);
            }
            for (const { mobile, ctx } of sessions) {
                const scenario = 'customer with a typed address on the quote';
                dump.customer[`${scenario} ${viewportName(mobile)}`] = await reloadShift(ctx, scenario, mobile);
                dump.parity[`${scenario} ${viewportName(mobile)}`] = reportParity(scenario, mobile, await measureCheckoutParity(ctx, problems));
            }
            // 2. A saved address: added in the address book, then selected in the checkout.
            {
                const page = await sessions[0].ctx.newPage();
                await page.goto(base + '/customer/address/new/', { waitUntil: 'networkidle' });
                const form = page.locator('form:has(input[name="street[0]"])');
                await form.locator('input[name="telephone"]').fill(ADDRESS_US.telephone);
                await form.locator('input[name="street[0]"]').fill(ADDRESS_US.street_0);
                await form.locator('select[name="country_id"]').selectOption('US');
                await form.locator('input[name="city"]').fill(ADDRESS_US.city);
                await form.locator('select[name="region_id"]').selectOption({ label: ADDRESS_US.region });
                await form.locator('input[name="postcode"]').fill(ADDRESS_US.postcode);
                await Promise.all([page.waitForURL(/customer\/address\/(index\/)?$/, { timeout: 45000 }).catch(() => {}), form.locator('button[type="submit"]').first().click()]);
                const settle = trackNetwork(page);
                await openCheckout(page);
                await settle();
                const cards = await page.locator('[data-hyperion-address-card]').count();
                check('checkout customer: the saved address is offered as a card', cards > 0, `${cards} cards`);
                if (cards > 0) {
                    const radio = page.locator('[data-hyperion-address-card] input[type="radio"]').first();
                    if (await radio.count() && !(await radio.isChecked())) await radio.check();
                }
                const rates = await waitForRates(page);
                await settle();
                await page.close();
                check('checkout customer: the saved address has a shipping method on the quote', rates);
            }
            for (const { mobile, ctx } of sessions) {
                const scenario = 'customer with a saved address';
                dump.customer[`${scenario} ${viewportName(mobile)}`] = await reloadShift(ctx, scenario, mobile);
                dump.parity[`${scenario} ${viewportName(mobile)}`] = reportParity(scenario, mobile, await measureCheckoutParity(ctx, problems));
            }
        } catch (e) {
            check('checkout customer run completed', false, e.message);
        } finally {
            check('checkout customer: no page errors, no HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
            for (const { ctx } of sessions) await ctx.close();
        }
    }
} catch (e) {
    check('script completed', false, e.message);
} finally {
    await browser.close();
}
if (dumpFile) {
    writeFileSync(dumpFile, JSON.stringify(dump, null, 2));
    console.log(`measurements written to ${dumpFile}`);
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed }, null, 2));
process.exit(failed.length ? 1 : 0);

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// Live check of the UI polish: no layout shift when the mini-cart
// opens (Chromium runs with classic scrollbars here, so the shift is measured
// against a real 15px scrollbar), no header shift when the header state
// arrives, the same header footprint with scripting off as after the
// components upgrade, toast dismissed on mini-cart open, 32rem mini-cart,
// single category landing content and a styled sidebar on the top-level
// categories; request synchronization: a double click on Add to Cart adds
// one unit (product page and tile), the button shows its busy text without
// changing size and keeps the focus, and rapid taps on the mini-cart stepper
// end at the right quantity with one or two requests.
// node e2e/pw-ui-polish.mjs <baseUrl>   (URL only, nothing is changed on the store)
import { createRequire } from 'node:module';
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

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail).slice(0, 220) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 220) : ''}`);
};
// Headless Chromium hides the scrollbars by default (overlay, 0px wide); the
// zero-shift checks need the classic 15px scrollbar a desktop browser has.
const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], ...launchOptions() });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${page.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
const toast = () => page.waitForFunction(() => { const n = document.querySelector('#hyperion-notification'); return n && !n.hidden && n.innerText.trim().length > 0; }, null, { timeout: 25000 }).catch(() => {});

try {
    // ---- header: icons in the cached markup, no shift when the state arrives
    const ssr = await (await ctx.request.get(base + u('/joust-duffle-bag.html'))).text();
    const ssrWishlist = ssr.match(/<a id="hyperion-wishlist-count"[\s\S]*?<\/a>/)?.[0] || '';
    check('header: wishlist and compare icons are in the server markup', /<svg/.test(ssrWishlist) && /<a id="hyperion-compare-count"[\s\S]*?<svg/.test(ssr), ssrWishlist.length + ' chars');
    const stateResponse = page.waitForResponse((r) => r.url().includes('/hyperion/header/state'), { timeout: 20000 });
    await page.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'domcontentloaded' });
    const before = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        return { wish: r('#hyperion-wishlist-count')?.x, account: r('hyperion-dropdown[placement="bottom-end"]')?.x, cart: r('hyperion-mini-cart')?.x, menu: r('hyperion-dropdown[placement="drawer"]')?.x };
    });
    await stateResponse;
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        return { wish: r('#hyperion-wishlist-count')?.x, account: r('hyperion-dropdown[placement="bottom-end"]')?.x, cart: r('hyperion-mini-cart')?.x, menu: r('hyperion-dropdown[placement="drawer"]')?.x };
    });
    const moved = Object.keys(before).filter((k) => Math.abs((before[k] ?? 0) - (after[k] ?? 0)) > 0.5);
    check('header: no horizontal movement of the action bar when the header state arrives', moved.length === 0, JSON.stringify({ before, after }));

    // ---- header: the light DOM of the drawers has the footprint of the upgraded components
    const footprint = () => ({
        bar: document.querySelector('#search-toggle')?.parentElement?.getBoundingClientRect(),
        nav: document.querySelector('header nav')?.getBoundingClientRect(),
        account: document.querySelector('hyperion-dropdown[placement="bottom-end"]')?.getBoundingClientRect(),
        cart: document.querySelector('hyperion-mini-cart')?.getBoundingClientRect(),
    });
    const round = (f) => Object.fromEntries(Object.entries(f).map(([k, r]) => [k, r ? [Math.round(r.x), Math.round(r.width), Math.round(r.height)] : null]));
    const upgraded = round(await page.evaluate(footprint));
    const noScript = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 }, javaScriptEnabled: false });
    const plain = await noScript.newPage();
    await plain.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'load' });
    const beforeUpgrade = round(await plain.evaluate(footprint));
    await noScript.close();
    check('header: same footprint before the components upgrade (scripting off) and after', JSON.stringify(upgraded) === JSON.stringify(beforeUpgrade), JSON.stringify({ upgraded, beforeUpgrade }));

    // ---- mini-cart: width, no scrollbar shift, toast dismissed
    await page.click('#product_addtocart_form button[type="submit"]');
    await toast();
    // The root width (not `clientWidth`, which ignores a stable gutter) and the
    // header x-position are the shift witnesses; `scrollbar` must be > 0 here.
    const widthBefore = await page.evaluate(() => ({ root: document.documentElement.getBoundingClientRect().width, header: document.querySelector('header .container')?.getBoundingClientRect().x, scrollbar: window.innerWidth - document.documentElement.clientWidth }));
    check('mini-cart: the check runs with a real scrollbar', widthBefore.scrollbar > 0, `scrollbar ${widthBefore.scrollbar}px`);
    await page.evaluate(() => document.querySelector('hyperion-mini-cart').openPanel());
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => {
        const el = document.querySelector('hyperion-mini-cart');
        const panel = el.shadowRoot.querySelector('[part="panel"]');
        return {
            root: document.documentElement.getBoundingClientRect().width,
            header: document.querySelector('header .container')?.getBoundingClientRect().x,
            bodyPadding: document.body.style.paddingRight,
            panelWidth: panel.getBoundingClientRect().width,
            toastHidden: document.querySelector('#hyperion-notification')?.hidden ?? true,
            bodyOverflow: document.body.style.overflow,
            backdropZ: getComputedStyle(el.shadowRoot.querySelector('[part="backdrop"]')).zIndex,
            panelZ: getComputedStyle(panel).zIndex,
        };
    });
    check('mini-cart: panel is 32rem (512px) wide', Math.round(open.panelWidth) === 512, String(open.panelWidth));
    check('mini-cart: opening shifts the page by 0px', open.root === widthBefore.root && Math.abs(open.header - widthBefore.header) < 0.5, JSON.stringify({ widthBefore, root: open.root, header: open.header, bodyPadding: open.bodyPadding }));
    check('mini-cart: the add-to-cart toast is dismissed when the drawer opens', open.toastHidden === true, String(open.toastHidden));
    check('mini-cart: body scroll locked, panel above the backdrop', open.bodyOverflow === 'hidden' && Number(open.panelZ) > Number(open.backdropZ), JSON.stringify({ overflow: open.bodyOverflow, backdropZ: open.backdropZ, panelZ: open.panelZ }));
    await page.evaluate(() => document.querySelector('hyperion-mini-cart').close());
    await page.waitForTimeout(400);
    check('mini-cart: closing restores the body and the width', await page.evaluate((w) => document.documentElement.getBoundingClientRect().width === w && document.body.style.overflow === '' && document.body.style.paddingRight === '', widthBefore.root));
    // Browsers without scrollbar-gutter: the root grows by the scrollbar width
    // when the body overflow is hidden and the lock pads the body by that growth.
    await page.evaluate(() => { document.documentElement.style.scrollbarGutter = 'auto'; document.querySelector('hyperion-mini-cart').openPanel(); });
    await page.waitForTimeout(400);
    const noGutter = await page.evaluate(() => ({ header: document.querySelector('header .container')?.getBoundingClientRect().x, bodyPadding: document.body.style.paddingRight, root: document.documentElement.getBoundingClientRect().width }));
    await page.evaluate(() => { document.querySelector('hyperion-mini-cart').close(); document.documentElement.style.scrollbarGutter = ''; });
    await page.waitForTimeout(400);
    check('mini-cart: without a stable gutter the lock pads the body by the scrollbar width and nothing moves', Math.abs(noGutter.header - widthBefore.header) < 0.5 && noGutter.bodyPadding === `${widthBefore.scrollbar}px`, JSON.stringify(noGutter));
    check('toast: success auto-close is 3.5 s', await page.evaluate(() => document.querySelector('#hyperion-notification')?.getAttribute('auto-close')) === '3500');

    // ---- request synchronization and the Add to Cart busy state
    // A fresh visitor, so the counts start from an empty cart.
    {
        const syncCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 } });
        const sync = await syncCtx.newPage();
        sync.on('pageerror', (e) => problems.push(`pageerror ${sync.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
        sync.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
        const finished = { add: 0, update: 0 };
        sync.on('requestfinished', (r) => {
            if (r.method() !== 'POST') return;
            if (r.url().includes('/checkout/cart/add')) finished.add++;
            if (r.url().includes('/checkout/cart/updatePost')) finished.update++;
        });
        // The add answers after 600 ms, so the busy state can be measured while it runs.
        await sync.route(/\/checkout\/cart\/add(\/|\?|$)/, async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 600));
            await route.continue();
        });
        const cartCount = () => sync.evaluate(() => Number((document.querySelector('#hyperion-mini-cart-count')?.textContent || '').trim()) || 0);
        const syncToast = () => sync.waitForFunction(() => { const n = document.querySelector('#hyperion-notification'); return n && !n.hidden && n.innerText.trim().length > 0; }, null, { timeout: 25000 }).then(() => true).catch(() => false);
        const buttonState = (selector) => sync.evaluate((sel) => {
            const button = document.querySelector(sel);
            const visible = (part) => { const el = button?.querySelector(part); return el ? getComputedStyle(el).visibility === 'visible' : null; };
            let active = document.activeElement;
            while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
            const rect = button?.getBoundingClientRect();
            return { width: rect?.width, height: rect?.height, label: visible('[data-hyperion-atc-label]'), busy: visible('[data-hyperion-atc-busy]'), focused: !!button && active === button };
        }, selector);

        // A simple product outside the bags category, so the tile below adds another line
        // (the header count may be the number of lines or the sum of the quantities).
        const pdpButton = '#product_addtocart_form button[type="submit"]';
        await sync.goto(base + u('/affirm-water-bottle.html'), { waitUntil: 'networkidle' });
        const pdpCountBefore = await cartCount();
        const idle = await buttonState(pdpButton);
        await sync.dblclick(pdpButton);
        // Within 100 ms of the click (the answer is still 500 ms away).
        const busy = await buttonState(pdpButton);
        const pdpToast = await syncToast();
        await sync.waitForTimeout(700);
        const done = await buttonState(pdpButton);
        const pdpCountAfter = await cartCount();
        const toasts = await sync.evaluate(() => [...document.querySelectorAll('hyperion-notification, #hyperion-notification')].filter((n) => !n.hidden && n.innerText.trim().length > 0).length);
        check('add to cart: a double click on the product page sends one request, adds one unit and shows one toast',
            finished.add === 1 && pdpCountAfter === pdpCountBefore + 1 && pdpToast && toasts === 1,
            JSON.stringify({ requests: finished.add, before: pdpCountBefore, after: pdpCountAfter, toasts }));
        check('add to cart: the button shows the busy text while the request runs and the label again after it',
            idle.label === true && idle.busy === false && busy.label === false && busy.busy === true && done.label === true && done.busy === false,
            JSON.stringify({ idle, busy, done }));
        check('add to cart: the button has the same size before, during and after the request',
            idle.width > 0 && idle.width === busy.width && idle.width === done.width && idle.height === busy.height && idle.height === done.height,
            JSON.stringify({ idle: [idle.width, idle.height], busy: [busy.width, busy.height], done: [done.width, done.height] }));
        check('add to cart: the submit button still has the focus after the add', done.focused === true, JSON.stringify({ during: busy.focused, after: done.focused }));

        // A tile: the first Add to Cart form of the bags category (products without required options).
        await sync.goto(base + u('/gear/bags.html'), { waitUntil: 'networkidle' });
        const tileButton = '[data-hyperion-tiles] form[hx-post*="checkout/cart/add"] button[type="submit"]';
        if (await sync.locator(tileButton).count() > 0) {
            const tileCountBefore = await cartCount();
            const addsBefore = finished.add;
            await sync.locator(tileButton).first().dblclick();
            await syncToast();
            await sync.waitForTimeout(700);
            const tileCountAfter = await cartCount();
            check('add to cart: a double click on a tile adds one unit', finished.add === addsBefore + 1 && tileCountAfter === tileCountBefore + 1,
                JSON.stringify({ requests: finished.add - addsBefore, before: tileCountBefore, after: tileCountAfter }));
        } else {
            console.log('SKIP  add to cart: a double click on a tile adds one unit  -- the listing has no Add to Cart form ("Add to Cart from Listing Page" is off)');
        }
        await syncCtx.close();

        // Mini-cart stepper: one line at quantity 2, five taps on plus 50 ms apart.
        const stepCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 } });
        const step = await stepCtx.newPage();
        step.on('pageerror', (e) => problems.push(`pageerror ${step.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
        step.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
        let updates = 0;
        step.on('requestfinished', (r) => { if (r.method() === 'POST' && r.url().includes('/checkout/cart/updatePost')) updates++; });
        await step.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'networkidle' });
        await step.fill('#qty', '2');
        await step.click(pdpButton);
        await step.waitForFunction(() => { const n = document.querySelector('#hyperion-notification'); return n && !n.hidden && n.innerText.trim().length > 0; }, null, { timeout: 25000 }).catch(() => {});
        await step.evaluate(() => document.querySelector('hyperion-mini-cart').openPanel());
        const line = () => step.evaluate(() => {
            const root = document.querySelector('hyperion-mini-cart').shadowRoot;
            const total = root.querySelector('[data-hyperion-minicart-row-total]');
            // The first text of the row total (an "Excl. Tax" line may follow), as an integer of its digits.
            const amount = Number(((total?.firstChild?.textContent || total?.textContent || '').match(/[\d.,]+/) || [''])[0].replace(/\D/g, ''));
            return { lines: root.querySelectorAll('[data-hyperion-minicart-item]').length, qty: root.querySelector('[data-hyperion-minicart-qty]')?.value ?? '', amount };
        });
        await step.waitForFunction(() => !!document.querySelector('hyperion-mini-cart').shadowRoot.querySelector('[data-hyperion-minicart-qty]'), null, { timeout: 20000 }).catch(() => {});
        const startLine = await line();
        const plus = step.locator('hyperion-mini-cart [data-hyperion-minicart-qty-step="1"]').first();
        for (let i = 0; i < 5; i++) {
            await plus.click();
            await step.waitForTimeout(50);
        }
        const tapped = await line();
        // The quiet time, the request (two at most) and the refetch of the drawer.
        await step.waitForFunction((start) => {
            const total = document.querySelector('hyperion-mini-cart').shadowRoot.querySelector('[data-hyperion-minicart-row-total]');
            const amount = Number(((total?.firstChild?.textContent || total?.textContent || '').match(/[\d.,]+/) || [''])[0].replace(/\D/g, ''));
            return amount > start;
        }, startLine.amount, { timeout: 20000 }).catch(() => {});
        await step.waitForTimeout(1200);
        const endLine = await line();
        check('mini-cart stepper: five taps 50 ms apart end at the start quantity plus five',
            startLine.lines === 1 && startLine.qty === '2' && tapped.qty === '7' && endLine.qty === '7',
            JSON.stringify({ start: startLine.qty, afterTaps: tapped.qty, end: endLine.qty }));
        check('mini-cart stepper: the row total is the one of seven units', startLine.amount > 0 && endLine.amount * 2 === startLine.amount * 7, JSON.stringify({ atTwo: startLine.amount, atSeven: endLine.amount }));
        check('mini-cart stepper: the five taps cost one or two update requests', updates >= 1 && updates <= 2, `${updates} requests`);
        await stepCtx.close();
    }

    // ---- category landings
    for (const path of [u('/men.html'), u('/women.html'), u('/gear.html')]) {
        await page.goto(base + path, { waitUntil: 'networkidle' });
        const facts = await page.evaluate(() => ({
            hotSellers: document.body.innerHTML.split('Hot Sellers').length - 1,
            promo: document.querySelectorAll('.blocks-promo').length,
            coreNav: document.querySelectorAll('#narrow-by-list2, .block.filter').length,
            styledNav: document.querySelectorAll('[data-hyperion-category-nav]').length,
            leftMenu: document.querySelectorAll('.sidebar .categories-menu').length,
            leftMenuStyled: (() => { const a = document.querySelector('.sidebar .categories-menu .items .item a'); return a ? getComputedStyle(a).display === 'block' : true; })(),
        }));
        check(`${path}: landing content rendered once, sidebar styled`, facts.hotSellers === 1 && facts.promo === 1 && facts.coreNav === 0 && facts.styledNav === 1 && facts.leftMenuStyled, JSON.stringify(facts));
        // Full-bleed promo images must fill their card whether they are a bare <img>, a
        // Luma `<span class="image">` or the `<picture>` HyperionImage's rewriter wraps
        // them in once a WebP companion exists (the wrapper broke the child selectors
        // of _widgets.css).
        const promoImages = await page.evaluate(() => [...document.querySelectorAll('.blocks-promo .block-promo')].flatMap((card) => {
            const img = card.querySelector(':scope > img, :scope > picture > img, :scope > .image img');
            if (!img) return [];
            const c = card.getBoundingClientRect(); const i = img.getBoundingClientRect();
            return [{ picture: !!img.closest('picture'), fills: Math.abs(c.width - i.width) < 2 && Math.abs(c.height - i.height) < 2, card: `${Math.round(c.width)}x${Math.round(c.height)}`, img: `${Math.round(i.width)}x${Math.round(i.height)}` }];
        }));
        check(`${path}: every full-bleed promo image fills its card (${promoImages.length} images, ${promoImages.filter((p) => p.picture).length} in <picture>)`, promoImages.length > 0 && promoImages.every((p) => p.fills), JSON.stringify(promoImages.filter((p) => !p.fills)));
    }
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
} finally {
    await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

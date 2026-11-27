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
// end at the right quantity with one or two requests; the cart page on a
// phone: the sticky bar with the order total and the checkout link (its
// footprint, its place in the flow, the state it shares with the summary card).
// node e2e/pw-ui-polish.mjs <baseUrl> [<slotDir>]
// With the URL only nothing is changed on the store. With the Magento install
// directory the store settings part runs too, each setting changed for its
// check and put back as found (also when the run is interrupted): wish list,
// newsletter and contact off (no link to /wishlist, no footer subscribe form,
// no /contact link on the home, category, product and account pages, guest
// and the sample customer; the header keeps its footprint with the wish list
// off), the maximum search length on the header search fields (their minimum
// stays 2), the logo size settings (their ratio at the drawn 40 px height) on
// the header and footer logo (a logo image copied into the media directory for
// that check), the layered navigation counts switched off, and one visible
// "Out of stock" on a product taken out of stock
// (e2e/fixtures/stock-zero-fixture.php). An interrupted run removes the logo
// image and puts the stock back too. The customer login of that part needs the
// customer_login reCAPTCHA type cleared (see docs/development.md).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUrl, resolveUrlSuffix } from './lib/url-suffix.mjs';
import { makeRunConfig } from './lib/run-config.mjs';

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
// The install, for the store settings part only.
const slotDir = process.argv[3] && !process.argv[3].startsWith('--') ? path.resolve(process.argv[3]) : '';
const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const compose = (service, cmd, user) => execFileSync('docker', ['compose', '--project-directory', slotDir, 'exec', '-T', ...(user ? ['-u', user] : []), service, 'bash', '-c', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const magento = (cmd) => compose('php-fpm', `cd /var/www/html && bin/magento ${cmd}`, 'www-data');
const sql = (query) => compose('db', `C=$(command -v mariadb || command -v mysql); $C -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e ${JSON.stringify(query)} 2>/dev/null`).trim();
const flushCaches = () => {
    magento('cache:flush > /dev/null');
    try { compose('varnish', "varnishadm ban 'req.url ~ .' > /dev/null"); } catch { /* no Varnish on this install */ }
};
const runConfig = slotDir ? makeRunConfig(sql, flushCaches) : null;
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

    // ---- cart page on a phone: the sticky checkout bar
    {
        // Mobile emulation gives the layout the whole width (overlay scrollbars), like a real phone.
        const phoneCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const phone = await phoneCtx.newPage();
        phone.on('pageerror', (e) => problems.push(`pageerror ${phone.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
        phone.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
        // Three lines: on a phone the summary card then starts below the first screen.
        for (const productPath of ['/joust-duffle-bag.html', '/fusion-backpack.html', '/affirm-water-bottle.html']) {
            await phone.goto(base + u(productPath), { waitUntil: 'networkidle' });
            await phone.click('#product_addtocart_form button[type="submit"]');
            await phone.waitForFunction(() => { const n = document.querySelector('#hyperion-notification'); return n && !n.hidden && n.innerText.trim().length > 0; }, null, { timeout: 25000 }).catch(() => {});
        }
        await phone.goto(base + '/checkout/cart/', { waitUntil: 'networkidle' });
        const barFacts = () => phone.evaluate(() => {
            const bar = document.querySelector('[data-hyperion-checkout-bar]');
            const card = document.querySelector('[data-hyperion-cart-totals]');
            const rect = bar?.getBoundingClientRect();
            const cardRect = card?.getBoundingClientRect();
            const state = (a) => (a ? { href: a.getAttribute('href') ?? '', disabled: a.getAttribute('aria-disabled') ?? '', describedBy: a.getAttribute('aria-describedby') ?? '', text: a.textContent.replace(/\s+/g, ' ').trim() } : null);
            const barLink = bar?.querySelector('[data-hyperion-checkout-bar-link]');
            const cardLink = card?.querySelector('[data-hyperion-checkout-link]');
            const linkRect = barLink?.getBoundingClientRect();
            const cardLinkRect = cardLink?.getBoundingClientRect();
            const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
            const root = document.documentElement;
            return {
                bars: document.querySelectorAll('[data-hyperion-checkout-bar]').length,
                position: bar ? getComputedStyle(bar).position : '',
                display: bar ? getComputedStyle(bar).display : '',
                rect: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
                screen: { width: Math.round(root.getBoundingClientRect().width), height: window.innerHeight },
                total: text(bar?.querySelector('[data-hyperion-checkout-bar-total]')),
                cardTotal: text(card?.querySelector('[data-total="grand_total"] dd')),
                barLink: state(barLink),
                cardLink: state(cardLink),
                linkOnScreen: !!linkRect && linkRect.width > 0 && linkRect.top >= 0 && linkRect.bottom <= window.innerHeight && linkRect.left >= 0 && linkRect.right <= root.getBoundingClientRect().width + 0.5,
                linkHeight: Math.round(linkRect?.height ?? 0),
                card: cardRect ? { top: Math.round(cardRect.top), bottom: Math.round(cardRect.bottom) } : null,
                cardLinkBottom: Math.round(cardLinkRect?.bottom ?? 0),
                siblings: !!bar && !!card && bar.parentElement === card.parentElement && bar.previousElementSibling === card,
                sideways: root.scrollWidth > Math.ceil(root.getBoundingClientRect().width),
            };
        });
        const atLoad = await barFacts();
        check(
            'cart on a phone: one checkout bar sticks to the bottom of the first screen while the summary card is further down',
            atLoad.bars === 1 && atLoad.position === 'sticky' && atLoad.display !== 'none' && !!atLoad.rect && Math.abs(atLoad.rect.bottom - atLoad.screen.height) <= 1
                && atLoad.rect.height >= 56 && atLoad.rect.height <= 96 && !!atLoad.card && atLoad.cardLinkBottom > atLoad.screen.height && !atLoad.sideways,
            JSON.stringify({ rect: atLoad.rect, screen: atLoad.screen, card: atLoad.card, position: atLoad.position, sideways: atLoad.sideways })
        );
        check(
            'cart on a phone: the bar spans the page from edge to edge',
            !!atLoad.rect && atLoad.rect.left === 0 && Math.abs(atLoad.rect.width - atLoad.screen.width) <= 1,
            JSON.stringify({ left: atLoad.rect?.left, width: atLoad.rect?.width, page: atLoad.screen.width })
        );
        check(
            'cart on a phone: the bar shows the order total of the summary card and a checkout link of at least 44 px, fully on screen',
            atLoad.total !== '' && atLoad.total === atLoad.cardTotal && !!atLoad.barLink && atLoad.barLink.text !== '' && atLoad.barLink.text === atLoad.cardLink?.text && atLoad.linkOnScreen && atLoad.linkHeight >= 44,
            JSON.stringify({ total: atLoad.total, cardTotal: atLoad.cardTotal, link: atLoad.barLink, linkHeight: atLoad.linkHeight, onScreen: atLoad.linkOnScreen })
        );
        check(
            'cart on a phone: the bar link is in the state of the summary card link (target, disabled state, description)',
            !!atLoad.barLink && !!atLoad.cardLink && atLoad.barLink.href === atLoad.cardLink.href && atLoad.barLink.disabled === atLoad.cardLink.disabled && atLoad.barLink.describedBy === atLoad.cardLink.describedBy
                && (atLoad.barLink.href !== '' || atLoad.barLink.disabled === 'true'),
            JSON.stringify({ bar: atLoad.barLink, card: atLoad.cardLink })
        );
        // The end of the cart: the bar leaves the bottom of the screen and rests in its own place, after the card.
        // Two positions: the cart ending low on the screen, then higher (the card would leave under the header).
        const scrollCartEndTo = async (y) => {
            await phone.evaluate((target) => {
                const cart = document.querySelector('[data-hyperion-checkout-bar]').parentElement;
                window.scrollBy(0, cart.getBoundingClientRect().bottom - target);
            }, y);
            await phone.waitForTimeout(400);
            return barFacts();
        };
        const resting = await scrollCartEndTo(744);
        check(
            'cart on a phone: the bar is in the flow, the element right after the summary card, and rests under it at the end of the cart',
            resting.siblings && !!resting.rect && !!resting.card && resting.rect.bottom < resting.screen.height - 50 && resting.rect.top >= resting.card.bottom,
            JSON.stringify({ siblings: resting.siblings, bar: resting.rect, card: resting.card })
        );
        const higher = await scrollCartEndTo(500);
        check(
            'cart on a phone: the bar covers no part of the summary card while the end of the cart scrolls up the screen',
            !!higher.rect && !!higher.card && higher.card.bottom > 0 && higher.rect.top >= higher.card.bottom,
            JSON.stringify({ bar: higher.rect, card: higher.card, cardLinkBottom: higher.cardLinkBottom })
        );
        // A quantity change swaps the card and the bar together.
        await phone.evaluate(() => window.scrollTo(0, 0));
        await Promise.all([
            phone.waitForResponse((r) => r.url().includes('/checkout/cart/updatePost'), { timeout: 30000 }),
            phone.locator('[data-hyperion-cart-item] [data-hyperion-qty-step="1"]').first().click(),
        ]);
        await phone.waitForTimeout(1200);
        const afterChange = await barFacts();
        check(
            'cart on a phone: after a quantity change there is still one bar and it shows the new order total',
            afterChange.bars === 1 && afterChange.total !== '' && afterChange.total === afterChange.cardTotal && afterChange.total !== atLoad.total && !!afterChange.rect && Math.abs(afterChange.rect.bottom - afterChange.screen.height) <= 1,
            JSON.stringify({ bars: afterChange.bars, before: atLoad.total, after: afterChange.total, cardTotal: afterChange.cardTotal })
        );
        await phone.setViewportSize({ width: 1366, height: 800 });
        await phone.waitForTimeout(200);
        const wide = await barFacts();
        check('cart on a wide screen: the bar is not displayed, the summary card carries the link', wide.display === 'none' && !!wide.cardLink?.href, JSON.stringify({ display: wide.display, card: wide.cardLink }));
        await phoneCtx.close();
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
    // ---- store settings (with the install directory only)
    if (!slotDir) {
        console.log('SKIP  store settings: wish list, newsletter and contact off, search lengths, logo size, layered navigation counts, out of stock  -- no <slotDir> argument');
    } else {
        const watchPage = (p) => {
            p.on('pageerror', (e) => problems.push(`pageerror ${p.url().replace(base, '')}: ${e.message.slice(0, 120)}`));
            p.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(base, '').slice(0, 100)}`); });
        };
        const overridden = (paths) => sql(`select concat(scope, ':', scope_id, ' ', path) from core_config_data where scope <> 'default' and path in (${paths.map((p) => `'${p}'`).join(', ')})`);
        // ---- wish list, newsletter and contact off
        const FEATURES = ['wishlist/general/active', 'newsletter/general/active', 'contact/contact/enabled'];
        const featureOverrides = overridden(FEATURES);
        if (featureOverrides) console.log(`NOTE  store or website values win over the default scope for: ${featureOverrides.replace(/\n/g, ', ')}`);
        for (const configPath of FEATURES) runConfig.set(configPath, 0);
        flushCaches();
        const featureFacts = (p) => p.evaluate(() => {
            const paths = [...document.querySelectorAll('a[href]')].map((a) => { try { return new URL(a.href, location.href).pathname; } catch { return ''; } });
            return {
                wishlistLinks: paths.filter((p) => /\/wishlist(\/|$)/.test(p)).length,
                wishlistIcon: document.querySelectorAll('#hyperion-wishlist-count').length,
                subscribe: document.querySelectorAll('form[action*="newsletter/subscriber/new"], #newsletter-validate-detail').length,
                contactLinks: paths.filter((p) => /\/contact(\/index)?\/?$/.test(p)).length,
            };
        });
        const pagesOff = [['home', '/'], ['category', u('/gear/bags.html')], ['product', u('/joust-duffle-bag.html')]];
        for (const who of ['guest', 'customer']) {
            const featureCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 } });
            const p = await featureCtx.newPage();
            watchPage(p);
            const visits = [...pagesOff];
            if (who === 'customer') {
                await p.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
                await p.fill('input[name="login[username]"]', 'roni_cost@example.com');
                await p.fill('input[name="login[password]"]', 'roni_cost3@example.com');
                await Promise.all([p.waitForURL(/customer\/account\/?(\?.*)?$/, { timeout: 20000 }).catch(() => {}), p.click('form[action*="loginPost"] button[type="submit"]')]);
                check('features off (customer): login as the sample customer', /customer\/account\/?(\?.*)?$/.test(p.url()), p.url().replace(base, ''));
                visits.push(['account', '/customer/account/']);
            }
            for (const [name, target] of visits) {
                await p.goto(base + target, { waitUntil: 'networkidle' });
                const facts = await featureFacts(p);
                check(`wish list off (${who}, ${name} page): no link to the wish list, no wish list icon`, facts.wishlistLinks === 0 && facts.wishlistIcon === 0, JSON.stringify(facts));
                check(`newsletter off (${who}, ${name} page): no subscribe form`, facts.subscribe === 0, JSON.stringify(facts));
                check(`contact off (${who}, ${name} page): no link to the contact page`, facts.contactLinks === 0, JSON.stringify(facts));
            }
            await featureCtx.close();
        }
        // The header with the wish list off: the action bar stays where it is when the header state arrives, and
        // the markup before the components upgrade has the footprint of the upgraded header.
        {
            const offCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 } });
            const p = await offCtx.newPage();
            watchPage(p);
            const positions = () => p.evaluate(() => {
                const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
                return { compare: r('#hyperion-compare-count')?.x, account: r('hyperion-dropdown[placement="bottom-end"]')?.x, cart: r('hyperion-mini-cart')?.x, menu: r('hyperion-dropdown[placement="drawer"]')?.x };
            });
            const arrived = p.waitForResponse((r) => r.url().includes('/hyperion/header/state'), { timeout: 20000 }).catch(() => null);
            await p.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'domcontentloaded' });
            const early = await positions();
            await arrived;
            await p.waitForTimeout(500);
            const late = await positions();
            const shifted = Object.keys(early).filter((k) => Math.abs((early[k] ?? 0) - (late[k] ?? 0)) > 0.5);
            check('wish list off: no horizontal movement of the action bar when the header state arrives', shifted.length === 0 && (await p.locator('#hyperion-wishlist-count').count()) === 0, JSON.stringify({ early, late }));
            const offUpgraded = round(await p.evaluate(footprint));
            await offCtx.close();
            const offPlainCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 }, javaScriptEnabled: false });
            const plainPage = await offPlainCtx.newPage();
            await plainPage.goto(base + u('/joust-duffle-bag.html'), { waitUntil: 'load' });
            const offPlain = round(await plainPage.evaluate(footprint));
            await offPlainCtx.close();
            check('wish list off: same header footprint before the components upgrade (scripting off) and after', JSON.stringify(offUpgraded) === JSON.stringify(offPlain), JSON.stringify({ offUpgraded, offPlain }));
        }
        for (const configPath of FEATURES) runConfig.restore(configPath);

        // ---- search length limits on the header search fields: maxlength follows the store, minlength stays 2
        // (core runs two letter queries such as "XS" whatever its minimum query length says).
        runConfig.set('catalog/search/min_query_length', 4);
        runConfig.set('catalog/search/max_query_length', 60);
        flushCaches();
        {
            const p = await ctx.newPage();
            watchPage(p);
            await p.goto(base + '/', { waitUntil: 'networkidle' });
            const fields = await p.evaluate(() => [...document.querySelectorAll('input[name="q"]')].filter((el) => !el.closest('#maincontent')).map((el) => ({ id: el.id, min: el.getAttribute('minlength'), max: el.getAttribute('maxlength') })));
            check('header search: every search field carries maxlength from the search settings (60) and keeps minlength 2 with a minimum query length of 4', fields.length > 0 && fields.every((f) => f.min === '2' && f.max === '60'), JSON.stringify(fields));
            await p.close();
        }
        runConfig.restore('catalog/search/min_query_length');
        runConfig.restore('catalog/search/max_query_length');

        // ---- logo size settings: an uploaded logo of the run (core reads it under media/logo/)
        const logoSource = compose('php-fpm', 'cd /var/www/html/pub/media && ls wysiwyg/home/home-main.jpg catalog/product/placeholder/*.jpg 2> /dev/null | head -1', 'www-data').trim();
        if (!logoSource) {
            console.log('SKIP  logo size: no image in the media directory to use as a logo');
        } else {
            const removeLogo = () => compose('php-fpm', 'rm -rf /var/www/html/pub/media/logo/hyperion-e2e', 'www-data');
            const logoRegistered = runConfig.onAbort('logo image of the run removed', removeLogo);
            try {
                compose('php-fpm', `cd /var/www/html/pub/media && mkdir -p logo/hyperion-e2e && cp ${JSON.stringify(logoSource)} logo/hyperion-e2e/logo.jpg`, 'www-data');
                runConfig.set('design/header/logo_src', 'hyperion-e2e/logo.jpg');
                const logoSize = async () => {
                    const p = await ctx.newPage();
                    await p.goto(base + '/', { waitUntil: 'networkidle' });
                    const sizes = await p.evaluate(() => {
                        const size = (img) => (img ? `${img.getAttribute('width')}x${img.getAttribute('height')}` : '');
                        return { header: size(document.querySelector('header img[src*="/logo/"]')), footer: size(document.querySelector('#hyperion-footer img[src*="/logo/"], footer img[src*="/logo/"]')) };
                    });
                    await p.close();
                    return sizes;
                };
                runConfig.set('design/header/logo_width', null);
                runConfig.set('design/header/logo_height', null);
                flushCaches();
                const fallback = await logoSize();
                check('logo: without size settings the header and footer logo are 140 x 40', fallback.header === '140x40' && (fallback.footer === '' || fallback.footer === '140x40'), JSON.stringify(fallback));
                // The settings give the aspect ratio; the logo is drawn 40 px high, so 300 x 60 becomes 200 x 40.
                runConfig.set('design/header/logo_width', 300);
                runConfig.set('design/header/logo_height', 60);
                flushCaches();
                const sized = await logoSize();
                check('logo: the header and footer logo follow the ratio of the logo settings at the drawn height (300 x 60 drawn 200 x 40)', sized.header === '200x40' && (sized.footer === '' || sized.footer === '200x40'), JSON.stringify(sized));
            } finally {
                // The image goes even when a restore throws (the run-config restores the settings again at the end).
                try {
                    for (const configPath of ['design/header/logo_src', 'design/header/logo_width', 'design/header/logo_height']) runConfig.restore(configPath);
                } finally {
                    removeLogo();
                    logoRegistered();
                }
            }
        }

        // ---- layered navigation counts
        {
            const counts = async () => {
                const p = await ctx.newPage();
                await p.goto(base + u('/women/tops-women.html'), { waitUntil: 'networkidle' });
                const found = await p.evaluate(() => {
                    const nav = document.querySelector('#hyperion-layered-nav');
                    const links = [...(nav?.querySelectorAll('a') ?? [])];
                    // A count is a span of digits of its own (with or without parentheses) inside the option link.
                    const counted = (a) => [...a.querySelectorAll('span')].some((span) => span.children.length === 0 && /^\(?\d+\)?$/.test(span.textContent.trim()));
                    return { links: links.length, withCount: links.filter(counted).length };
                });
                await p.close();
                return found;
            };
            runConfig.set('catalog/layered_navigation/display_product_count', 1);
            flushCaches();
            const shown = await counts();
            runConfig.set('catalog/layered_navigation/display_product_count', 0);
            flushCaches();
            const hidden = await counts();
            check('layered navigation: the option counts follow the product count setting (shown on 1, none on 0)', shown.withCount > 0 && hidden.links > 0 && hidden.withCount === 0, JSON.stringify({ shown, hidden }));
            runConfig.restore('catalog/layered_navigation/display_product_count');
        }

        // ---- one visible "Out of stock" on an out of stock product page
        const stockSku = '24-UG07';
        execFileSync('docker', ['compose', '--project-directory', slotDir, 'cp', path.join(FIXTURE_DIR, 'stock-zero-fixture.php'), 'php-fpm:/tmp/stock-zero-fixture.php']);
        const restoreStock = () => console.log(compose('php-fpm', `cd /var/www/html && php /tmp/stock-zero-fixture.php /var/www/html --remove ${stockSku}; rm -f /tmp/stock-zero-fixture.php`, 'www-data').trim());
        const stockRegistered = runConfig.onAbort(`stock of ${stockSku} put back`, restoreStock);
        try {
            console.log(compose('php-fpm', `cd /var/www/html && php /tmp/stock-zero-fixture.php /var/www/html --apply ${stockSku}`, 'www-data').trim());
            flushCaches();
            const stockPath = sql(`select u.request_path from url_rewrite u join catalog_product_entity e on e.entity_id = u.entity_id where u.entity_type = 'product' and e.sku = '${stockSku}' and u.redirect_type = 0 and u.metadata is null order by u.store_id limit 1`);
            const p = await ctx.newPage();
            watchPage(p);
            const response = await p.goto(`${base}/${stockPath}`, { waitUntil: 'networkidle' });
            const messages = await p.evaluate(() => {
                const walker = document.createTreeWalker(document.querySelector('#maincontent') ?? document.body, NodeFilter.SHOW_TEXT);
                const found = [];
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    if (!/^\s*out of stock\s*$/i.test(node.textContent)) continue;
                    const el = node.parentElement;
                    const r = el.getBoundingClientRect();
                    const style = getComputedStyle(el);
                    if (r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && !el.closest('.sr-only')) found.push(el.localName);
                }
                return found;
            });
            check('out of stock product page: one visible "Out of stock" message', response?.status() === 200 && messages.length === 1, JSON.stringify({ status: response?.status(), path: stockPath, messages }));
            await p.close();
        } finally {
            restoreStock();
            stockRegistered();
        }
    }
    check('no page errors / HTTP 5xx', problems.length === 0, problems.slice(0, 4).join(' | '));
} finally {
    await browser.close();
    if (runConfig) {
        const notRestored = runConfig.restoreAll();
        if (notRestored.length) check('restore: settings of the run put back', false, notRestored.join(', '));
        flushCaches();
    }
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }, null, 2));
process.exit(failed.length ? 1 : 0);

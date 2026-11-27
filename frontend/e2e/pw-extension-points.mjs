#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the storefront extension points and of the generic checkout API with the sample extension module
// (dev/modules/Magentofullstackdev/HyperionSampleExtension), plus the order comment and newsletter opt-in.
// Usage: node e2e/pw-extension-points.mjs <baseUrl> <slotDir> [--only markers,account,footprint,checkout-api,checkout-error,consumers,off] [--shots dir]
//   node e2e/pw-extension-points.mjs https://shop.example <slotDir>
// <slotDir> is the Magento install directory (docker compose project with the services php-fpm and db).
//
//   markers         with the sample markers on, desktop and phone: every product page container shows its marker
//                   at its place (asserted against the gallery, the title, the price box, the add to cart form);
//                   the extra product tab is in the server rendered tab strip and in the upgraded component; the
//                   tile hooks of a category; the cart containers and the sample total row, also after an htmx
//                   quantity update; the header links (account menu on desktop, drawer on phone) and the footer
//                   link; the login container; both Core events add their marker fragment to their response
//   account         customer: the account sidebar and dashboard containers, the order history column and the
//                   order view button
//   footprint       the header keeps its size with the markers on and off
//   checkout-api    guest and customer: the sample gate blocks with its message until its slot checkbox is
//                   ticked; the filter's attribute is in the payment-information request; the declared address
//                   field shows only for an Italian billing address, blocks while empty and travels in the request
//                   (guest); the hyperion:checkout:* events arrive in order and carry no email or address
//   checkout-error  a failed rate request (injected) dispatches hyperion:checkout:error with no personal data
//   consumers       order comment and newsletter opt-in on, guest and customer: the comment is on the order and
//                   on the storefront order view, the subscriber exists
//   off             with everything off: no marker on the pages, no extension chunk requested on /checkout/
//
// Needs the sample modules (node e2e/install-dev-modules.mjs <slotDir>); the script never installs them. It switches
// the markers and the features on for the run and puts every setting back as it found it; the test subscribers are
// removed (the sample customer's subscription is put back as found). Orders stay on the install, as for the other
// scripts. Prints numbered PASS / FAIL lines and a JSON summary, exit code 1 on any failure, page error, HTTP 5xx
// or Content Security Policy violation.
// The customer parts log in: clear the customer_login reCAPTCHA type for the run beforehand (see
// docs/development.md), as for pw-suite.mjs.
import { builtChunkPatterns, createHarness, sleep } from './lib/harness.mjs';
import { requireDevModules } from './lib/dev-modules.mjs';

// ---------------------------------------------------------------- names of the contract and of the sample module
const DEV_MODULES = ['Magentofullstackdev_HyperionSampleExtension'];
const MODULE_PATH = 'Magentofullstackdev_HyperionSampleExtension';
const CONFIG = {
    sampleEnabled: 'hyperion_sample_extension/general/enabled',
    markers: 'hyperion_sample_extension/general/markers',
    sampleFee: 'hyperion_sample_extension/general/sample_fee',
    orderComment: 'hyperion_checkout/order_comment/enabled',
    newsletter: 'hyperion_checkout/newsletter/enabled',
    newsletterChecked: 'hyperion_checkout/newsletter/checked_by_default',
    guestSubscribe: 'newsletter/subscription/allow_guest_subscribe',
    subscriptionConfirm: 'newsletter/subscription/confirm',
};
const MARKER_ATTR = 'data-hyperion-sample-marker';
const MARKER = {
    mediaAfter: 'hyperion.product.media.after',
    infoTop: 'hyperion.product.info.top',
    afterPrice: 'hyperion.product.info.after_price',
    beforeAddToCart: 'hyperion.product.info.before_addtocart',
    formAdditional: 'hyperion.product.form.additional',
    afterAddToCart: 'hyperion.product.info.after_addtocart',
    infoExtra: 'hyperion.product.info.extra',
    tabs: 'hyperion.product.tabs',
    listAdditional: 'category.product.list.additional',
    tileDetails: 'details.renderers',
    tileAddTo: 'addto',
    cartBefore: 'hyperion.cart.totals.before',
    cartAfter: 'hyperion.cart.totals.after',
    loginContainer: 'customer.login.container',
    accountSidebar: 'hyperion.account.sidebar',
    dashboardTop: 'customer_account_dashboard_top',
    dashboardBlocks: 'customer.account.dashboard.info.blocks',
    dashboardExtra: 'customer.account.dashboard.info.extra',
    historyHeader: 'sales.order.history.extra.column.header',
    historyColumn: 'sales.order.history.extra.container',
    orderButtons: 'sales.order.info.buttons',
    headerStateEvent: 'hyperion_header_state_render_after',
    actionEvent: 'hyperion_htmx_action_response',
};
const SAMPLE_TOTAL_CODE = 'hyperion_sample_fee';
// Link blocks of top.links and footer_links: they print a label and a URL, no marker span.
const HEADER_LINK = 'Sample header link';
const FOOTER_LINK = 'Sample footer link';
const GATE_MESSAGE = 'Tick the sample confirmation';
const SLOT = { name: 'after-agreements', tag: 'sample-checkout-confirmation', checkbox: 'input[data-sample-confirmation]' };
const FILTER = { attribute: 'hyperion_sample_confirmation', value: 'confirmed' };
const ADDRESS_FIELD = { code: 'hyperion_sample_tax_code', value: 'ABC123XYZ', country: 'IT' };
const CHECKOUT_EVENTS = ['ready', 'shipping-method-applied', 'payment-method-selected', 'totals-updated', 'before-place-order', 'order-placed', 'error'].map((n) => `hyperion:checkout:${n}`);
// Lazy chunks a store with no extension must never request, resolved from the committed build manifests.
const EXTENSION_SOURCES = {
    runtime: ['checkout', 'src/extension/runtime.ts'],
    slotBinding: ['checkout', 'src/extension/slot-binding.ts'],
    shippingHost: ['checkout', 'src/components/shipping-extension-host.ts'],
    addressFields: ['checkout', 'src/components/address-fields.ts'],
    orderComment: ['checkout', 'src/components/extensions/order-comment.ts'],
    newsletterOptin: ['checkout', 'src/components/extensions/newsletter-optin.ts'],
};
const COMMENT = { tag: 'hc-order-comment', text: 'Please leave the parcel at the back door.' };
const NEWSLETTER = { tag: 'hc-newsletter-optin' };
const SEL = {
    config: '#checkout-config',
    marker: (name) => `[${MARKER_ATTR}="${name}"]`,
    anyMarker: `[${MARKER_ATTR}]`,
    gallery: 'hyperion-gallery, [data-hyperion-gallery]',
    title: '#hyperion-product-title',
    price: '#hyperion-product-price',
    form: '#product_addtocart_form',
    submit: '#product_addtocart_form [data-hyperion-atc], #product_addtocart_form button[type="submit"]',
    qty: '#product_addtocart_form input[name="qty"]',
    expressSlot: 'hyperion-express-slot[placement="product"]',
    tabs: 'hyperion-tabs',
    tabSkeleton: 'hyperion-tabs [data-hyperion-tabs-skeleton]',
    tile: '[data-hyperion-tile]',
    tileActions: '[data-hyperion-tile-actions]',
    tileDetails: '[data-hyperion-tile-details]',
    grid: '[data-hyperion-product-grid]',
    cartTotals: '[data-hyperion-cart-totals]',
    cartTotalsRows: '[data-hyperion-cart-totals] dl',
    checkoutLink: '[data-hyperion-cart-totals] [data-hyperion-checkout-link]',
    cartQty: '#hyperion-cart-items [data-hyperion-qty]',
    totalRow: (code) => `[data-hyperion-cart-totals] [data-total="${code}"]`,
    header: 'header[role="banner"]',
    accountMenu: 'hyperion-dropdown[placement="bottom-end"]',
    drawer: 'hyperion-dropdown[placement="drawer"]',
    headerLinks: '[data-hyperion-header-links]',
    loginForm: '#login-form',
    email: '#hc-contact-email',
    field: (mode, name) => `#hc-${mode}-${name}`,
    ratesReady: 'shipping-method-list [data-estimate-state="ready"]',
    checkedRate: 'shipping-method-row input:checked',
    payment: (code) => `#hc-pay-${code}`,
    placeOrder: '[data-hyperion-place-order] button',
    placeOrderHint: '[data-place-order-hint]',
    sameAsShipping: 'input[name="billing_same_as_shipping"]',
    slotOutlet: (name) => `hc-slot-outlet[name="${name}"]`,
    errors: '[data-error-banner], hc-section-status [data-section-status]',
};
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };
const PRODUCT = '/fusion-backpack.html';
const CATEGORY = '/gear/bags.html';
const PRODUCTS = { cart: '/push-it-messenger-bag.html', apiGuest: '/joust-duffle-bag.html', apiCustomer: '/impulse-duffle.html', error: '/crown-summit-backpack.html',
    commentGuest: '/strive-shoulder-pack.html', commentCustomer: '/wayfarer-messenger-bag.html', off: '/compete-track-tote.html' };
const MICHIGAN = { firstname: 'Extension', lastname: 'Checker', country: 'US', street: '1 Extension Street', postcode: '49628', city: 'Calder', region: 'Michigan', telephone: '5552293326' };
const MILANO = { firstname: 'Fattura', lastname: 'Verifica', country: 'IT', street: 'Via Dante 7', postcode: '20121', city: 'Milano', region: 'Milano', telephone: '0212345678' };
const BERLIN = { firstname: 'Rechnung', lastname: 'Pruefung', country: 'DE', street: 'Unter den Linden 1', postcode: '10117', city: 'Berlin', region: 'Berlin', telephone: '030123456' };
const PAYMENT_CODE = 'checkmo';
const PARTS = ['markers', 'account', 'footprint', 'checkout-api', 'checkout-error', 'consumers', 'off'];

// ---------------------------------------------------------------- run setup
const h = await createHarness({ usage: `<baseUrl> <slotDir> [--only ${PARTS.join(',')}] [--shots dir]`, parts: PARTS });
const { base, u, check, expectEqual, skip, sql, quote } = h;
requireDevModules(h.slotDir, DEV_MODULES);
const RUN = Date.now();
const orders = [];
const testEmails = [];
const email = (tag) => { const mail = `e2e.extension-points.${tag}.${RUN}@example.com`; testEmails.push(mail); return mail; };
h.onCleanup('test newsletter subscribers', () => {
    if (testEmails.length) sql(`delete from newsletter_subscriber where subscriber_email in (${testEmails.map(quote).join(', ')})`);
});

const markersOn = () => h.withConfig('sample markers and sample fee', { [CONFIG.sampleEnabled]: '1', [CONFIG.markers]: '1', [CONFIG.sampleFee]: '1' });

// ---------------------------------------------------------------- helpers
async function addToCart(page, productPath) {
    await page.goto(base + u(productPath), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`${SEL.form} button[type="submit"]`, { timeout: 30000 });
    await page.waitForFunction((form) => window.htmx !== undefined && document.querySelector(`${form} input[name="form_key"]`)?.value, SEL.form, { timeout: 30000 }).catch(() => {});
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/add/.test(r.url()), { timeout: 40000 }).catch(() => null),
        page.click(`${SEL.form} button[type="submit"]`),
    ]);
    if (response === null || response.status() >= 400) throw new Error(`add to cart failed for ${productPath} (${response?.status() ?? 'no answer'})`);
    return response;
}
async function login(page) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', CUSTOMER.email);
    await page.fill('#pass', CUSTOMER.password);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
    if (page.url().includes('/login')) throw new Error(`login failed for ${CUSTOMER.email} (is the customer_login reCAPTCHA relaxed for this run?)`);
}
async function openCheckout(j) {
    await j.page.goto(base + '/checkout/', { waitUntil: 'load' });
    await j.page.waitForSelector('checkout-app', { timeout: 40000 });
    await j.page.waitForSelector(SEL.placeOrder, { timeout: 20000 });
}
async function fillAddress(page, mode, address) {
    const id = (name) => SEL.field(mode, name);
    await page.fill(id('firstname'), address.firstname);
    await page.fill(id('lastname'), address.lastname);
    await page.selectOption(id('country_id'), address.country);
    await page.fill(id('street_0'), address.street);
    await page.fill(id('postcode'), address.postcode);
    await page.fill(id('city'), address.city);
    if (await page.locator(`select${id('region_id')}`).count()) await page.selectOption(id('region_id'), { label: address.region }).catch(() => page.selectOption(id('region_id'), { index: 1 }));
    else if (await page.locator(id('region')).count()) await page.fill(id('region'), address.region);
    await page.fill(id('telephone'), address.telephone);
    await page.locator(id('telephone')).blur();
}
const waitForRates = (page, timeout = 40000) => page.waitForFunction(([ready, checked]) => document.querySelector(ready) !== null && document.querySelector(checked) !== null,
    [SEL.ratesReady, SEL.checkedRate], { timeout }).then(() => true, () => false);
const gateOpen = (page) => page.evaluate((sel) => {
    const button = document.querySelector(sel);
    return button !== null && button.getAttribute('aria-disabled') !== 'true' && !button.disabled;
}, SEL.placeOrder);
const waitForGate = (page, open = true, timeout = 30000) => page.waitForFunction(([sel, wanted]) => {
    const button = document.querySelector(sel);
    return button !== null && (button.getAttribute('aria-disabled') !== 'true' && !button.disabled) === wanted;
}, [SEL.placeOrder, open], { timeout }).then(() => true, () => false);
const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? null, selector);
const visibleErrors = (page) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '), SEL.errors);
const hyperionConfig = (page) => page.evaluate((s) => JSON.parse(document.querySelector(s)?.textContent ?? '{}').hyperion ?? null, SEL.config);
const orderRequests = (j, mark = { bodies: 0 }) => j.bodiesSince(mark).filter((b) => /\/payment-information(\?|$)/.test(b.url) && b.body?.paymentMethod);
const lastOrder = (mail) => {
    const row = sql(`select entity_id, increment_id from sales_order where customer_email = ${quote(mail)} order by entity_id desc limit 1`);
    if (row === '') return null;
    const [id, increment] = row.split('\t');
    return { id: Number(id), increment };
};
async function placeOrder(j, mail, label) {
    const before = lastOrder(mail)?.id ?? 0;
    const mark = j.mark();
    await j.page.locator(SEL.placeOrder).click();
    await j.page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 60000 }).catch(() => {});
    const order = lastOrder(mail);
    const placed = order !== null && order.id > before && j.page.url().includes('/checkout/onepage/success');
    check(`${label}: order placed`, placed, placed ? order.increment : `${j.page.url().replace(base, '')} ${await visibleErrors(j.page)}`);
    if (placed) orders.push(`${order.increment} (${label}, ${mail})`);
    else await h.shot(j.page, `order-failed-${label}`);
    return { order: placed ? order : null, requests: orderRequests(j, mark) };
}

/**
 * Where each marker sits in the document against stable neighbors: for every marker its count, and for every pair
 * [a, b] whether a comes before b in document order; `inside` pairs say whether the marker is inside the element.
 */
const layoutFacts = (page, { order = [], inside = [], outside = [] }) => page.evaluate(([attr, orderPairs, insidePairs, outsidePairs]) => {
    const pick = (sel) => (sel.startsWith('marker:') ? document.querySelector(`[${attr}="${sel.slice(7)}"]`) : document.querySelector(sel));
    const before = (a, b) => (a && b ? (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null);
    return {
        markers: Object.fromEntries([...document.querySelectorAll(`[${attr}]`)].map((m) => m.getAttribute(attr)).reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map())),
        order: orderPairs.map(([a, b]) => ({ a, b, ok: before(pick(a), pick(b)), found: [pick(a) !== null, pick(b) !== null] })),
        inside: insidePairs.map(([m, container]) => ({ m, container, ok: pick(container)?.contains(pick(m)) ?? null })),
        outside: outsidePairs.map(([m, container]) => ({ m, container, ok: pick(m) !== null && pick(container) !== null ? !pick(container).contains(pick(m)) : null })),
    };
}, [MARKER_ATTR, order, inside, outside]);
function checkFacts(label, facts, expectedMarkers) {
    for (const name of expectedMarkers) check(`${label}: the marker of ${name} renders once`, facts.markers[name] === 1, `found ${facts.markers[name] ?? 0}`);
    for (const f of facts.order) check(`${label}: ${f.a.replace('marker:', '')} comes before ${f.b.replace('marker:', '')}`, f.ok === true, f.ok === true ? '' : f.ok === null ? `missing: ${f.found[0] ? '' : f.a} ${f.found[1] ? '' : f.b}` : 'the order is reversed');
    for (const f of facts.inside) check(`${label}: ${f.m.replace('marker:', '')} is inside ${f.container}`, f.ok === true, f.ok === true ? '' : f.ok === null ? 'one of the two is missing' : 'outside');
    for (const f of facts.outside) check(`${label}: ${f.m.replace('marker:', '')} is not inside ${f.container}`, f.ok === true, f.ok === true ? '' : f.ok === null ? 'one of the two is missing' : 'inside');
}
const m = (name) => `marker:${name}`;

// ---------------------------------------------------------------- scenarios
const scenarios = {};

scenarios.markers = async () => {
    markersOn();
    for (const phone of [false, true]) {
        const view = phone ? 'phone' : 'desktop';
        const j = await h.newJourney({ phone });
        const { page } = j;
        try {
            // Product page containers against the gallery, the title, the price box and the add to cart form.
            await page.goto(base + u(PRODUCT), { waitUntil: 'load' });
            const product = await layoutFacts(page, {
                order: [
                    [SEL.gallery, m(MARKER.mediaAfter)],
                    [SEL.title, m(MARKER.infoTop)], [m(MARKER.infoTop), SEL.price],
                    [SEL.price, m(MARKER.afterPrice)], [m(MARKER.afterPrice), m(MARKER.beforeAddToCart)], [m(MARKER.beforeAddToCart), SEL.form],
                    [m(MARKER.formAdditional), SEL.submit],
                    [SEL.form, m(MARKER.afterAddToCart)], [m(MARKER.afterAddToCart), m(MARKER.infoExtra)],
                ],
                inside: [[m(MARKER.formAdditional), SEL.form], [m(MARKER.tabs), SEL.tabs]],
                outside: [[m(MARKER.mediaAfter), SEL.form], [m(MARKER.afterAddToCart), SEL.form], [m(MARKER.infoExtra), SEL.form], [m(MARKER.infoTop), SEL.form]],
            });
            checkFacts(`product (${view})`, product, [MARKER.mediaAfter, MARKER.infoTop, MARKER.afterPrice, MARKER.beforeAddToCart, MARKER.formAdditional, MARKER.afterAddToCart, MARKER.infoExtra, MARKER.tabs]);
            const media = await page.evaluate(([attr, gallery, form, title]) => {
                const marker = document.querySelector(`[${attr}="hyperion.product.media.after"]`);
                const g = document.querySelector(gallery);
                if (!marker || !g) return null;
                // The smallest ancestor holding both must not hold the title or the add to cart form: the media column.
                let column = marker.parentElement;
                while (column && !column.contains(g)) column = column.parentElement;
                return { sameColumn: column !== null && !column.contains(document.querySelector(form)) && !column.contains(document.querySelector(title)) };
            }, [MARKER_ATTR, SEL.gallery, SEL.form, SEL.title]);
            check(`product (${view}): the media marker sits in the gallery's column`, media?.sameColumn === true, JSON.stringify(media));
            if (await page.locator(SEL.expressSlot).count()) {
                const express = await layoutFacts(page, { order: [[SEL.expressSlot, m(MARKER.afterAddToCart)]] });
                checkFacts(`product (${view}) with an express slot`, express, []);
            }

            // The extra tab: in the server rendered strip and in the upgraded component.
            const tab = await page.evaluate(([attr, name]) => {
                const marker = document.querySelector(`[${attr}="${name}"]`);
                const host = marker?.closest('hyperion-tab');
                const tabs = document.querySelector('hyperion-tabs');
                const skeleton = [...(tabs?.querySelectorAll('[data-hyperion-tabs-skeleton] span') ?? [])].map((s) => s.textContent.trim());
                const upgraded = [...(tabs?.shadowRoot?.querySelectorAll('[role="tab"]') ?? [])].map((b) => b.textContent.trim());
                return { label: host?.getAttribute('label') ?? null, skeleton, upgraded, panels: tabs?.querySelectorAll('hyperion-tab').length ?? 0 };
            }, [MARKER_ATTR, MARKER.tabs]);
            check(`product (${view}): the extra tab is in the server rendered tab strip`, tab.label !== null && tab.skeleton.includes(tab.label) && tab.skeleton.length === tab.panels, JSON.stringify(tab));
            check(`product (${view}): the extra tab is a tab of the upgraded component`, tab.label !== null && tab.upgraded.includes(tab.label) && tab.upgraded.length === tab.skeleton.length, JSON.stringify(tab));

            // Category tile hooks.
            await page.goto(base + u(CATEGORY), { waitUntil: 'load' });
            const tiles = await page.evaluate(([attr, names, sel]) => {
                const all = [...document.querySelectorAll(sel.tile)];
                return {
                    tiles: all.length,
                    additionalBeforeTiles: (() => { const a = document.querySelector(`[${attr}="${names.listAdditional}"]`); const first = document.querySelector(sel.tile); return a && first ? (a.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && !first.contains(a) : null; })(),
                    details: all.filter((t) => t.querySelector(`${sel.tileDetails} [${attr}="${names.tileDetails}"]`)).length,
                    addto: all.filter((t) => t.querySelector(`${sel.tileActions} [${attr}="${names.tileAddTo}"]`)).length,
                };
            }, [MARKER_ATTR, { listAdditional: MARKER.listAdditional, tileDetails: MARKER.tileDetails, tileAddTo: MARKER.tileAddTo }, { tile: SEL.tile, grid: SEL.grid, tileDetails: SEL.tileDetails, tileActions: SEL.tileActions }]);
            check(`category (${view}): the list "additional" marker comes before the first tile`, tiles.additionalBeforeTiles === true, JSON.stringify(tiles));
            check(`category (${view}): every tile carries the details marker in its details wrapper`, tiles.tiles > 0 && tiles.details === tiles.tiles, JSON.stringify(tiles));
            check(`category (${view}): every tile carries the "addto" marker in its actions`, tiles.tiles > 0 && tiles.addto === tiles.tiles, JSON.stringify(tiles));

            // Cart containers and the sample total row, then an htmx quantity update.
            const added = await addToCart(page, PRODUCTS.cart);
            const actionBody = await added.text().catch(() => '');
            const actionMarkers = actionBody.split(`${MARKER_ATTR}="${MARKER.actionEvent}"`).length - 1;
            check(`(${view}) the add to cart response carries the marker fragment of ${MARKER.actionEvent} once`, actionMarkers === 1, `${actionMarkers} occurrences in ${actionBody.length} bytes`);
            const [, headerState] = await Promise.all([
                page.goto(base + '/checkout/cart/', { waitUntil: 'load' }),
                page.waitForResponse((r) => /\/hyperion\/header\/state/.test(r.url()), { timeout: 30000 }).catch(() => null),
            ]);
            const stateBody = headerState ? await headerState.text().catch(() => '') : '';
            const stateMarkers = stateBody.split(`${MARKER_ATTR}="${MARKER.headerStateEvent}"`).length - 1;
            check(`(${view}) the header state response carries the marker fragment of ${MARKER.headerStateEvent} once`, stateMarkers === 1, headerState ? `${stateMarkers} occurrences` : 'no header state request');
            const cartFacts = async (label) => {
                const facts = await layoutFacts(page, {
                    order: [[m(MARKER.cartBefore), SEL.cartTotalsRows], [SEL.cartTotalsRows, m(MARKER.cartAfter)], [m(MARKER.cartAfter), SEL.checkoutLink]],
                    inside: [[m(MARKER.cartBefore), SEL.cartTotals], [m(MARKER.cartAfter), SEL.cartTotals]],
                });
                checkFacts(label, facts, [MARKER.cartBefore, MARKER.cartAfter]);
                check(`${label}: the sample total row is in the cart totals`, await page.locator(SEL.totalRow(SAMPLE_TOTAL_CODE)).count() === 1, await text(page, SEL.cartTotalsRows));
            };
            await cartFacts(`cart (${view})`);
            const qty = page.locator(SEL.cartQty).first();
            const [update] = await Promise.all([
                page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/(updatePost|updateItemQty)/.test(r.url()), { timeout: 30000 }).catch(() => null),
                (async () => { await qty.fill('2'); await qty.dispatchEvent('change'); })(),
            ]);
            await j.settled(1200);
            check(`cart (${view}): the quantity update went through htmx`, update !== null && update.status() < 400, update ? String(update.status()) : 'no update request');
            await cartFacts(`cart (${view}) after the htmx update`);

            // Header and footer links.
            const header = await page.evaluate(([label, menu, drawer, list]) => {
                const links = (root) => [...(document.querySelector(root)?.querySelectorAll(`${list} a`) ?? [])].filter((a) => a.textContent.trim() === label).length;
                return { menu: links(menu), drawer: links(drawer) };
            }, [HEADER_LINK, SEL.accountMenu, SEL.drawer, SEL.headerLinks]);
            check(`header (${view}): "${HEADER_LINK}" is listed once in the account menu and once in the drawer`, header.menu === 1 && header.drawer === 1, JSON.stringify(header));
            const footer = await page.evaluate((label) => [...document.querySelectorAll('footer a')].filter((a) => a.textContent.trim() === label).length, FOOTER_LINK);
            check(`footer (${view}): "${FOOTER_LINK}" is listed`, footer === 1, `${footer} links`);

            // The login container follows the login form.
            await j.ctx.clearCookies();
            await page.goto(base + '/customer/account/login/', { waitUntil: 'load' });
            const loginFacts = await layoutFacts(page, { order: [[SEL.loginForm, m(MARKER.loginContainer)]], outside: [[m(MARKER.loginContainer), SEL.loginForm]] });
            checkFacts(`login (${view})`, loginFacts, [MARKER.loginContainer]);
            h.noProblems(j, view);
        } finally { await j.close(); }
    }
};

scenarios.account = async () => {
    markersOn();
    for (const phone of [false, true]) {
        const view = phone ? 'phone' : 'desktop';
        const j = await h.newJourney({ phone });
        const { page } = j;
        try {
            await login(page);
            await page.goto(base + '/customer/account/', { waitUntil: 'load' });
            const dashboard = await layoutFacts(page, {});
            checkFacts(`account dashboard (${view})`, dashboard, [MARKER.accountSidebar, MARKER.dashboardTop, MARKER.dashboardBlocks, MARKER.dashboardExtra]);
            await page.goto(base + '/sales/order/history/', { waitUntil: 'load' });
            const rows = Number(sql(`select count(*) from sales_order o join customer_entity c on c.entity_id = o.customer_id where c.email = ${quote(CUSTOMER.email)}`));
            const history = await page.evaluate(([attr, name]) => document.querySelectorAll(`[${attr}="${name}"]`).length, [MARKER_ATTR, MARKER.historyColumn]);
            const historyHeader = await page.evaluate(([attr, name]) => document.querySelectorAll(`[${attr}="${name}"]`).length, [MARKER_ATTR, MARKER.historyHeader]);
            if (rows > 0) check(`order history (${view}): the extra column has its header`, historyHeader >= 1, `${historyHeader} header markers`);
            if (rows === 0) skip(`order history (${view})`, `${CUSTOMER.email} has no order`);
            else check(`order history (${view}): every listed order carries the extra column marker`, history > 0 && history <= rows, `${history} markers for ${rows} orders (the page lists at most one page of them)`);
            const orderId = sql(`select o.entity_id from sales_order o join customer_entity c on c.entity_id = o.customer_id where c.email = ${quote(CUSTOMER.email)} order by o.entity_id desc limit 1`);
            if (orderId !== '') {
                await page.goto(`${base}/sales/order/view/order_id/${orderId}/`, { waitUntil: 'load' });
                const view2 = await layoutFacts(page, {});
                checkFacts(`order view (${view})`, view2, [MARKER.orderButtons]);
            }
            h.noProblems(j, view);
        } finally { await j.close(); }
    }
};

scenarios.footprint = async () => {
    const measure = async (phone) => {
        const j = await h.newJourney({ phone });
        try {
            await j.page.goto(base + u(PRODUCT), { waitUntil: 'load' });
            await j.page.waitForResponse((r) => /\/hyperion\/header\/state/.test(r.url()), { timeout: 20000 }).catch(() => null);
            await sleep(1500);
            return await j.page.evaluate((sel) => {
                const header = document.querySelector(sel)?.getBoundingClientRect();
                return header ? { width: Math.round(header.width), height: Math.round(header.height), page: Math.round(document.documentElement.getBoundingClientRect().width) } : null;
            }, SEL.header);
        } finally { await j.close(); }
    };
    const restoreOff = h.withConfig('sample markers off', { [CONFIG.sampleEnabled]: '1', [CONFIG.markers]: '0' });
    const off = { desktop: await measure(false), phone: await measure(true) };
    restoreOff();
    markersOn();
    const on = { desktop: await measure(false), phone: await measure(true) };
    for (const view of ['desktop', 'phone']) {
        check(`header (${view}): measured`, off[view] !== null && on[view] !== null, JSON.stringify({ off: off[view], on: on[view] }));
        expectEqual(`header (${view}): the same footprint with the header links empty and filled`, on[view], off[view]);
    }
};

/** The checkout events recorded through a binding, so they survive the navigation to the success page. */
async function recordCheckoutEvents(j) {
    const seen = [];
    await j.ctx.exposeBinding('__e2eCheckoutEvent', (_source, event) => seen.push(event));
    await j.ctx.addInitScript((names) => {
        for (const name of names) {
            document.addEventListener(name, (e) => window.__e2eCheckoutEvent?.({ name, detail: JSON.stringify(e.detail ?? null), bubbles: e.bubbles, composed: e.composed, cancelable: e.cancelable, target: e.target?.localName ?? '' }), true);
        }
    }, CHECKOUT_EVENTS);
    return seen;
}
function checkEvents(label, seen, personal) {
    const names = seen.map((e) => e.name);
    const firstIndex = (name) => names.indexOf(`hyperion:checkout:${name}`);
    const lastIndex = (name) => names.lastIndexOf(`hyperion:checkout:${name}`);
    for (const name of CHECKOUT_EVENTS.filter((n) => !n.endsWith(':error'))) {
        check(`${label}: ${name} is dispatched on <checkout-app>, bubbling and composed`, seen.some((e) => e.name === name && e.target === 'checkout-app' && e.bubbles && e.composed), JSON.stringify(seen.filter((e) => e.name === name).slice(0, 1)));
    }
    check(`${label}: the events arrive in order (ready first, shipping and payment before before-place-order, order-placed last)`,
        firstIndex('ready') === 0 && firstIndex('shipping-method-applied') > 0 && firstIndex('payment-method-selected') > 0 && firstIndex('totals-updated') > 0
        && firstIndex('before-place-order') > Math.max(firstIndex('shipping-method-applied'), firstIndex('payment-method-selected'))
        && lastIndex('order-placed') === names.length - 1 && lastIndex('order-placed') > lastIndex('before-place-order'),
        names.map((n) => n.replace('hyperion:checkout:', '')).join(' > '));
    check(`${label}: before-place-order is cancelable`, seen.some((e) => e.name.endsWith(':before-place-order') && e.cancelable));
    const leaks = seen.filter((e) => personal.some((value) => value && e.detail.toLowerCase().includes(String(value).toLowerCase())));
    check(`${label}: no event detail holds the email, a name, a street, a postcode or a telephone`, leaks.length === 0, JSON.stringify(leaks.slice(0, 2)));
}

scenarios['checkout-api'] = async () => {
    h.withConfig('sample extension', { [CONFIG.sampleEnabled]: '1', [CONFIG.markers]: '0' });
    for (const who of ['guest', 'customer']) {
        const j = await h.newJourney();
        const { page } = j;
        const seen = await recordCheckoutEvents(j);
        try {
            let mail = CUSTOMER.email;
            if (who === 'customer') await login(page);
            await addToCart(page, who === 'guest' ? PRODUCTS.apiGuest : PRODUCTS.apiCustomer);
            await openCheckout(j);
            const config = await hyperionConfig(page);
            const entry = (config?.extensions ?? []).find((e) => (e.moduleUrl ?? '').includes(`/${MODULE_PATH}/`));
            const slotTag = entry?.slots?.find((s) => s.slot === SLOT.name)?.tag ?? null;
            check(`${who}: the checkout config carries the sample extension (required, ${SLOT.tag} after the agreements)`, entry?.required === true && slotTag === SLOT.tag, JSON.stringify(entry ?? config?.extensions ?? null).slice(0, 300));
            const field = (config?.addressFields ?? []).find((f) => f.code === ADDRESS_FIELD.code);
            check(`${who}: the checkout config declares the address field ${ADDRESS_FIELD.code} (billing, ${ADDRESS_FIELD.country}, extension attribute)`,
                field?.target === 'extension_attributes' && field?.forms?.includes('billing') && field?.countries?.includes(ADDRESS_FIELD.country), JSON.stringify(field ?? null));
            if (who === 'guest') {
                mail = email('api');
                await page.fill(SEL.email, mail);
                await page.locator(SEL.email).blur();
                await fillAddress(page, 'shipping', MICHIGAN);
            }
            check(`${who}: rates listed`, await waitForRates(page));
            await page.check(SEL.payment(PAYMENT_CODE));
            await j.settled(1500);

            // The gate of the sample module and its slot element.
            const slotElement = page.locator(`${SEL.slotOutlet(SLOT.name)} ${SLOT.tag}`);
            await slotElement.first().waitFor({ timeout: 20000 }).catch(() => {});
            check(`${who}: the confirmation element renders in the ${SLOT.name} outlet`, await slotElement.count() === 1, `${await page.locator(SLOT.tag).count()} ${SLOT.tag} on the page`);
            check(`${who}: the sample gate keeps Place Order closed`, !(await gateOpen(page)));
            await page.locator(SEL.placeOrder).click({ force: true }).catch(() => {});
            await page.waitForTimeout(600);
            const hint = await text(page, SEL.placeOrderHint);
            check(`${who}: the hint gives the gate's message`, String(hint).includes(GATE_MESSAGE), `hint: ${hint}`);
            await slotElement.locator(SLOT.checkbox).first().check().catch(() => {});
            await j.settled(800);

            if (who === 'guest') {
                // The declared address field: shown for an Italian billing address only, required, in the request.
                await page.uncheck(SEL.sameAsShipping);
                await page.waitForSelector(SEL.field('billing', 'firstname'), { timeout: 15000 });
                await fillAddress(page, 'billing', BERLIN);
                await j.settled(1000);
                check(`guest: ${ADDRESS_FIELD.code} is absent for a German billing address`, await page.locator(SEL.field('billing', ADDRESS_FIELD.code)).count() === 0);
                check('guest: the shipping form never shows the billing-only field', await page.locator(SEL.field('shipping', ADDRESS_FIELD.code)).count() === 0);
                await fillAddress(page, 'billing', MILANO);
                await page.waitForSelector(SEL.field('billing', ADDRESS_FIELD.code), { timeout: 10000 }).catch(() => {});
                const shown = await page.locator(SEL.field('billing', ADDRESS_FIELD.code)).count() === 1;
                check(`guest: ${ADDRESS_FIELD.code} shows for an Italian billing address`, shown);
                await j.settled(1000);
                if (shown) {
                    check(`guest: the empty ${ADDRESS_FIELD.code} keeps Place Order closed`, !(await gateOpen(page)), await text(page, SEL.placeOrderHint));
                    await page.fill(SEL.field('billing', ADDRESS_FIELD.code), ADDRESS_FIELD.value);
                    await page.locator(SEL.field('billing', ADDRESS_FIELD.code)).blur();
                    await j.settled(1200);
                }
            }
            check(`${who}: Place Order opens once the gate is satisfied`, await waitForGate(page), `${await text(page, SEL.placeOrderHint)} ${await visibleErrors(page)}`);
            const result = await placeOrder(j, mail, `${who} generic api`);
            const body = result.requests.at(-1)?.body;
            expectEqual(`${who}: the payment-information request carries the filter's attribute paymentMethod.extension_attributes.${FILTER.attribute}`,
                body?.paymentMethod?.extension_attributes?.[FILTER.attribute] ?? null, FILTER.value);
            check(`${who}: the filter left agreement_ids alone`, body?.paymentMethod?.extension_attributes === undefined || !('agreement_ids' in (body.paymentMethod.extension_attributes ?? {})) || Array.isArray(body.paymentMethod.extension_attributes.agreement_ids));
            if (who === 'guest') {
                expectEqual(`guest: the order request carries billingAddress.extension_attributes.${ADDRESS_FIELD.code}`, body?.billingAddress?.extension_attributes?.[ADDRESS_FIELD.code] ?? null, ADDRESS_FIELD.value);
            }
            const personal = who === 'guest'
                ? [mail, MICHIGAN.lastname, MICHIGAN.street, MICHIGAN.postcode, MICHIGAN.telephone, MILANO.street, MILANO.lastname, ADDRESS_FIELD.value]
                : [CUSTOMER.email, 'Costello', '6146 Honey Bluff Parkway', '49628'];
            checkEvents(who, seen, personal);
            h.noProblems(j, who);
        } finally { await j.close(); }
    }
};

scenarios['checkout-error'] = async () => {
    const j = await h.newJourney();
    const { page } = j;
    const seen = await recordCheckoutEvents(j);
    try {
        await addToCart(page, PRODUCTS.error);
        await openCheckout(j);
        const mail = email('error');
        await page.fill(SEL.email, mail);
        await page.locator(SEL.email).blur();
        let refused = 0;
        const estimate = (url) => /estimate-shipping-methods/.test(url.toString());
        await page.route(estimate, (route) => { refused++; j.injected.add(route.request().url()); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Service Unavailable"}' }); });
        await fillAddress(page, 'shipping', MICHIGAN);
        await j.settled(1500, 20000);
        await page.unroute(estimate);
        const errors = seen.filter((e) => e.name === 'hyperion:checkout:error');
        check('a refused rate request dispatches hyperion:checkout:error', refused > 0 && errors.length > 0, `${refused} refused, events: ${seen.map((e) => e.name).join(', ')}`);
        let detail = null;
        try { detail = JSON.parse(errors[0]?.detail ?? 'null'); } catch { /* checked below */ }
        check('the error detail is { kind, section } only', detail !== null && Object.keys(detail).sort().join(',') === 'kind,section' && typeof detail.kind === 'string' && typeof detail.section === 'string', JSON.stringify(detail));
        const personal = [mail, MICHIGAN.lastname, MICHIGAN.street, MICHIGAN.postcode, MICHIGAN.telephone];
        check('the error detail holds no personal data', errors.every((e) => !personal.some((value) => e.detail.includes(value))), JSON.stringify(errors.slice(0, 2)));
        h.noProblems(j, 'error');
    } finally { await j.close(); }
};

scenarios.consumers = async () => {
    h.withConfig('order comment and newsletter opt-in', {
        [CONFIG.sampleEnabled]: '0', [CONFIG.orderComment]: '1', [CONFIG.newsletter]: '1', [CONFIG.newsletterChecked]: '0', [CONFIG.guestSubscribe]: '1', [CONFIG.subscriptionConfirm]: '0',
    });
    const customerId = Number(sql(`select entity_id from customer_entity where email = ${quote(CUSTOMER.email)}`));
    const stored = sql(`select subscriber_id, subscriber_status from newsletter_subscriber where customer_id = ${customerId} order by subscriber_id limit 1`);
    const [subscriberId, previousStatus] = stored === '' ? [null, null] : stored.split('\t');
    h.onCleanup(`newsletter subscription of ${CUSTOMER.email} (${stored === '' ? 'none' : 'status ' + previousStatus})`, () => {
        if (subscriberId === null) sql(`delete from newsletter_subscriber where customer_id = ${customerId}`);
        else sql(`update newsletter_subscriber set subscriber_status = ${Number(previousStatus)} where subscriber_id = ${Number(subscriberId)}`);
    });
    const subscribedBefore = previousStatus === '1';
    for (const who of ['guest', 'customer']) {
        const j = await h.newJourney();
        const { page } = j;
        try {
            let mail = CUSTOMER.email;
            if (who === 'customer') await login(page);
            await addToCart(page, who === 'guest' ? PRODUCTS.commentGuest : PRODUCTS.commentCustomer);
            await openCheckout(j);
            if (who === 'guest') {
                mail = email('consumers');
                await page.fill(SEL.email, mail);
                await page.locator(SEL.email).blur();
                await fillAddress(page, 'shipping', MICHIGAN);
            }
            check(`${who}: rates listed`, await waitForRates(page));
            await page.check(SEL.payment(PAYMENT_CODE));
            await j.settled(1500);
            const comment = page.locator(`${SEL.slotOutlet('before-place-order')} ${COMMENT.tag} textarea`).first();
            await comment.waitFor({ timeout: 20000 }).catch(() => {});
            check(`${who}: the order comment field renders before Place Order`, await comment.count() === 1);
            await comment.fill(`${COMMENT.text} ${who} ${RUN}`).catch(() => {});
            const optin = page.locator(`${SEL.slotOutlet('after-email')} ${NEWSLETTER.tag} input[type="checkbox"]`).first();
            const offered = await optin.count() === 1;
            if (who === 'customer' && subscribedBefore) {
                check('customer: an already subscribed customer is not offered the opt-in', !offered);
            } else {
                check(`${who}: the newsletter opt-in renders after the email, unticked`, offered && !(await optin.isChecked()));
                await optin.check().catch(() => {});
            }
            await j.settled(800);
            check(`${who}: Place Order usable`, await waitForGate(page), await text(page, SEL.placeOrderHint));
            const result = await placeOrder(j, mail, `${who} comment and newsletter`);
            const attributes = result.requests.at(-1)?.body?.paymentMethod?.extension_attributes ?? null;
            expectEqual(`${who}: the order request carries the comment`, attributes?.hyperion_order_comment ?? null, `${COMMENT.text} ${who} ${RUN}`);
            if (!(who === 'customer' && subscribedBefore)) expectEqual(`${who}: the order request carries the opt-in`, attributes?.hyperion_newsletter_subscribe ?? null, true);
            if (result.order) {
                const history = sql(`select ifnull(comment, '') from sales_order_status_history where parent_id = ${result.order.id} and is_visible_on_front = 1 and comment like ${quote('%' + COMMENT.text + '%')}`);
                check(`${who}: the comment is a visible status history entry of the order`, history.includes(`${COMMENT.text} ${who} ${RUN}`), history || 'none');
                if (who === 'customer') {
                    await page.goto(`${base}/sales/order/view/order_id/${result.order.id}/`, { waitUntil: 'load' });
                    check('customer: the comment is on the storefront order view', (await page.innerText('main').catch(() => '')).includes(`${COMMENT.text} ${who} ${RUN}`));
                }
                const subscriber = who === 'guest'
                    ? sql(`select subscriber_status from newsletter_subscriber where subscriber_email = ${quote(mail)}`)
                    : sql(`select subscriber_status from newsletter_subscriber where customer_id = ${customerId}`);
                if (!(who === 'customer' && subscribedBefore)) expectEqual(`${who}: the subscriber exists and is subscribed`, subscriber, '1');
            }
            h.noProblems(j, who);
        } finally { await j.close(); }
    }
};

scenarios.off = async () => {
    h.withConfig('everything off', { [CONFIG.sampleEnabled]: '0', [CONFIG.markers]: '0', [CONFIG.orderComment]: '0', [CONFIG.newsletter]: '0' });
    const j = await h.newJourney();
    const { page } = j;
    try {
        for (const target of [u(PRODUCT), u(CATEGORY), '/customer/account/login/']) {
            await page.goto(base + target, { waitUntil: 'load' });
            expectEqual(`${target}: no marker`, await page.locator(SEL.anyMarker).count(), 0);
        }
        const links = await page.evaluate((labels) => [...document.querySelectorAll('a')].filter((a) => labels.includes(a.textContent.trim())).length, [HEADER_LINK, FOOTER_LINK]);
        expectEqual('no sample header or footer link', links, 0);
        await addToCart(page, PRODUCTS.off);
        await page.goto(base + '/checkout/cart/', { waitUntil: 'load' });
        expectEqual('cart: no marker and no sample total row', [await page.locator(SEL.anyMarker).count(), await page.locator(SEL.totalRow(SAMPLE_TOTAL_CODE)).count()], [0, 0]);
        const mark = j.mark();
        await openCheckout(j);
        const config = await hyperionConfig(page);
        expectEqual('checkout: the config lists no extension, no address field', [config?.extensions?.length ?? 0, config?.addressFields?.length ?? 0], [0, 0]);
        await page.fill(SEL.email, email('off'));
        await page.locator(SEL.email).blur();
        await fillAddress(page, 'shipping', MICHIGAN);
        await waitForRates(page);
        await j.settled(2500);
        const requested = j.requestsSince(mark).map((r) => r.url);
        const forbidden = builtChunkPatterns(EXTENSION_SOURCES);
        check('checkout: the build manifest names every extension chunk', Object.values(forbidden).every(Boolean), Object.entries(forbidden).map(([k, v]) => `${k} ${v}`).join(', '));
        const patterns = Object.values(forbidden).filter(Boolean);
        const chunks = requested.filter((url) => patterns.some((re) => re.test(url))).map((url) => url.replace(base, ''));
        check('checkout: no extension chunk is requested', chunks.length === 0, chunks.join(', '));
        const sample = requested.filter((url) => url.includes(`/${MODULE_PATH}/`)).map((url) => url.replace(base, ''));
        check('checkout: no request for any sample module', sample.length === 0, sample.join(', '));
        check('checkout: no slot outlet is visible', await page.evaluate(() => [...document.querySelectorAll('hc-slot-outlet')].every((o) => o.hidden || o.getClientRects().length === 0)));
        h.noProblems(j, 'off');
    } finally { await j.close(); }
};

await h.runScenarios(scenarios, () => ({ orders }));

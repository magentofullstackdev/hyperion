#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the payment renderer contract and of the express slots with the sample payment module
// (dev/modules/Magentofullstackdev/HyperionSamplePsp).
// Usage: node e2e/pw-payment-api.mjs <baseUrl> <slotDir> [--only card,currency,...] [--shots dir]
//   node e2e/pw-payment-api.mjs https://shop.example <slotDir>
// <slotDir> is the Magento install directory (docker compose project with the services php-fpm and db).
//
//   card         guest, sample card: the row is listed, its module is requested only once the method is offered,
//                a skeleton holds the row until the element reports ready, the hosted field is an iframe, the
//                order is placed and the nonce the server accepted names the base grand total and currency
//   currency     the same with a display currency different from the base currency (the server refuses a nonce
//                that does not match the base amount, so an accepted order proves the snapshot's base totals)
//   threeds      a card that asks for the fake 3-D Secure challenge: Approve places the order; Decline shows a
//                message, Place Order is usable again and no order exists
//   vault        customer: the card is saved with the order, the next checkout lists it as a stored card row and
//                a second order is paid with it; the saved token is removed at the end
//   redirect     guest, hosted page method: the order is placed, the browser lands on the fake hosted page, Pay
//                ends on the success page; Cancel returns to the cart with a message and the quote restored
//   form         guest, declarative form method: the required field blocks Place Order and gets the focus, the
//                value reaches the order payment
//   express      the express button on the product page and the cart, with its reserved height; its module is
//                not requested before the shopper engages; the product placement adds the product and completes
//                (guest), the cart placement completes (customer); with catalog mode blocking the group no slot
//   cls          layout shift of the product and cart pages with the express button active: 0
//   unsupported  an active method with no renderer entry: absent for the shopper, a diagnostic row with
//                ?hyperion_debug_payments=1, listed by bin/magento hyperion:checkout:payments, named by the admin
//                system message
//   italian      the Italian store view shows the sample phrases translated
//   inactive     with the sample methods off: no request for any sample module and no extension chunk
//
// Needs the sample modules (node e2e/install-dev-modules.mjs <slotDir>); the script never installs them. Settings
// it changes are put back as they were found; orders stay on the install, as for the other scripts; the saved
// card token and the temporary admin user are removed. Prints numbered PASS / FAIL lines and a JSON summary, exit
// code 1 on any failure, page error, HTTP 5xx or Content Security Policy violation.
// The customer parts log in: clear the customer_login reCAPTCHA type for the run beforehand (see
// docs/development.md), as for pw-suite.mjs.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtChunkPatterns, createHarness, deepActiveElementDescription, sleep } from './lib/harness.mjs';
import { requireDevModules } from './lib/dev-modules.mjs';

// ---------------------------------------------------------------- names of the contract and of the sample module
const DEV_MODULES = ['Magentofullstackdev_HyperionSamplePsp'];
const MODULE_PATH = 'Magentofullstackdev_HyperionSamplePsp';
const METHOD = {
    card: 'hyperion_sample_card',
    vault: 'hyperion_sample_card_vault',
    redirect: 'hyperion_sample_redirect',
    form: 'hyperion_sample_form',
};
const CONFIG = {
    sampleEnabled: 'hyperion_sample/general/enabled',
    cardActive: `payment/${METHOD.card}/active`,
    vaultActive: `payment/${METHOD.vault}/active`,
    redirectActive: `payment/${METHOD.redirect}/active`,
    formActive: `payment/${METHOD.form}/active`,
    // The express provider reads these; a path the module does not know is harmless (restored as found).
    expressEnabled: 'hyperion_sample/express/enabled',
    catalogMode: 'hyperion_catalog_mode/general/enabled',
    catalogModeGroups: 'hyperion_catalog_mode/general/allowed_customer_groups',
};
const TAG = { card: 'sample-psp-card', express: 'sample-psp-express' };
const EXPRESS_ENTRY_ID = 'hyperion_sample_express';
const ROUTES = {
    hostedField: '/hyperionsample/hosted/field',
    challenge: '/hyperionsample/threeds/challenge',
    redirectStart: '/hyperionsample/redirect/start',
    expressStart: '/hyperionsample/express/start',
    hostedPage: /\/hyperionsample\/(redirect|express)\//,
};
// sample-<base grand total, two decimals>-<base currency>
const NONCE = (amount, currency) => `sample-${Number(amount).toFixed(2)}-${currency}`;
const CARD = { plain: '4111111111111111', challenge: '4000000000000003', expiry: '12/30', cvc: '123' };
const FORM_FIELD = { name: 'reference', value: 'AB-1234' };
const BUTTONS = { approve: /approve/i, decline: /decline/i };
const MESSAGES = {
    declined: 'The card verification was declined.',
    redirectCanceled: 'The sample payment was canceled. Your cart was restored.',
};
const DEBUG_PARAM = 'hyperion_debug_payments=1';
const CLI = 'hyperion:checkout:payments';
const ADMIN_MESSAGE = /have no checkout renderer/i;
const PAYMENT_EVENTS = ['hyperion-payment:ready', 'hyperion-payment:valid', 'hyperion-payment:invalid', 'hyperion-payment:busy', 'hyperion-payment:error', 'hyperion-payment:request-place-order'];
const EXPRESS_EVENTS = ['hyperion-express:ready', 'hyperion-express:unavailable', 'hyperion-express:error'];
// Lazy chunks a store with no extension must never request, resolved from the committed build manifests.
const EXTENSION_SOURCES = {
    runtime: ['checkout', 'src/extension/runtime.ts'],
    slotBinding: ['checkout', 'src/extension/slot-binding.ts'],
    shippingHost: ['checkout', 'src/components/shipping-extension-host.ts'],
    addressFields: ['checkout', 'src/components/address-fields.ts'],
    orderComment: ['checkout', 'src/components/extensions/order-comment.ts'],
    newsletterOptin: ['checkout', 'src/components/extensions/newsletter-optin.ts'],
};
const EXPRESS_SOURCES = {
    expressSlot: ['theme', 'src/js/components/hyperion-express-slot.js'],
};
const SEL = {
    config: '#checkout-config',
    email: '#hc-contact-email',
    field: (mode, name) => `#hc-${mode}-${name}`,
    ratesReady: 'shipping-method-list [data-estimate-state="ready"]',
    checkedRate: 'shipping-method-row input:checked',
    payment: (code) => `#hc-pay-${code}`,
    paymentRadios: 'payment-method-row input[type="radio"]',
    paymentRow: (code) => `payment-method-row:has(#hc-pay-${code})`,
    vaultRows: (code) => `[id^="hc-pay-${code}_"]`,
    saveCard: `${'sample-psp-card'} [data-sample-psp-save]`,
    hostedPay: 'form[data-sample-hosted-form] button[name="sample_action"][value="pay"]',
    hostedCancel: 'form[data-sample-hosted-form] button[name="sample_action"][value="cancel"]',
    expressButton: 'sample-psp-express button[data-sample-psp-express]',
    rowSkeleton: '[data-payment-skeleton]',
    diagnosticAny: '[data-payment-unsupported]',
    placeOrder: '[data-hyperion-place-order] button',
    placeOrderHint: '[data-place-order-hint]',
    errors: '[data-error-banner], hc-section-status [data-section-status]',
    paymentStatus: 'hc-section-status[section="payment"] [data-section-status], checkout-payment [role="alert"]',
    expressSlot: (placement) => `hyperion-express-slot[placement="${placement}"]`,
    expressBox: (id) => `[data-hyperion-express-button="${id}"]`,
    messages: 'hyperion-messages',
    cartItems: '#hyperion-cart-items',
    addToCartForm: '#product_addtocart_form',
};
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };
const PRODUCTS = {
    card: '/fusion-backpack.html', currency: '/impulse-duffle.html', approve: '/push-it-messenger-bag.html', decline: '/joust-duffle-bag.html',
    vaultFirst: '/driven-backpack.html', vaultSecond: '/endeavor-daytrip-backpack.html', redirectPay: '/strive-shoulder-pack.html',
    redirectCancel: '/crown-summit-backpack.html', form: '/wayfarer-messenger-bag.html', express: '/compete-track-tote.html',
    expressCart: '/voyage-yoga-bag.html', unsupported: '/savvy-shoulder-tote.html', italian: '/overnight-duffle.html', inactive: '/rival-field-messenger.html',
};
const MICHIGAN = { firstname: 'Payment', lastname: 'Checker', country: 'US', street: '1 Gateway Street', postcode: '49628', city: 'Calder', region: 'Michigan', telephone: '5552293326' };
const ADMIN = { user: 'hyperion_e2e_payments', password: 'E2e' + Math.random().toString(36).slice(2, 10) + 'Aa1' };
const PARTS = ['card', 'currency', 'threeds', 'vault', 'redirect', 'form', 'express', 'cls', 'unsupported', 'italian', 'inactive'];

// ---------------------------------------------------------------- run setup
const h = await createHarness({ usage: `<baseUrl> <slotDir> [--only ${PARTS.join(',')}] [--shots dir]`, parts: PARTS });
const { base, u, check, expectEqual, skip, sql, quote, magento } = h;
requireDevModules(h.slotDir, DEV_MODULES);
const RUN = Date.now();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const orders = [];
const email = (tag) => `e2e.payment-api.${tag.replace(/[^a-z0-9]+/gi, '-')}.${RUN}@example.com`;

// Runs in every page before its scripts: the payment and express events with their target, and the moment the
// sample card row first appears.
function pageProbe([paymentEvents, expressEvents, cardRadio]) {
    window.__e2eEvents = [];
    for (const name of [...paymentEvents, ...expressEvents]) {
        document.addEventListener(name, (e) => window.__e2eEvents.push({ name, target: e.target?.localName ?? '', at: Date.now(), detail: JSON.stringify(e.detail ?? null).slice(0, 200) }), true);
    }
    window.__e2eRowSeen = null;
    new MutationObserver(() => {
        if (window.__e2eRowSeen === null && document.querySelector(cardRadio)) window.__e2eRowSeen = Date.now();
    }).observe(document, { subtree: true, childList: true });
}
const probeScript = { content: `(${pageProbe})(${JSON.stringify([PAYMENT_EVENTS, EXPRESS_EVENTS, SEL.payment(METHOD.card)])})` };
const journey = ({ initScripts = [], ...options } = {}) => h.newJourney({ ...options, initScripts: [probeScript, ...initScripts] });
const events = (page) => page.evaluate(() => window.__e2eEvents ?? []).catch(() => []);

// ---------------------------------------------------------------- helpers
async function addToCart(page, productPath) {
    await page.goto(base + u(productPath), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`${SEL.addToCartForm} button[type="submit"]`, { timeout: 30000 });
    await page.waitForFunction((form) => window.htmx !== undefined && document.querySelector(`${form} input[name="form_key"]`)?.value, SEL.addToCartForm, { timeout: 30000 }).catch(() => {});
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/add/.test(r.url()), { timeout: 40000 }).catch(() => null),
        page.click(`${SEL.addToCartForm} button[type="submit"]`),
    ]);
    if (response === null || response.status() >= 400) throw new Error(`add to cart failed for ${productPath} (${response?.status() ?? 'no answer'})`);
}
async function login(page) {
    await page.goto(base + '/customer/account/login/', { waitUntil: 'networkidle' });
    await page.fill('#email', CUSTOMER.email);
    await page.fill('#pass', CUSTOMER.password);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 30000 }).catch(() => {});
    if (page.url().includes('/login')) throw new Error(`login failed for ${CUSTOMER.email} (is the customer_login reCAPTCHA relaxed for this run?)`);
}
async function openCheckout(j, query = '') {
    await j.page.goto(base + '/checkout/' + query, { waitUntil: 'load' });
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
    if (await page.locator(`select${id('region_id')}`).count()) await page.selectOption(id('region_id'), { label: address.region });
    else if (await page.locator(id('region')).count()) await page.fill(id('region'), address.region);
    await page.fill(id('telephone'), address.telephone);
    await page.locator(id('telephone')).blur();
}
const waitForRates = (page, timeout = 40000) => page.waitForFunction(([ready, checked]) => document.querySelector(ready) !== null && document.querySelector(checked) !== null,
    [SEL.ratesReady, SEL.checkedRate], { timeout }).then(() => true, () => false);
/** Guest: cart, checkout, email and address, rates listed. */
async function guestCheckout(j, productPath, address = MICHIGAN, tag = 'guest') {
    await addToCart(j.page, productPath);
    await openCheckout(j);
    const mail = email(tag);
    await j.page.fill(SEL.email, mail);
    await j.page.locator(SEL.email).blur();
    await fillAddress(j.page, 'shipping', address);
    check(`${tag}: rates for the typed address`, await waitForRates(j.page));
    await j.settled();
    return mail;
}
const waitForGate = (page, open = true, timeout = 30000) => page.waitForFunction(([sel, wanted]) => {
    const button = document.querySelector(sel);
    return button !== null && (button.getAttribute('aria-disabled') !== 'true' && !button.disabled) === wanted;
}, [SEL.placeOrder, open], { timeout }).then(() => true, () => false);
const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? null, selector);
const visibleErrors = (page) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '), SEL.errors);
const hyperionConfig = (page) => page.evaluate((s) => JSON.parse(document.querySelector(s)?.textContent ?? '{}').hyperion ?? null, SEL.config);
const rendererFor = (config, code) => (config?.paymentRenderers ?? []).find((e) => e.method === code) ?? (config?.paymentRenderers ?? []).find((e) => {
    try { return e.pattern !== null && new RegExp(e.pattern).test(code); } catch { return false; }
});
const orderRequests = (j, mark = { bodies: 0 }) => j.bodiesSince(mark).filter((b) => /\/payment-information(\?|$)/.test(b.url) && !/set-payment-information/.test(b.url) && b.body?.paymentMethod);
/** Codes of the selectable payment rows (a diagnostic row's radio has no id and is never selectable). */
const offeredRows = (page) => page.evaluate(([sel, diagnostic]) => [...document.querySelectorAll(sel)]
    .filter((i) => i.id.startsWith('hc-pay-') && i.closest(diagnostic) === null).map((i) => i.id.replace('hc-pay-', '')), [SEL.paymentRadios, '[data-payment-unsupported]']);
const lastOrder = (mail) => {
    const row = sql(`select o.entity_id, o.increment_id, o.state, o.base_grand_total, o.base_currency_code, o.order_currency_code, o.grand_total, p.method, ifnull(p.additional_information, '') from sales_order o join sales_order_payment p on p.parent_id = o.entity_id where o.customer_email = ${quote(mail)} order by o.entity_id desc limit 1`);
    if (row === '') return null;
    const [id, increment, state, baseTotal, baseCurrency, orderCurrency, total, method, info] = row.split('\t');
    return { id: Number(id), increment, state, baseTotal: Number(baseTotal), baseCurrency, orderCurrency, total: Number(total), method, info };
};
const orderCount = (mail) => Number(sql(`select count(*) from sales_order where customer_email = ${quote(mail)}`));
async function placeAndWait(j, mail, label, expectSuccess = true) {
    const before = lastOrder(mail)?.id ?? 0;
    const mark = j.mark();
    await j.page.locator(SEL.placeOrder).click({ force: true, timeout: 10000 }).catch(() => {});
    if (expectSuccess) await j.page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 90000 }).catch(() => {});
    const order = lastOrder(mail);
    const placed = order !== null && order.id > before;
    if (placed) orders.push(`${order.increment} (${label}, ${mail})`);
    else if (expectSuccess) await h.shot(j.page, `order-failed-${label}`);
    return { order: placed ? order : null, requests: orderRequests(j, mark), onSuccess: j.page.url().includes('/checkout/onepage/success') };
}
const hostedFrame = (page) => page.frames().find((f) => f.url().includes(ROUTES.hostedField)) ?? null;
/** Types the card into the fake hosted field iframe (number first, then expiry and security code when present). */
async function typeCard(page, number) {
    const deadline = Date.now() + 20000;
    let frame = hostedFrame(page);
    while (frame === null && Date.now() < deadline) { await sleep(250); frame = hostedFrame(page); }
    if (frame === null) return false;
    const inputs = frame.locator('input');
    await inputs.first().waitFor({ timeout: 15000 }).catch(() => {});
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const name = `${await input.getAttribute('name') ?? ''} ${await input.getAttribute('autocomplete') ?? ''}`;
        const value = i === 0 || /number|cc-number/i.test(name) ? number : /exp/i.test(name) ? CARD.expiry : /cv|csc|security/i.test(name) ? CARD.cvc : null;
        if (value !== null) await input.pressSequentially(value, { delay: 15 });
    }
    return true;
}
/** Finds the challenge (an iframe of the page or a window it opened) and presses one of its buttons. */
async function answerChallenge(j, button) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const frame = j.page.frames().find((f) => f.url().includes(ROUTES.challenge));
        const popup = j.ctx.pages().find((p) => p !== j.page && p.url().includes(ROUTES.challenge));
        const target = frame ?? popup ?? null;
        if (target) {
            const control = target.getByRole('button', { name: button });
            await control.first().waitFor({ timeout: 10000 }).catch(() => {});
            await control.first().click().catch(() => {});
            return { found: true, where: frame ? 'iframe' : 'window' };
        }
        await sleep(250);
    }
    return { found: false, where: null };
}
async function selectPayment(j, code) {
    await j.page.waitForSelector(SEL.payment(code), { timeout: 40000 });
    await j.page.check(SEL.payment(code));
    await j.settled(1200);
}
const sampleRequests = (j, mark = { requests: 0 }) => j.requestsSince(mark).filter((r) => r.url.includes(`/${MODULE_PATH}/`));

const sampleOn = (extra = {}) => {
    const paths = { [CONFIG.sampleEnabled]: '1', [CONFIG.cardActive]: '1', [CONFIG.vaultActive]: '1', [CONFIG.redirectActive]: '1', [CONFIG.formActive]: '1', [CONFIG.expressEnabled]: '1', ...extra };
    const overrides = h.scopedOverrides(Object.keys(paths));
    if (overrides.length) console.log(`note: settings stored for a website or a store view win over this run's default scope values: ${overrides.join('; ')}`);
    return h.withConfig('sample payment methods', paths);
};

/** The card journey of a guest on an open checkout; answers the placed order or null. */
async function payByCard(j, mail, label, { number = CARD.plain, slowModule = true } = {}) {
    const { page } = j;
    const config = await hyperionConfig(page);
    const entry = rendererFor(config, METHOD.card);
    check(`${label}: the checkout config carries the sample card entry (element ${TAG.card}, awaits ready)`, entry?.type === 'element' && entry?.tag === TAG.card && entry?.awaitsReady === true && typeof entry?.moduleUrl === 'string',
        JSON.stringify(entry ?? null).slice(0, 300));
    const moduleUrl = entry?.moduleUrl?.split('?')[0] ?? `/${MODULE_PATH}/`;
    const isModule = (url) => url.toString().includes(moduleUrl);
    if (slowModule) {
        // Holds the module back so the skeleton state can be observed.
        await page.route(isModule, async (route) => { await sleep(2000); await route.continue(); });
    }
    await page.waitForSelector(SEL.payment(METHOD.card), { timeout: 40000 }).catch(() => {});
    check(`${label}: the sample card row is listed`, await page.locator(SEL.payment(METHOD.card)).count() === 1, (await offeredRows(page)).join(', '));
    const rowSeen = await page.evaluate(() => window.__e2eRowSeen);
    await page.check(SEL.payment(METHOD.card)).catch(() => {});
    if (slowModule) {
        await page.waitForSelector(`${SEL.paymentRow(METHOD.card)} ${SEL.rowSkeleton}`, { timeout: 1500 }).catch(() => {});
        const skeleton = await page.locator(`${SEL.paymentRow(METHOD.card)} ${SEL.rowSkeleton}`).count();
        const elementBefore = await page.locator(`${SEL.paymentRow(METHOD.card)} ${TAG.card}`).count();
        check(`${label}: a skeleton holds the row while the module loads`, skeleton > 0, `${skeleton} skeleton nodes, ${elementBefore} ${TAG.card} elements`);
    }
    await page.waitForFunction(() => (window.__e2eEvents ?? []).some((e) => e.name === 'hyperion-payment:ready'), null, { timeout: 30000 }).catch(() => {});
    if (slowModule) await page.unroute(isModule);
    const moduleRequests = j.requests.filter((r) => isModule(r.url));
    check(`${label}: the card module is requested once the method is offered, not before`, moduleRequests.length > 0 && rowSeen !== null && moduleRequests[0].at >= rowSeen,
        `first module request ${moduleRequests[0] ? new Date(moduleRequests[0].at).toISOString() : 'none'}, row seen ${rowSeen ? new Date(rowSeen).toISOString() : 'never'}`);
    const ready = (await events(page)).filter((e) => e.name === 'hyperion-payment:ready');
    check(`${label}: the element reports hyperion-payment:ready`, ready.length > 0 && ready[0].target === TAG.card, JSON.stringify(ready));
    check(`${label}: the skeleton is gone once the element is ready`, await page.locator(`${SEL.paymentRow(METHOD.card)} ${SEL.rowSkeleton}`).count() === 0);
    const typed = await typeCard(page, number);
    check(`${label}: the hosted field is an iframe served by ${ROUTES.hostedField}`, typed, page.frames().map((f) => f.url().replace(base, '')).join(', '));
    await j.settled(1200);
    const usable = await waitForGate(page, true, 15000);
    let detail = '';
    if (!usable) {
        await page.locator(SEL.placeOrder).click({ force: true }).catch(() => {});
        await page.waitForSelector(SEL.placeOrderHint, { timeout: 8000 }).catch(() => {});
        const seen = (await events(page)).filter((e) => e.name.startsWith('hyperion-payment:')).map((e) => `${e.name.replace('hyperion-payment:', '')} ${e.detail}`);
        const field = await hostedFrame(page)?.evaluate(() => ({ value: document.querySelector('input')?.value ?? null })).catch(() => null);
        detail = `hint after a press: ${await text(page, SEL.placeOrderHint)}; card element says: ${await text(page, `${TAG.card} [data-sample-psp-error]`)}; events ${seen.join(' | ')}; field ${JSON.stringify(field)}; ${await visibleErrors(page)}`;
        await h.shot(page, `card-gate-${label}`);
    }
    check(`${label}: Place Order usable with the card typed`, usable, detail);
    return entry;
}
function checkNonce(label, result) {
    const body = result.requests.at(-1)?.body;
    const nonce = body?.paymentMethod?.additional_data?.sample_nonce;
    const order = result.order;
    check(`${label}: order placed with the sample card`, order !== null && order.method === METHOD.card, order ? `${order.increment} ${order.method}` : 'no order');
    if (order) {
        expectEqual(`${label}: the nonce the server accepted names the base grand total and the base currency`, nonce, NONCE(order.baseTotal, order.baseCurrency));
    }
    return { nonce, order };
}

// ---------------------------------------------------------------- scenarios
const scenarios = {};

scenarios.card = async () => {
    sampleOn();
    const j = await journey();
    try {
        const mail = await guestCheckout(j, PRODUCTS.card, MICHIGAN, 'guest card');
        await payByCard(j, mail, 'guest');
        const result = await placeAndWait(j, mail, 'guest card');
        checkNonce('guest', result);
        h.noProblems(j, 'guest');
    } finally { await j.close(); }
};

scenarios.currency = async () => {
    const baseCurrency = sql("select ifnull((select value from core_config_data where path = 'currency/options/base' and scope = 'default'), 'USD')");
    const allowed = sql("select ifnull((select value from core_config_data where path = 'currency/options/allow' and scope = 'default'), '')").split(',').filter(Boolean);
    const display = allowed.find((code) => code !== baseCurrency) ?? null;
    if (display === null) { skip('display currency different from the base currency', `the store allows one currency only (${baseCurrency})`); return; }
    sampleOn();
    const j = await journey();
    try {
        await j.page.goto(`${base}/directory/currency/switch/?currency=${display}`, { waitUntil: 'domcontentloaded' });
        const mail = await guestCheckout(j, PRODUCTS.currency, MICHIGAN, 'guest currency');
        await payByCard(j, mail, `guest ${display}`, { slowModule: false });
        const result = await placeAndWait(j, mail, 'guest currency');
        const { order } = checkNonce(`guest ${display}`, result);
        check(`guest ${display}: the order is shown in ${display} and charged in ${baseCurrency}`, order !== null && order.orderCurrency === display && order.baseCurrency === baseCurrency && order.total !== order.baseTotal,
            order ? JSON.stringify({ orderCurrency: order.orderCurrency, baseCurrency: order.baseCurrency, total: order.total, baseTotal: order.baseTotal }) : 'no order');
        h.noProblems(j, 'guest');
    } finally { await j.close(); }
};

scenarios.threeds = async () => {
    sampleOn();
    {
        const j = await journey();
        try {
            const mail = await guestCheckout(j, PRODUCTS.approve, MICHIGAN, 'guest approve');
            await payByCard(j, mail, 'approve', { number: CARD.challenge, slowModule: false });
            const mark = j.mark();
            const before = lastOrder(mail)?.id ?? 0;
            await j.page.locator(SEL.placeOrder).click();
            const challenge = await answerChallenge(j, BUTTONS.approve);
            check('approve: the fake 3-D Secure challenge opens at Place Order', challenge.found, challenge.where ?? 'no frame or window of the challenge route');
            const busy = (await events(j.page)).filter((e) => e.name === 'hyperion-payment:busy');
            check('approve: the element reports busy while the challenge is open', busy.length > 0, JSON.stringify(busy.slice(0, 3)));
            await j.page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 90000 }).catch(() => {});
            const order = lastOrder(mail);
            const placed = order !== null && order.id > before;
            if (placed) orders.push(`${order.increment} (3-D Secure approved, ${mail})`);
            check('approve: Approve places the order', placed && j.page.url().includes('/checkout/onepage/success'), placed ? order.increment : `${j.page.url().replace(base, '')} ${await visibleErrors(j.page)}`);
            check('approve: one order request', orderRequests(j, mark).length === 1, `${orderRequests(j, mark).length} requests`);
            h.noProblems(j, 'approve');
        } finally { await j.close(); }
    }
    {
        const j = await journey();
        try {
            const mail = await guestCheckout(j, PRODUCTS.decline, MICHIGAN, 'guest decline');
            await payByCard(j, mail, 'decline', { number: CARD.challenge, slowModule: false });
            const mark = j.mark();
            await j.page.locator(SEL.placeOrder).click();
            const challenge = await answerChallenge(j, BUTTONS.decline);
            check('decline: the fake 3-D Secure challenge opens at Place Order', challenge.found, challenge.where ?? 'no frame or window of the challenge route');
            await j.page.waitForFunction((s) => [...document.querySelectorAll(s)].some((e) => e.textContent.trim() !== ''), `${SEL.errors}, ${SEL.paymentStatus}`, { timeout: 30000 }).catch(() => {});
            const message = await j.page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '), `${SEL.errors}, ${SEL.paymentStatus}`);
            check(`decline: the checkout shows "${MESSAGES.declined}"`, message.includes(MESSAGES.declined), message || 'no message');
            check('decline: the shopper stays on the checkout', j.page.url().includes('/checkout') && !j.page.url().includes('success'), j.page.url().replace(base, ''));
            check('decline: Place Order is usable again', await waitForGate(j.page), await text(j.page, SEL.placeOrderHint));
            expectEqual('decline: no order exists for the shopper', orderCount(mail), 0);
            check('decline: no order request was sent', orderRequests(j, mark).length === 0, JSON.stringify(orderRequests(j, mark).map((r) => r.body?.paymentMethod?.method)));
            h.noProblems(j, 'decline');
        } finally { await j.close(); }
    }
};

scenarios.vault = async () => {
    sampleOn();
    const customerId = sql(`select entity_id from customer_entity where email = ${quote(CUSTOMER.email)}`);
    const lastToken = Number(sql('select ifnull(max(entity_id), 0) from vault_payment_token'));
    h.onCleanup(`sample card tokens saved by this run for ${CUSTOMER.email}`, () => {
        sql(`delete from vault_payment_token where customer_id = ${Number(customerId)} and payment_method_code = ${quote(METHOD.card)} and entity_id > ${lastToken}`);
    });
    const j = await journey();
    try {
        await login(j.page);
        await addToCart(j.page, PRODUCTS.vaultFirst);
        await openCheckout(j);
        check('customer: rates for the default saved address', await waitForRates(j.page));
        await j.settled();
        await payByCard(j, CUSTOMER.email, 'customer', { slowModule: false });
        const save = j.page.locator(SEL.saveCard).first();
        check('customer: the card element offers to save the card', await save.count() === 1);
        await save.check().catch(() => {});
        const first = await placeAndWait(j, CUSTOMER.email, 'customer saved card');
        const body = first.requests.at(-1)?.body;
        check('customer: order placed with the sample card', first.order?.method === METHOD.card, JSON.stringify(first.order ?? null));
        expectEqual('customer: the order request asks to save the card (additional_data.is_active_payment_token_enabler)', body?.paymentMethod?.additional_data?.is_active_payment_token_enabler ?? null, true);
        const token = sql(`select public_hash from vault_payment_token where customer_id = ${Number(customerId)} and payment_method_code = ${quote(METHOD.card)} and is_active = 1 and is_visible = 1 and entity_id > ${lastToken} order by entity_id desc limit 1`);
        check('customer: a visible payment token is stored for the customer', token !== '', `tokens after ${lastToken}: ${token || 'none'}`);

        await addToCart(j.page, PRODUCTS.vaultSecond);
        await openCheckout(j);
        await waitForRates(j.page);
        await j.settled();
        const rows = await j.page.evaluate((sel) => [...document.querySelectorAll(sel)].map((i) => ({ id: i.id, label: i.closest('payment-method-row')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) })), SEL.vaultRows(METHOD.vault));
        check('customer: the next checkout lists the stored card as its own row', rows.length > 0, JSON.stringify(rows) + ' offered: ' + (await offeredRows(j.page)).join(', '));
        if (rows.length === 0) return;
        await j.page.check(`#${rows.at(-1).id}`);
        await j.page.waitForFunction(() => (window.__e2eEvents ?? []).filter((e) => e.name === 'hyperion-payment:ready').length > 0, null, { timeout: 20000 }).catch(() => {});
        await j.settled(1200);
        check('customer: Place Order usable with the stored card', await waitForGate(j.page), await text(j.page, SEL.placeOrderHint));
        const second = await placeAndWait(j, CUSTOMER.email, 'customer stored card');
        const vaultBody = second.requests.at(-1)?.body?.paymentMethod;
        // Core records a stored card order under the provider method; the token travels in the payment information.
        check('customer: second order paid with the stored card (provider method, the token in the payment information)',
            second.order?.method === METHOD.card && String(second.order?.info ?? '').includes(token), JSON.stringify(second.order ?? null));
        expectEqual('customer: the order request names the vault method and the token', { method: vaultBody?.method ?? null, publicHash: vaultBody?.additional_data?.public_hash ?? null }, { method: METHOD.vault, publicHash: token });
        h.noProblems(j, 'customer');
    } finally { await j.close(); }
};

scenarios.redirect = async () => {
    sampleOn();
    for (const outcome of ['pay', 'cancel']) {
        const j = await journey();
        const { page } = j;
        try {
            const mail = await guestCheckout(j, outcome === 'pay' ? PRODUCTS.redirectPay : PRODUCTS.redirectCancel, MICHIGAN, `guest redirect ${outcome}`);
            const entry = rendererFor(await hyperionConfig(page), METHOD.redirect);
            check(`${outcome}: the redirect entry carries its route and no module`, entry?.type === 'redirect' && entry?.moduleUrl === null && typeof entry?.redirect?.route === 'string' && entry.redirect.route.includes(ROUTES.redirectStart),
                JSON.stringify(entry ?? null).slice(0, 300));
            await selectPayment(j, METHOD.redirect);
            check(`${outcome}: Place Order usable with the redirect method`, await waitForGate(page), await text(page, SEL.placeOrderHint));
            const before = lastOrder(mail)?.id ?? 0;
            await page.locator(SEL.placeOrder).click();
            await page.waitForURL((url) => ROUTES.hostedPage.test(url.pathname), { timeout: 60000 }).catch(() => {});
            const order = lastOrder(mail);
            const placed = order !== null && order.id > before;
            if (placed) orders.push(`${order.increment} (redirect ${outcome}, ${mail})`);
            check(`${outcome}: the order is placed before the browser leaves`, placed && order.method === METHOD.redirect, JSON.stringify(order ?? null));
            check(`${outcome}: the browser is on the fake hosted page`, ROUTES.hostedPage.test(new URL(page.url()).pathname), page.url().replace(base, ''));
            await page.locator(outcome === 'pay' ? SEL.hostedPay : SEL.hostedCancel).first().click().catch(() => {});
            if (outcome === 'pay') {
                await page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 60000 }).catch(() => {});
                check('pay: Pay lands on the success page', page.url().includes('/checkout/onepage/success'), page.url().replace(base, ''));
                const after = placed ? lastOrder(mail) : null;
                expectEqual('pay: the order is invoiced and processing', after?.state ?? null, 'processing');
            } else {
                await page.waitForURL((url) => /\/checkout\/cart\/?$/.test(url.pathname), { timeout: 60000 }).catch(() => {});
                await page.waitForFunction((s) => (document.querySelector(s)?.textContent ?? '').trim() !== '', SEL.messages, { timeout: 15000 }).catch(() => {});
                check('cancel: Cancel returns to the cart', /\/checkout\/cart\/?$/.test(new URL(page.url()).pathname), page.url().replace(base, ''));
                const message = await text(page, SEL.messages);
                check(`cancel: the cart shows "${MESSAGES.redirectCanceled}"`, String(message).includes(MESSAGES.redirectCanceled), String(message));
                check('cancel: the quote is restored (the cart has its line again)', await page.locator(`${SEL.cartItems} [data-hyperion-qty], ${SEL.cartItems} input[name*="qty"]`).count() > 0);
                const after = placed ? lastOrder(mail) : null;
                expectEqual('cancel: the order is canceled', after?.state ?? null, 'canceled');
            }
            h.noProblems(j, outcome);
        } finally { await j.close(); }
    }
};

scenarios.form = async () => {
    sampleOn();
    const j = await journey();
    const { page } = j;
    try {
        const mail = await guestCheckout(j, PRODUCTS.form, MICHIGAN, 'guest form');
        const entry = rendererFor(await hyperionConfig(page), METHOD.form);
        const field = (entry?.fields ?? []).find((f) => f.name === FORM_FIELD.name);
        check(`the form entry declares the required field "${FORM_FIELD.name}" for additional_data`, entry?.type === 'form' && field?.required === true && field?.target === 'additional_data', JSON.stringify(entry ?? null).slice(0, 300));
        if (field?.pattern) {
            let fits = false;
            try { fits = new RegExp(field.pattern).test(FORM_FIELD.value); } catch { /* checked below */ }
            check(`the test value ${FORM_FIELD.value} matches the declared pattern`, fits, `pattern ${field.pattern}`);
        }
        await selectPayment(j, METHOD.form);
        const input = page.locator(`${SEL.paymentRow(METHOD.form)} input[name="${FORM_FIELD.name}"]`).first();
        await input.waitFor({ timeout: 20000 }).catch(() => {});
        check('the field is rendered in the selected row', await input.count() === 1);
        const mark = j.mark();
        await page.locator(SEL.placeOrder).click({ force: true }).catch(() => {});
        await page.waitForTimeout(800);
        const focused = await page.evaluate(deepActiveElementDescription);
        check('an empty required field blocks Place Order', orderRequests(j, mark).length === 0 && orderCount(mail) === 0);
        expectEqual('the empty required field gets the focus', focused?.name ?? null, FORM_FIELD.name);
        await input.fill(FORM_FIELD.value);
        await input.blur();
        await j.settled(1000);
        check('Place Order usable with the field filled', await waitForGate(page), await text(page, SEL.placeOrderHint));
        const result = await placeAndWait(j, mail, 'guest form');
        check('order placed with the form method', result.order?.method === METHOD.form, JSON.stringify(result.order ?? null));
        expectEqual('the order request carries the value in additional_data', result.requests.at(-1)?.body?.paymentMethod?.additional_data?.[FORM_FIELD.name] ?? null, FORM_FIELD.value);
        let stored = null;
        try { stored = JSON.parse(result.order?.info || 'null')?.[FORM_FIELD.name] ?? null; } catch { stored = result.order?.info ?? null; }
        expectEqual('the value is stored on the order payment', stored, FORM_FIELD.value);
        h.noProblems(j, 'form');
    } finally { await j.close(); }
};

/** The express slot of a page: markup as served (before any script), then as upgraded. */
async function expressState(page, placement) {
    return page.evaluate(([slotSel, boxSel, tag]) => {
        const slot = document.querySelector(slotSel);
        const box = slot?.querySelector(boxSel) ?? null;
        let entries;
        try { entries = JSON.parse(slot?.getAttribute('data-hyperion-express') ?? 'null'); } catch { entries = 'unparsable'; }
        const rect = box?.getBoundingClientRect();
        return {
            slot: slot !== null, entries, box: box !== null, boxMinHeight: box ? parseFloat(getComputedStyle(box).minHeight) || 0 : 0, boxHeight: rect ? Math.round(rect.height) : 0,
            boxTop: rect ? Math.round(rect.top) : null, viewport: window.innerHeight, element: box?.querySelector(tag) !== null && box !== null,
        };
    }, [SEL.expressSlot(placement), SEL.expressBox(EXPRESS_ENTRY_ID), TAG.express]);
}

scenarios.express = async () => {
    sampleOn();
    // Product placement, guest: markup, reserved height, no module before engagement, then the whole flow.
    {
        // A small phone (320 x 568): the button box starts below the fold plus the 200 px look-ahead of <hyperion-express-slot>.
        const j = await journey({ phone: true, viewport: { width: 320, height: 568 } });
        const { page } = j;
        try {
            await page.goto(base + u(PRODUCTS.express), { waitUntil: 'load' });
            await sleep(4000);
            const served = await expressState(page, 'product');
            const entry = Array.isArray(served.entries) ? served.entries.find((e) => e.id === EXPRESS_ENTRY_ID) : null;
            check('product: the express slot is in the page with the sample entry', served.slot && served.box && entry?.tag === TAG.express, JSON.stringify(served).slice(0, 300));
            check('product: the button box reserves its height before the button exists (at least the entry\'s reserved height)', served.boxMinHeight >= (entry?.reservedHeight ?? 45) && served.boxHeight >= (entry?.reservedHeight ?? 45),
                `min-height ${served.boxMinHeight}, height ${served.boxHeight}, reserved ${entry?.reservedHeight}`);
            const moduleUrl = entry?.moduleUrl?.split('?')[0] ?? `/${MODULE_PATH}/`;
            const early = j.requests.filter((r) => r.url.includes(moduleUrl));
            if (served.boxTop !== null && served.boxTop > served.viewport + 200) {
                check('product: no express module request before the shopper engages (box below the fold, untouched page)', early.length === 0, `${early.length} requests of ${moduleUrl}; box top ${served.boxTop}, viewport ${served.viewport}`);
            } else {
                skip('product: no express module request before engagement', `the box is near the viewport at load (top ${served.boxTop}, viewport ${served.viewport}), so it is wanted at once`);
            }
            await page.locator(SEL.expressBox(EXPRESS_ENTRY_ID)).scrollIntoViewIfNeeded();
            await page.mouse.move(50, 50);
            await page.waitForFunction(() => (window.__e2eEvents ?? []).some((e) => e.name === 'hyperion-express:ready'), null, { timeout: 30000 }).catch(() => {});
            const upgraded = await expressState(page, 'product');
            check('product: after engagement the module loads and the button reports hyperion-express:ready inside its box', upgraded.element && (await events(page)).some((e) => e.name === 'hyperion-express:ready'),
                `${JSON.stringify(upgraded).slice(0, 200)}; events ${JSON.stringify(await events(page)).slice(0, 200)}`);
            check('product: the box keeps its height once the button is in it', upgraded.boxHeight === served.boxHeight, `${served.boxHeight} -> ${upgraded.boxHeight}`);

            const mark = j.mark();
            await page.locator(`${SEL.expressBox(EXPRESS_ENTRY_ID)} ${SEL.expressButton}`).first().click();
            await page.waitForURL((url) => ROUTES.hostedPage.test(url.pathname), { timeout: 60000 }).catch(() => {});
            const since = j.requestsSince(mark);
            check('product: the express button adds the product through the add to cart request first', since.some((r) => r.method === 'POST' && /\/checkout\/cart\/add/.test(r.url)),
                since.map((r) => `${r.method} ${r.url.replace(base, '')}`).slice(0, 8).join(', '));
            check(`product: then asks ${ROUTES.expressStart} and the browser is on the fake hosted page`, since.some((r) => r.url.includes(ROUTES.expressStart)) && ROUTES.hostedPage.test(new URL(page.url()).pathname), page.url().replace(base, ''));
            const before = Number(sql('select ifnull(max(entity_id), 0) from sales_order'));
            await page.locator(SEL.hostedPay).first().click().catch(() => {});
            await page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 60000 }).catch(() => {});
            const row = sql(`select o.increment_id, p.method, group_concat(i.sku), ifnull(p.additional_information, '') from sales_order o join sales_order_payment p on p.parent_id = o.entity_id join sales_order_item i on i.order_id = o.entity_id where o.entity_id > ${before} group by o.entity_id order by o.entity_id desc limit 1`);
            const [increment, method, skus, info] = row.split('\t');
            if (increment) orders.push(`${increment} (express product, guest)`);
            check('product: Pay places the order and lands on the success page', page.url().includes('/checkout/onepage/success') && method === METHOD.redirect, `${page.url().replace(base, '')} ${row}`);
            check('product: the order holds the product of the page', (skus ?? '') !== '', skus ?? 'no order');
            check('product: the order is marked as an express order (payment sample_express)', /"sample_express":"?1/.test(info ?? ''), info ?? 'no order');
            h.noProblems(j, 'product express');
        } finally { await j.close(); }
    }
    // Cart placement, customer.
    {
        const j = await journey();
        const { page } = j;
        try {
            await login(page);
            await addToCart(page, PRODUCTS.expressCart);
            await page.goto(base + '/checkout/cart/', { waitUntil: 'load' });
            const served = await expressState(page, 'cart');
            check('cart: the express slot is in the totals card with the sample entry and a reserved box', served.slot && served.box && served.boxMinHeight >= 45, JSON.stringify(served).slice(0, 300));
            await page.locator(SEL.expressBox(EXPRESS_ENTRY_ID)).scrollIntoViewIfNeeded();
            await page.mouse.move(60, 60);
            await page.waitForFunction(() => (window.__e2eEvents ?? []).some((e) => e.name === 'hyperion-express:ready'), null, { timeout: 30000 }).catch(() => {});
            const before = lastOrder(CUSTOMER.email)?.id ?? 0;
            await page.locator(`${SEL.expressBox(EXPRESS_ENTRY_ID)} ${SEL.expressButton}`).first().click().catch(() => {});
            await page.waitForURL((url) => ROUTES.hostedPage.test(url.pathname), { timeout: 60000 }).catch(() => {});
            await page.locator(SEL.hostedPay).first().click().catch(() => {});
            await page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 60000 }).catch(() => {});
            const order = lastOrder(CUSTOMER.email);
            const placed = order !== null && order.id > before;
            if (placed) orders.push(`${order.increment} (express cart, customer)`);
            check('cart: the customer completes an express order from the cart', placed && order.method === METHOD.redirect && page.url().includes('/checkout/onepage/success'), `${page.url().replace(base, '')} ${JSON.stringify(order ?? null)}`);
            h.noProblems(j, 'cart express');
        } finally { await j.close(); }
    }
    // Catalog mode blocks guests: no slot anywhere.
    {
        h.withConfig('catalog mode for guests', { [CONFIG.catalogMode]: '1', [CONFIG.catalogModeGroups]: '1' });
        const j = await journey();
        try {
            await j.page.goto(base + u(PRODUCTS.express), { waitUntil: 'load' });
            const state = await j.page.evaluate(() => ({ slots: document.querySelectorAll('hyperion-express-slot').length, boxes: document.querySelectorAll('[data-hyperion-express-button]').length, form: document.querySelector('#product_addtocart_form') !== null }));
            check('catalog mode: a guest product page carries no express slot', state.slots === 0 && state.boxes === 0 && !state.form, JSON.stringify(state));
            h.noProblems(j, 'catalog mode');
        } finally { await j.close(); }
    }
};

scenarios.cls = async () => {
    sampleOn();
    const observeShifts = () => {
        window.__shifts = [];
        new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                if (!e.hadRecentInput) window.__shifts.push({ value: e.value, sources: (e.sources || []).slice(0, 3).map((s) => (s.node?.localName ?? s.node?.parentElement?.localName ?? '?') + (s.node?.id ? '#' + s.node.id : '')) });
            }
        }).observe({ type: 'layout-shift', buffered: true });
    };
    for (const phone of [false, true]) {
        const j = await journey({ phone, initScripts: [observeShifts] });
        const { page } = j;
        try {
            await addToCart(page, PRODUCTS.express);
            const cdp = await j.ctx.newCDPSession(page);
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
            for (const [label, target, placement] of [['product', base + u(PRODUCTS.express), 'product'], ['cart', base + '/checkout/cart/', 'cart']]) {
                await page.goto('about:blank');
                await page.goto(target, { waitUntil: 'load' });
                await sleep(5000);
                await page.locator(SEL.expressBox(EXPRESS_ENTRY_ID)).scrollIntoViewIfNeeded().catch(() => {});
                await page.mouse.move(40, 40);
                await page.waitForFunction(() => (window.__e2eEvents ?? []).some((e) => e.name === 'hyperion-express:ready'), null, { timeout: 30000 }).catch(() => {});
                await sleep(2500);
                const shifts = await page.evaluate(() => window.__shifts ?? []);
                const cls = shifts.reduce((a, s) => a + s.value, 0);
                const state = await expressState(page, placement);
                check(`${label} (${phone ? 'phone' : 'desktop'}, slow network, 4x slower CPU): the express button is active`, state.element, JSON.stringify(state).slice(0, 200));
                check(`${label} (${phone ? 'phone' : 'desktop'}, slow network, 4x slower CPU): layout shift 0 with the express button`, cls === 0, cls === 0 ? '' : `${cls.toFixed(4)}: ${shifts.map((s) => s.sources.join('|')).join('; ').slice(0, 200)}`);
            }
            h.noProblems(j, phone ? 'phone' : 'desktop');
        } finally { await j.close(); }
    }
};

scenarios.unsupported = async () => {
    sampleOn();
    let report = '';
    try { report = magento(`${CLI} 2>&1`); } catch (e) { report = String(e.stdout ?? '') + String(e.stderr ?? e.message); }
    check(`bin/magento ${CLI} runs and prints one row per active method`, /supported|no renderer/i.test(report), report.split('\n').slice(0, 6).join(' / ').slice(0, 300));
    // The method code of a row: the first lower case token that is not a store code or a status word.
    const notCodes = new Set([...sql('select code from store').split('\n'), 'no', 'renderer', 'supported', 'element', 'redirect', 'form', 'builtin']);
    const codeOf = (line) => (line.match(/\b[a-z][a-z0-9_]*\b/g) ?? []).find((token) => !notCodes.has(token)) ?? null;
    const unsupportedInCli = [...new Set(report.split('\n').filter((l) => /no renderer/i.test(l)).map(codeOf).filter(Boolean))];
    check(`bin/magento ${CLI} lists the sample methods as supported`, Object.values(METHOD).filter((c) => c !== METHOD.vault).every((code) => report.split('\n').some((l) => l.includes(code) && /\bsupported\b/i.test(l) && !/no renderer/i.test(l))),
        report.split('\n').filter((l) => l.includes('hyperion_sample')).join(' / ').slice(0, 300));

    const j = await journey();
    const { page } = j;
    try {
        await guestCheckout(j, PRODUCTS.unsupported, MICHIGAN, 'guest unsupported');
        // What the server offered for the quote, against what the shopper sees.
        const offered = await page.evaluate(async () => {
            const cfg = JSON.parse(document.querySelector('#checkout-config')?.textContent ?? '{}');
            const masked = cfg.quoteData?.entity_id;
            if (!masked) return null;
            const store = cfg.storeCode ?? 'default';
            const res = await fetch(`/rest/${store}/V1/guest-carts/${masked}/payment-methods`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
            return res.ok ? (await res.json()).map((m) => m.code) : null;
        });
        const shown = await offeredRows(page);
        // A vault method with an entry is hidden for a shopper without a saved token: only codes with no entry count.
        const config = await hyperionConfig(page);
        const hidden = (offered ?? []).filter((code) => !shown.includes(code) && !shown.some((s) => s.startsWith(code + '_')) && rendererFor(config, code) === undefined);
        console.log(`offered by the server: ${(offered ?? []).join(', ')}; shown: ${shown.join(', ')}; hidden: ${hidden.join(', ') || 'none'}`);
        // A method with no entry that still got a selectable row is the defect itself: it is not in `hidden`.
        const selectable = (offered ?? []).filter((code) => rendererFor(config, code) === undefined && shown.includes(code));
        if (hidden.length === 0 && selectable.length === 0) {
            skip('an active method with no renderer entry', `every method the server offers this quote has an entry (offered: ${(offered ?? []).join(', ')}); the CLI names as unsupported: ${unsupportedInCli.join(', ') || 'none'}`);
        } else {
            // The page's own switch decides: developer mode shows the diagnostic rows without the query parameter.
            const showsDiagnostics = config?.debug?.showUnsupportedPayments === true;
            const rows = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => ({
                code: el.getAttribute('data-payment-unsupported'), disabled: el.querySelector('input')?.disabled ?? true,
            })), SEL.diagnosticAny);
            if (showsDiagnostics) {
                check('a method with no entry is not selectable; the page shows diagnostics (developer mode): one disabled diagnostic row per hidden method',
                    selectable.length === 0 && hidden.every((code) => rows.filter((r) => r.code === code && r.disabled).length === 1),
                    `hidden: ${hidden.join(', ')}; diagnostic rows ${JSON.stringify(rows)}; selectable ${selectable.join(', ') || 'none'}`);
            } else {
                check('a method with no entry is not offered to the shopper (no diagnostics on this page): no row and no diagnostic row',
                    selectable.length === 0 && rows.length === 0, `hidden: ${hidden.join(', ')}; diagnostic rows ${rows.length}`);
            }
            check(`bin/magento ${CLI} names the hidden methods as having no renderer`, hidden.every((code) => report.split('\n').some((l) => l.includes(code) && /no renderer/i.test(l))), `hidden ${hidden.join(', ')}; cli: ${unsupportedInCli.join(', ')}`);
            await openCheckout(j, `?${DEBUG_PARAM}`);
            await waitForRates(page);
            await j.settled();
            const diagnostic = await page.evaluate(([sel, codes]) => [...document.querySelectorAll(sel)].map((el) => ({ text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 160), disabled: el.querySelector('input')?.disabled ?? true, codes: codes.filter((c) => el.textContent.includes(c) || el.outerHTML.includes(c)) })), [SEL.diagnosticAny, hidden]);
            check(`with ?${DEBUG_PARAM} every hidden method is a disabled diagnostic row naming its code`, hidden.every((code) => diagnostic.some((d) => d.codes.includes(code) && d.disabled)), JSON.stringify(diagnostic).slice(0, 300));
            check('the diagnostic rows are never selected', !hidden.includes(await page.evaluate(() => document.querySelector('payment-method-row input:checked')?.id.replace('hc-pay-', '') ?? '')));
        }
        h.noProblems(j, 'shopper');
    } finally { await j.close(); }

    // Admin: the system message names the hidden methods.
    h.onCleanup('temporary admin user', () => sql(`delete from admin_user where username = ${quote(ADMIN.user)}`));
    magento(`admin:user:create --admin-user=${ADMIN.user} --admin-password=${ADMIN.password} --admin-email=${ADMIN.user}@example.com --admin-firstname=Hyperion --admin-lastname=E2E > /dev/null`);
    const a = await h.newJourney();
    try {
        await a.page.goto(base + '/admin/', { waitUntil: 'domcontentloaded' });
        await a.page.fill('input[name="login[username]"]', ADMIN.user);
        await a.page.fill('input[name="login[password]"]', ADMIN.password);
        await Promise.all([a.page.waitForURL(/\/admin\/(admin\/)?(dashboard|index)/, { timeout: 30000 }).catch(() => {}), a.page.click('button.action-login')]);
        check('admin: signed in', /dashboard|index/.test(a.page.url()), a.page.url().replace(base, ''));
        await a.page.waitForLoadState('networkidle').catch(() => {});
        const messages = await a.page.evaluate(() => [...document.querySelectorAll('#system_messages, .message-system, .message-system-list, .messages')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
        if (unsupportedInCli.length === 0) {
            check('admin: no "no checkout renderer" system message while every active method is supported', !ADMIN_MESSAGE.test(messages), messages.slice(0, 300));
        } else {
            check('admin: the system message names the methods with no checkout renderer', ADMIN_MESSAGE.test(messages) && unsupportedInCli.slice(0, 10).every((code) => messages.includes(code)), messages.slice(0, 300));
        }
    } finally { await a.close(); }
};

scenarios.italian = async () => {
    const storeCode = sql("select s.code from store s join core_config_data c on c.scope = 'stores' and c.scope_id = s.store_id and c.path = 'general/locale/code' and c.value = 'it_IT' where s.is_active = 1 order by s.store_id limit 1");
    if (storeCode === '') { skip('Italian store view', 'no active store view has the it_IT locale'); return; }
    const csvFile = path.join(REPO, 'dev', 'modules', 'Magentofullstackdev', 'HyperionSamplePsp', 'i18n', 'it_IT.csv');
    if (!existsSync(csvFile)) { check('the sample module ships an it_IT catalog', false, csvFile); return; }
    // Two column CSV, double quotes optional.
    const catalog = new Map(readFileSync(csvFile, 'utf8').split('\n').map((line) => line.match(/^"?((?:[^"]|"")*?)"?\s*,\s*"?((?:[^"]|"")*?)"?\s*$/)).filter(Boolean).map((m) => [m[1].replace(/""/g, '"'), m[2].replace(/""/g, '"')]));
    sampleOn();
    const useStoreCode = sql("select ifnull((select value from core_config_data where path = 'web/url/use_store' and scope = 'default'), '0')") === '1';
    const storeBase = useStoreCode ? `${base}/${storeCode}` : base;
    const j = await journey();
    const { page } = j;
    try {
        if (!useStoreCode) {
            // The store switcher's own link (a `___store` query alone changes one request, not the session).
            await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
            const href = await page.evaluate((code) => [...document.querySelectorAll('a[href]')].map((a) => a.href).find((url) => url.includes(`___store=${code}`) || url.includes(`___store/${code}`)) ?? null, storeCode);
            check(`${storeCode}: the store switcher offers the Italian store view`, href !== null);
            if (href === null) return;
            await page.goto(href, { waitUntil: 'domcontentloaded' });
        }
        await page.goto(storeBase + u(PRODUCTS.italian), { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(`${SEL.addToCartForm} button[type="submit"]`, { timeout: 30000 });
        await page.waitForFunction((form) => window.htmx !== undefined && document.querySelector(`${form} input[name="form_key"]`)?.value, SEL.addToCartForm, { timeout: 30000 }).catch(() => {});
        await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/add/.test(r.url()), { timeout: 40000 }).catch(() => null),
            page.click(`${SEL.addToCartForm} button[type="submit"]`),
        ]);
        await page.goto(storeBase + '/checkout/', { waitUntil: 'load' });
        await page.waitForSelector(SEL.placeOrder, { timeout: 40000 });
        const servedStore = await page.evaluate((sel) => JSON.parse(document.querySelector(sel)?.textContent ?? '{}').storeCode ?? null, SEL.config);
        expectEqual(`${storeCode}: the checkout is served for the Italian store view`, servedStore, storeCode);
        const config = await hyperionConfig(page);
        const entries = (config?.paymentRenderers ?? []).filter((e) => Object.values(METHOD).includes(e.method) || /hyperion_sample/.test(e.pattern ?? ''));
        const pairs = entries.flatMap((e) => Object.entries(e.phrases ?? {}).map(([source, shown]) => ({ entry: e.id, source, shown, wanted: catalog.get(source) ?? null })));
        const translatable = pairs.filter((p) => p.wanted !== null && p.wanted !== p.source);
        check(`${storeCode}: the sample entries carry phrases with an Italian translation in the module catalog`, translatable.length > 0, JSON.stringify(pairs).slice(0, 300));
        const wrong = translatable.filter((p) => p.shown !== p.wanted);
        check(`${storeCode}: every sample phrase arrives translated`, translatable.length > 0 && wrong.length === 0, JSON.stringify(wrong).slice(0, 300));
        await page.fill(SEL.email, email('italian'));
        await page.locator(SEL.email).blur();
        await fillAddress(page, 'shipping', { ...MICHIGAN, country: 'IT', postcode: '20121', city: 'Milano', region: 'Milano', telephone: '0212345678' });
        await waitForRates(page);
        await j.settled();
        if (await page.locator(SEL.payment(METHOD.card)).count()) {
            await selectPayment(j, METHOD.card);
            await page.waitForFunction(() => (window.__e2eEvents ?? []).some((e) => e.name === 'hyperion-payment:ready'), null, { timeout: 30000 }).catch(() => {});
            const shownText = await page.locator(TAG.card).first().innerText().catch(() => '');
            const sample = translatable.find((p) => shownText.includes(p.wanted));
            check(`${storeCode}: the card element shows an Italian phrase`, sample !== undefined, `${shownText.replace(/\s+/g, ' ').slice(0, 200)}`);
        } else {
            check(`${storeCode}: the sample card row is offered in the Italian store view`, false, (await offeredRows(page)).join(', '));
        }
        h.noProblems(j, 'italian');
    } finally { await j.close(); }
};

scenarios.inactive = async () => {
    h.withConfig('sample payment methods off', { [CONFIG.sampleEnabled]: '0' });
    const paypalOn = sql("select ifnull((select value from core_config_data where path = 'payment/paypal_express/active' and scope = 'default'), '0')") === '1';
    const j = await journey();
    const { page } = j;
    try {
        await page.goto(base + u(PRODUCTS.inactive), { waitUntil: 'load' });
        const product = await page.evaluate((id) => ({ sample: document.querySelectorAll(`[data-hyperion-express-button="${id}"]`).length, slots: document.querySelectorAll('hyperion-express-slot').length }), EXPRESS_ENTRY_ID);
        expectEqual('product page: no sample express button', product.sample, 0);
        if (!paypalOn) expectEqual('product page: no express slot markup with PayPal off', product.slots, 0);
        const mail = await guestCheckout(j, PRODUCTS.inactive, MICHIGAN, 'guest inactive');
        const shown = await offeredRows(page);
        check('checkout: no sample method row', !shown.some((code) => code.startsWith('hyperion_sample')), shown.join(', '));
        const config = await hyperionConfig(page);
        check('checkout: the config carries no sample entry', !(config?.paymentRenderers ?? []).some((e) => (e.method ?? e.pattern ?? '').includes('hyperion_sample')), JSON.stringify((config?.paymentRenderers ?? []).map((e) => e.id)));
        const code = shown.includes('checkmo') ? 'checkmo' : shown[0];
        await selectPayment(j, code);
        await waitForGate(page);
        const result = await placeAndWait(j, mail, 'guest inactive');
        check(`checkout: a plain order is placed (${code})`, result.order !== null, await visibleErrors(page));
        const sample = sampleRequests(j).map((r) => r.url.replace(base, ''));
        check('no request for any sample module during the whole journey', sample.length === 0, sample.slice(0, 5).join(', '));
        const forbidden = builtChunkPatterns(EXTENSION_SOURCES);
        check('the build manifest names every extension chunk', Object.values(forbidden).every(Boolean), Object.entries(forbidden).map(([k, v]) => `${k} ${v}`).join(', '));
        const patterns = Object.values(forbidden).filter(Boolean);
        const chunks = j.requests.filter((r) => patterns.some((re) => re.test(r.url))).map((r) => r.url.replace(base, ''));
        check('no extension runtime chunk during the whole journey', chunks.length === 0, chunks.slice(0, 5).join(', '));
        if (!paypalOn) {
            const expressPatterns = Object.values(builtChunkPatterns(EXPRESS_SOURCES)).filter(Boolean);
            const express = j.requests.filter((r) => expressPatterns.some((re) => re.test(r.url))).map((r) => r.url.replace(base, ''));
            check('no express chunk with PayPal off and no sample button', express.length === 0, express.slice(0, 5).join(', '));
        } else {
            skip('no express chunk', 'PayPal Express is active on this install, its button uses the express slot');
        }
        h.noProblems(j, 'inactive');
    } finally { await j.close(); }
};

await h.runScenarios(scenarios, () => ({ orders }));

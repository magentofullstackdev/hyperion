#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the shipping extension contract with the fake locker carrier of the sample extension module
// (dev/modules/Magentofullstackdev/HyperionSampleExtension).
// Usage: node e2e/pw-shipping-extensions.mjs <baseUrl> <slotDir> [--only guest,customer,load-failure] [--shots dir]
//   node e2e/pw-shipping-extensions.mjs https://shop.example <slotDir>
// <slotDir> is the Magento install directory (docker compose project with the services php-fpm and db).
//
//   guest, customer  selecting the locker method shows the picker inside its row; Place Order is blocked with the
//                    extension's message and the element's validate() puts the focus on the search field; a search
//                    and a pick; the summary names the point; the address editor turns read only and the billing
//                    address is forced separate; the shipping-information request carries
//                    shipping_address.extension_attributes.<locker id key>; a reload restores the pick from the quote;
//                    another method takes the key out of the next request and gives the address back; the order is
//                    placed and the locker id is stored on the order's shipping address
//   load-failure     the picker module answers 404 (page.route): the inline error, Place Order stays blocked, Retry
//                    loads the module once the route is gone
//
// Needs the sample modules (node e2e/install-dev-modules.mjs <slotDir>); the script never installs them. It switches
// the sample module and the locker carrier on for the run and puts both settings back as it found them. Orders
// stay on the install, as for the other scripts. Prints numbered PASS / FAIL lines and a JSON summary, exit code 1
// on any failure, page error, HTTP 5xx or Content Security Policy violation.
// The customer part logs in: clear the customer_login reCAPTCHA type for the run beforehand (see
// docs/development.md), as for pw-suite.mjs.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness, deepActiveElementDescription } from './lib/harness.mjs';
import { requireDevModules } from './lib/dev-modules.mjs';

// ---------------------------------------------------------------- names of the contract and of the sample module
const DEV_MODULES = ['Magentofullstackdev_HyperionSampleExtension'];
const CONFIG = {
    sampleEnabled: 'hyperion_sample_extension/general/enabled',
    carrierActive: 'carriers/hyperionlocker/active',
};
const LOCKER = {
    carrier: 'hyperionlocker',
    method: 'locker',
    tag: 'sample-locker-picker',
    entryId: 'hyperion_sample_locker',
    // The key of shipping_address.extension_attributes and the column of quote_address / sales_order_address.
    attribute: 'hyperion_sample_locker_id',
    pointsRoute: '/hyperionsample/locker/points',
    searchQuery: 'Locker',
    invalidMessage: 'Choose a pickup point.',
};
const SEL = {
    config: '#checkout-config',
    email: '#hc-contact-email',
    field: (mode, name) => `#hc-${mode}-${name}`,
    shippingRadio: (carrier, method) => `#hc-ship-${carrier}-${method}`,
    shippingRow: (carrier, method) => `shipping-method-row:has(#hc-ship-${carrier}-${method})`,
    ratesReady: 'shipping-method-list [data-estimate-state="ready"]',
    checkedRate: 'shipping-method-row input:checked',
    payment: (code) => `#hc-pay-${code}`,
    placeOrder: '[data-hyperion-place-order] button',
    placeOrderHint: '[data-place-order-hint]',
    sameAsShipping: 'input[name="billing_same_as_shipping"]',
    summaryTotals: 'summary-totals',
    errors: '[data-error-banner], hc-section-status [data-section-status]',
    picker: `sample-locker-picker`,
    pickerSearch: 'sample-locker-picker input[data-sample-locker-search]',
    pickerSubmit: 'sample-locker-picker button[data-sample-locker-submit]',
    pickerResult: 'sample-locker-picker button[data-sample-locker-point]',
    // The host's own state while a required module could not be loaded.
    loadError: '[data-shipping-extension-failed]',
    retry: '[data-shipping-extension-failed] button',
    addressReplaced: '[data-shipping-address-replaced]',
    summaryLine: 'summary-totals [data-shipping-extension-summary]',
};
const PHRASES = {
    loadFailed: 'This delivery option could not be loaded.',
    retry: /retry|try again/i,
};
// The sample module's master switch also turns on its generic checkout extension: a required confirmation box.
const SAMPLE_CONFIRMATION = 'sample-checkout-confirmation input[data-sample-confirmation]';
const ALTERNATIVE_RATE = { carrier: 'flatrate', method: 'flatrate' };
const PAYMENT_CODE = 'checkmo';
const CUSTOMER = { email: 'roni_cost@example.com', password: 'roni_cost3@example.com' };
const PRODUCTS = { guest: '/fusion-backpack.html', customer: '/push-it-messenger-bag.html', failure: '/joust-duffle-bag.html' };
const MICHIGAN = { firstname: 'Locker', lastname: 'Checker', country: 'US', street: '1 Locker Street', postcode: '49628', city: 'Calder', region: 'Michigan', telephone: '5552293326' };
const FIXTURE = 'sample-locker-order.php';

// ---------------------------------------------------------------- run setup
const h = await createHarness({ usage: '<baseUrl> <slotDir> [--only guest,customer,load-failure] [--shots dir]', parts: ['guest', 'customer', 'load-failure'] });
const { base, u, check, expectEqual, sql, quote } = h;
requireDevModules(h.slotDir, DEV_MODULES);
const RUN = Date.now();
const FIXTURE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', FIXTURE);
const orders = [];

// Runs in every page: the first moment the locker rate radio is checked (Lit sets the property, not the attribute).
const PROBE_INTERVAL_MS = 25;
function lockerProbe([radio, interval]) {
    window.__e2eLockerCheckedAt = null;
    const timer = setInterval(() => {
        if (document.querySelector(radio)?.checked) { window.__e2eLockerCheckedAt = Date.now(); clearInterval(timer); }
    }, interval);
}
const journey = (options = {}) => h.newJourney({ ...options, initScripts: [{ content: `(${lockerProbe})(${JSON.stringify([SEL.shippingRadio(LOCKER.carrier, LOCKER.method), PROBE_INTERVAL_MS])})` }] });

// ---------------------------------------------------------------- checkout helpers
async function addToCart(page, productPath) {
    await page.goto(base + u(productPath), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#product_addtocart_form button[type="submit"]', { timeout: 30000 });
    await page.waitForFunction(() => window.htmx !== undefined && document.querySelector('#product_addtocart_form input[name="form_key"]')?.value, null, { timeout: 30000 }).catch(() => {});
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && /\/checkout\/cart\/add/.test(r.url()), { timeout: 40000 }).catch(() => null),
        page.click('#product_addtocart_form button[type="submit"]'),
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
    if (await page.locator(`select${id('region_id')}`).count()) await page.selectOption(id('region_id'), { label: address.region });
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
const shippingRequests = (j, mark) => j.bodiesSince(mark).filter((b) => /\/shipping-information(\?|$)/.test(b.url) && b.body);
/** The locker key of a recorded shipping-information request (undefined when absent). */
const lockerKeyOf = (request) => request?.body?.addressInformation?.shipping_address?.extension_attributes?.[LOCKER.attribute];
const lastOrder = (email) => {
    const row = sql(`select entity_id, increment_id, ifnull(shipping_method, '') from sales_order where customer_email = ${quote(email)} order by entity_id desc limit 1`);
    if (row === '') return null;
    const [id, increment, method] = row.split('\t');
    return { id: Number(id), increment, method };
};
/** The active quote behind the journey's REST calls (masked id for a guest, the customer's active quote otherwise). */
function quoteIdOf(j) {
    const masked = [...j.bodies].reverse().map((b) => b.url.match(/\/guest-carts\/([^/?]+)/)?.[1]).find(Boolean);
    if (masked) return sql(`select quote_id from quote_id_mask where masked_id = ${quote(masked)}`);
    return sql(`select q.entity_id from quote q join customer_entity c on c.entity_id = q.customer_id where c.email = ${quote(CUSTOMER.email)} and q.is_active = 1 order by q.entity_id desc limit 1`);
}
function storedLockerOnQuote(j) {
    try {
        const quoteId = quoteIdOf(j);
        return { quoteId, value: quoteId === '' ? null : sql(`select ifnull(${LOCKER.attribute}, '') from quote_address where quote_id = ${Number(quoteId)} and address_type = 'shipping'`) };
    } catch (e) {
        return { quoteId: null, value: null, error: String(e.message).split('\n')[0].slice(0, 160) };
    }
}
function storedLockerOnOrder(order) {
    if (existsSync(FIXTURE_FILE)) {
        h.copyToPhp(FIXTURE_FILE);
        const out = h.compose('php-fpm', `cd /var/www/html && php /tmp/${FIXTURE} ${quote(order.increment)}`, 'www-data');
        return { source: FIXTURE, value: out.trim().split('\n').pop()?.trim() ?? '' };
    }
    return { source: 'sales_order_address', value: sql(`select ifnull(${LOCKER.attribute}, '') from sales_order_address where parent_id = ${order.id} and address_type = 'shipping'`) };
}
/** Reads the editor state: is the typed shipping address still editable, and is billing forced separate? */
const addressState = (page) => page.evaluate(([street, same, billingFirst]) => {
    const input = document.querySelector(street);
    const editable = input !== null && !input.readOnly && !input.disabled && input.closest('[inert], [aria-readonly="true"]') === null && input.getClientRects().length > 0;
    const box = document.querySelector(same);
    return {
        streetEditable: editable,
        streetValue: input?.value ?? null,
        sameAsShippingOffered: box !== null && box.getClientRects().length > 0,
        billingFormShown: document.querySelector(billingFirst)?.getClientRects().length > 0,
        savedCardChecked: document.querySelector('input[name="saved-shipping-address"]:checked') !== null,
    };
}, [SEL.field('shipping', 'street_0'), SEL.sameAsShipping, SEL.field('billing', 'firstname')]);
const pickerValue = (page) => page.evaluate((tag) => {
    const el = document.querySelector(tag);
    return el ? { connected: el.isConnected, value: el.value ?? null, defined: customElements.get(tag) !== undefined } : null;
}, LOCKER.tag);

const checkedPayment = (page) => page.evaluate(() => document.querySelector('payment-method-row input:checked')?.id ?? 'none');
/** Check / Money order: a method that leaves Place Order to the checkout (a wallet would replace the button). */
async function selectPayment(j) {
    await j.page.waitForSelector(SEL.payment(PAYMENT_CODE), { timeout: 15000 }).catch(() => {});
    await j.page.check(SEL.payment(PAYMENT_CODE)).catch(() => {});
    await j.settled(1200);
}
async function selectRate(j, carrier, method) {
    await j.page.waitForSelector(SEL.shippingRadio(carrier, method), { timeout: 40000 });
    await j.page.check(SEL.shippingRadio(carrier, method));
    await j.settled(1200);
}

/** Search and pick the first point; answers the point's id as the points endpoint gave it. */
async function pickFirstPoint(j) {
    const { page } = j;
    const search = page.locator(SEL.pickerSearch).first();
    const [answer] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(LOCKER.pointsRoute), { timeout: 20000 }).catch(() => null),
        (async () => { await search.fill(LOCKER.searchQuery); await page.locator(SEL.pickerSubmit).first().click(); })(),
    ]);
    let points = null;
    try { points = answer ? await answer.json() : null; } catch { /* not JSON */ }
    const list = Array.isArray(points) ? points : (points?.points ?? points?.items ?? []);
    check(`the search asks ${LOCKER.pointsRoute} and lists points`, answer !== null && answer.status() === 200 && list.length > 0,
        answer ? `HTTP ${answer.status()}, ${list.length} points: ${JSON.stringify(list).slice(0, 200)}` : 'no request to the points endpoint');
    const result = page.locator(SEL.pickerResult).first();
    await result.waitFor({ timeout: 10000 }).catch(() => {});
    const resultId = await result.getAttribute('data-sample-locker-point').catch(() => null);
    const mark = j.mark();
    await result.click().catch(() => {});
    await j.settled(1500);
    const first = list[0] ?? {};
    return { id: resultId ?? String(first.id ?? first.locker_id ?? ''), label: String(first.name ?? first.label ?? first.title ?? ''), mark };
}

/** The whole locker journey on an open checkout whose shipping address is complete and whose rates are listed. */
async function lockerJourney(j, who, email, fillBilling) {
    const { page } = j;
    const typedStreet = await page.evaluate((sel) => document.querySelector(sel)?.value ?? null, SEL.field('shipping', 'street_0'));
    const config = await hyperionConfig(page);
    const entry = (config?.shippingExtensions ?? []).find((e) => e.tag === LOCKER.tag);
    check(`${who}: the checkout config carries the locker entry (match ${LOCKER.carrier}, slot below-method, required)`,
        entry !== undefined && entry.id === LOCKER.entryId && entry.match?.carrier === LOCKER.carrier && entry.slot === 'below-method' && entry.required === true,
        JSON.stringify(entry ?? (config?.shippingExtensions ?? null)).slice(0, 300));
    check(`${who}: the locker rate is offered`, await page.locator(SEL.shippingRadio(LOCKER.carrier, LOCKER.method)).count() === 1,
        await page.evaluate(() => [...document.querySelectorAll('shipping-method-row input[type="radio"]')].map((i) => i.id).join(', ')));
    // The checkout may preselect the locker rate itself (the cheapest one): the module must wait for that moment.
    const selectedAt = await page.evaluate(() => window.__e2eLockerCheckedAt ?? null);
    const moduleRequests = j.requests.filter((r) => entry?.moduleUrl && r.url.startsWith(entry.moduleUrl.split('?')[0]));
    check(`${who}: the picker module is not requested before its method is selected`,
        moduleRequests.every((r) => selectedAt !== null && r.at >= selectedAt - PROBE_INTERVAL_MS),
        `module requests at ${moduleRequests.map((r) => r.at).join(', ') || 'none'}, locker rate checked at ${selectedAt ?? 'not yet'}`);

    await selectRate(j, LOCKER.carrier, LOCKER.method);
    await j.settled(1500);
    // Selectable rows only: in developer mode the list also carries disabled diagnostic rows of unsupported methods.
    // The rate's save is held until a point is picked (the carrier refuses the rate without one), so the payment step
    // shows what it shows for any shopper whose shipping method is not confirmed yet: the methods the quote already
    // knew, or, on a new quote, the "select a shipping method" line. No error either way.
    const beforePick = await page.evaluate(() => ({
        payments: [...document.querySelectorAll('payment-method-row input[id^="hc-pay-"]')].filter((i) => i.closest('[data-payment-unsupported]') === null).length,
        waiting: document.querySelector('[data-payment-methods-waiting]') !== null,
        none: document.querySelector('[data-payment-methods-none]') !== null,
    }));
    check(`${who}: selecting the locker rate before a point is picked shows no error and the payment step waits for the shipping method`,
        (await visibleErrors(page)) === '' && !beforePick.none && (beforePick.payments > 0 || beforePick.waiting),
        `errors: ${await visibleErrors(page) || 'none'}; ${JSON.stringify(beforePick)}`);
    await selectPayment(j);
    const picker = page.locator(`${SEL.shippingRow(LOCKER.carrier, LOCKER.method)} ${SEL.picker}`);
    await picker.first().waitFor({ timeout: 20000 }).catch(() => {});
    check(`${who}: selecting the locker method shows the picker inside the selected row`, await picker.count() === 1,
        `${await page.locator(SEL.picker).count()} pickers on the page, ${await picker.count()} inside the locker row`);
    const state = await pickerValue(page);
    check(`${who}: the picker element is defined and received its value property (null before a pick)`, state?.defined === true && (state.value === null || typeof state.value === 'object'), JSON.stringify(state));

    check(`${who}: Place Order is blocked while no point is picked`, !(await gateOpen(page)));
    await page.locator(SEL.placeOrder).click({ force: true }).catch(() => {});
    await page.waitForSelector(SEL.placeOrderHint, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const hint = await text(page, SEL.placeOrderHint);
    const focused = await page.evaluate(deepActiveElementDescription);
    const button = await page.evaluate((sel) => { const b = document.querySelector(sel); return b ? { ariaDisabled: b.getAttribute('aria-disabled'), disabled: b.disabled } : null; }, SEL.placeOrder);
    check(`${who}: an early Place Order gives the extension's message "${LOCKER.invalidMessage}"`, String(hint).includes(LOCKER.invalidMessage),
        `hint: ${hint}; button ${JSON.stringify(button)}; payment ${await checkedPayment(page)}; errors ${await visibleErrors(page)}`);
    if (!String(hint).includes(LOCKER.invalidMessage)) await h.shot(page, `locker-early-press-${who}`);
    check(`${who}: validate() of the picker puts the focus on its search field`, focused !== null && (focused.host === LOCKER.tag || (await page.locator(`${SEL.picker} :focus`).count()) > 0)
        && ['search', 'text', ''].includes(focused.type) && focused.tag === 'input', JSON.stringify(focused));
    check(`${who}: no order request left while the gate was closed`, !j.bodies.some((b) => /\/payment-information(\?|$)/.test(b.url)));

    const point = await pickFirstPoint(j);
    const afterPick = shippingRequests(j, point.mark);
    const sent = afterPick.map(lockerKeyOf).filter((v) => v !== undefined);
    check(`${who}: the shipping-information request after the pick carries shipping_address.extension_attributes.${LOCKER.attribute}`,
        sent.length > 0 && String(sent[sent.length - 1]) === String(point.id),
        `picked ${point.id}; requests ${afterPick.length}, values ${JSON.stringify(sent)}; last body ${JSON.stringify(afterPick.at(-1)?.body?.addressInformation?.shipping_address ?? null).slice(0, 220)}`);
    const summary = await text(page, SEL.summaryTotals);
    check(`${who}: the summary names the picked point`, summary !== null && point.label !== '' && summary.includes(point.label), `point "${point.label}", summary: ${String(summary).slice(0, 200)}`);
    const editor = await addressState(page);
    check(`${who}: the typed shipping address is read only while a point is picked`, editor.streetEditable === false, JSON.stringify(editor));
    check(`${who}: the billing address is forced separate (no "same as shipping" box)`, editor.sameAsShippingOffered === false, JSON.stringify(editor));
    if (fillBilling && editor.billingFormShown) await fillAddress(page, 'billing', MICHIGAN);
    await j.settled(1500);
    const stored = storedLockerOnQuote(j);
    expectEqual(`${who}: the quote's shipping address stores the picked point (${LOCKER.attribute}, quote ${stored.quoteId})`, stored.error ?? stored.value, String(point.id));

    // A reload restores the pick from the server value.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector(SEL.placeOrder, { timeout: 30000 });
    await page.waitForFunction((tag) => document.querySelector(tag)?.value != null, LOCKER.tag, { timeout: 25000 }).catch(() => {});
    const restored = await pickerValue(page);
    expectEqual(`${who}: after a reload the picker gets the point back through value.address`, restored?.value?.address?.[LOCKER.attribute] ?? null, point.id);
    const summaryAfterReload = await text(page, SEL.summaryTotals);
    check(`${who}: after a reload the summary still names the point`, point.label !== '' && String(summaryAfterReload).includes(point.label), String(summaryAfterReload).slice(0, 200));

    // Another method: the key leaves the next request and the address comes back.
    // The reloaded page saves the restored address once more (still with the point): let it finish first.
    await j.settled(1500);
    const mark = j.mark();
    await selectRate(j, ALTERNATIVE_RATE.carrier, ALTERNATIVE_RATE.method);
    await j.settled(1800);
    const switched = shippingRequests(j, mark);
    check(`${who}: switching to ${ALTERNATIVE_RATE.carrier} sends shipping-information without the locker key`,
        switched.length > 0 && switched.every((b) => lockerKeyOf(b) === undefined),
        `${switched.length} requests; extension_attributes ${JSON.stringify(switched.map((b) => b.body?.addressInformation?.shipping_address?.extension_attributes ?? null))}`);
    const given = await addressState(page);
    check(`${who}: switching away gives the address editor back with the typed or the saved address`, typedStreet === null ? (given.savedCardChecked === true || (given.streetEditable === true && String(given.streetValue ?? '').trim() !== '')) : (given.streetEditable === true && given.streetValue === typedStreet), `typed ${typedStreet}; ${JSON.stringify(given)}`);
    check(`${who}: switching away offers "same as shipping" again`, given.sameAsShippingOffered === true, JSON.stringify(given));
    check(`${who}: the picker is gone with its method`, await page.locator(SEL.picker).count() === 0);

    // Back to the locker: the point picked before is offered again and counts as complete.
    await selectRate(j, LOCKER.carrier, LOCKER.method);
    await page.locator(SEL.picker).first().waitFor({ timeout: 20000 }).catch(() => {});
    await selectPayment(j);
    await page.locator(SAMPLE_CONFIRMATION).first().check().catch(() => {});
    const billing = await addressState(page);
    if (fillBilling && billing.billingFormShown) await fillAddress(page, 'billing', MICHIGAN);
    await j.settled(1500);
    const value = await pickerValue(page);
    let finalId = value?.value?.address?.[LOCKER.attribute] ?? null;
    const reopened = await waitForGate(page, true, 10000);
    let reopenHint = null;
    if (!reopened) {
        await page.locator(SEL.placeOrder).click({ force: true }).catch(() => {});
        await page.waitForSelector(SEL.placeOrderHint, { timeout: 10000 }).catch(() => {});
        reopenHint = await text(page, SEL.placeOrderHint);
    }
    check(`${who}: switching back to the locker rate restores the picked point and lets the order through`, finalId === String(point.id) && reopened,
        `picker value ${JSON.stringify(value?.value ?? null)}; read only editor ${!(await addressState(page)).streetEditable}; hint after a press: ${reopenHint}`);
    if (!reopened) {
        // Pick again so the rest of the journey (order, stored id) is still verified.
        finalId = (await pickFirstPoint(j)).id;
        if (fillBilling && (await addressState(page)).billingFormShown) await fillAddress(page, 'billing', MICHIGAN);
        await j.settled(1200);
    }
    const usable = await waitForGate(page);
    check(`${who}: Place Order usable with a point picked and a billing address`, usable, `${await text(page, SEL.placeOrderHint)} ${await visibleErrors(page)} payment ${await checkedPayment(page)}`);
    if (!usable) { await h.shot(page, `locker-gate-${who}`); return; }
    const before = lastOrder(email)?.id ?? 0;
    await page.locator(SEL.placeOrder).click();
    await page.waitForURL((url) => url.toString().includes('/checkout/onepage/success'), { timeout: 60000 }).catch(() => {});
    const order = lastOrder(email);
    const placed = page.url().includes('/checkout/onepage/success') && order !== null && order.id > before;
    check(`${who}: order placed with the locker method`, placed && order.method === `${LOCKER.carrier}_${LOCKER.method}`,
        placed ? `order ${order.increment}, ${order.method}` : `${page.url().replace(base, '')} ${await visibleErrors(page)}`);
    if (!placed) { await h.shot(page, `locker-order-failed-${who}`); return; }
    orders.push(`${order.increment} (${who}, ${email})`);
    const onOrder = storedLockerOnOrder(order);
    expectEqual(`${who}: the order's shipping address stores the locker id (read through ${onOrder.source})`, onOrder.value, String(finalId));
}

// ---------------------------------------------------------------- scenarios
const sampleOn = () => {
    const overrides = h.scopedOverrides(Object.values(CONFIG));
    if (overrides.length) console.log(`note: settings stored for a website or a store view win over this run's default scope values: ${overrides.join('; ')}`);
    return h.withConfig('sample extension and locker carrier', { [CONFIG.sampleEnabled]: '1', [CONFIG.carrierActive]: '1' });
};

await h.runScenarios({
    guest: async () => {
        sampleOn();
        const j = await journey();
        try {
            const email = `e2e.shipping-extensions.guest.${RUN}@example.com`;
            await addToCart(j.page, PRODUCTS.guest);
            await openCheckout(j);
            await j.page.fill(SEL.email, email);
            await j.page.locator(SEL.email).blur();
            await fillAddress(j.page, 'shipping', MICHIGAN);
            check('guest: rates for the typed address', await waitForRates(j.page));
            await j.settled();
            await lockerJourney(j, 'guest', email, true);
            h.noProblems(j, 'guest');
        } finally { await j.close(); }
    },
    customer: async () => {
        sampleOn();
        const j = await journey();
        try {
            await login(j.page);
            await addToCart(j.page, PRODUCTS.customer);
            await openCheckout(j);
            check('customer: rates for the default saved address', await waitForRates(j.page));
            await j.settled();
            await lockerJourney(j, 'customer', CUSTOMER.email, true);
            h.noProblems(j, 'customer');
        } finally { await j.close(); }
    },
    'load-failure': async () => {
        sampleOn();
        const j = await journey();
        const { page } = j;
        try {
            await addToCart(page, PRODUCTS.failure);
            await openCheckout(j);
            // The locker rate may be preselected as soon as rates arrive: the route goes in before the address.
            const entry = ((await hyperionConfig(page))?.shippingExtensions ?? []).find((e) => e.tag === LOCKER.tag);
            if (!entry?.moduleUrl) { check('the locker entry carries a module URL', false, JSON.stringify(entry ?? null)); return; }
            const pattern = entry.moduleUrl.split('?')[0];
            const failing = (url) => url.toString().startsWith(pattern);
            let refused = 0;
            await page.route(failing, (route) => { refused++; return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }); });
            await page.fill(SEL.email, `e2e.shipping-extensions.failure.${RUN}@example.com`);
            await page.locator(SEL.email).blur();
            await fillAddress(page, 'shipping', MICHIGAN);
            check('rates for the typed address', await waitForRates(page));
            await selectRate(j, LOCKER.carrier, LOCKER.method);
            await page.waitForFunction((phrase) => document.body.innerText.includes(phrase), PHRASES.loadFailed, { timeout: 20000 }).catch(() => {});
            const shown = await page.evaluate((phrase) => document.body.innerText.includes(phrase), PHRASES.loadFailed);
            check(`a module answering 404 shows "${PHRASES.loadFailed}" in the row`, refused > 0 && shown, `${refused} refused requests of ${pattern}; error box: ${await text(page, SEL.loadError)}`);
            check('the picker element is not rendered after the failed load', await page.evaluate((tag) => customElements.get(tag) === undefined, LOCKER.tag));
            check('Place Order stays blocked after the failed load', !(await gateOpen(page)), await text(page, SEL.placeOrderHint));
            await page.unroute(failing);
            const retry = page.locator(SEL.retry, { hasText: PHRASES.retry }).first();
            const retryMark = j.mark();
            await retry.click().catch(() => {});
            await page.locator(SEL.picker).first().waitFor({ timeout: 20000 }).catch(() => {});
            const retried = j.requestsSince(retryMark).filter((r) => failing(r.url));
            check('Retry loads the module again (a new URL, so the failed fetch is not reused) and renders the picker',
                await page.locator(SEL.picker).count() === 1 && retried.length > 0 && retried.every((r) => r.url !== entry.moduleUrl),
                `requests after Retry: ${retried.map((r) => r.url.replace(base, '')).join(', ')}`);
            check('the gate is still closed until a point is picked', !(await gateOpen(page)));
            h.noProblems(j, 'load failure');
        } finally { await j.close(); }
    },
}, () => ({ orders }));

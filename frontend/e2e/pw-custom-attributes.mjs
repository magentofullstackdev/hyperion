#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Live check of the custom customer and address attributes on the account forms. The fixture
// (e2e/fixtures/custom-attributes-fixture.php) creates a text, a select and a required text attribute on the customer
// and a text attribute on the customer address, assigned to the storefront forms; then, as a new customer: the
// registration form renders the three customer fields with their labels and rules, the empty required field blocks
// the submit in the browser (no request is sent), the registration saves the values, the account edit form shows them
// after a reload and saves a change, a new address saves its attribute and the address form shows it after a reload.
// The fixture is removed and the customer of the run deleted at the end.
// Usage: node e2e/pw-custom-attributes.mjs <baseUrl> <slotDir> [--shots dir]
//   node e2e/pw-custom-attributes.mjs https://shop.example <slotDir>
// <slotDir> is the Magento install directory (docker compose project with the services php-fpm and db).
// The reCAPTCHA types of the registration and account edit forms are cleared for the run and put back as found (a
// headless browser scores too low for reCAPTCHA v3). Prints numbered PASS / FAIL lines and a JSON summary, exit code 1
// on any failure, page error, HTTP 5xx or Content Security Policy violation.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness, sleep } from './lib/harness.mjs';

const h = await createHarness({ usage: '<baseUrl> <slotDir> [--shots dir]', parts: ['attributes'] });
const { base, check, expectEqual, compose, copyToPhp, flushCaches, onCleanup, withConfig, newJourney, shot, noProblems, runScenarios } = h;

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ATTRIBUTE_FIXTURE = 'custom-attributes-fixture.php';
const CUSTOMER_FIXTURE = 'customer-fixture.php';
const ATTR = { nickname: 'hyperion_e2e_nickname', channel: 'hyperion_e2e_channel', memberCode: 'hyperion_e2e_member_code', gateCode: 'hyperion_e2e_gate_code' };
const stamp = Date.now();
const CUSTOMER = { firstname: 'Ada', lastname: 'Attributes', email: `hyperion.e2e.attributes.${stamp}@example.com`, password: `Hyp-${stamp.toString(36)}-Attr9!` };
const ADDRESS = { telephone: '5552293326', street: '6146 Honey Bluff Parkway', city: 'Calder', country: 'US', region: 'Michigan', postcode: '49628' };

const lastJson = (output) => JSON.parse(String(output).trim().split('\n').pop());
const runFixture = (name, fixtureArgs) => lastJson(compose('php-fpm', `cd /var/www/html && php /tmp/${name} /var/www/html ${fixtureArgs}`, 'www-data'));

// A field of a form by its name: present, its label, its rules and its value as the page shows it.
const field = (page, formSelector, name) => page.evaluate(({ formSelector, name }) => {
    const form = document.querySelector(formSelector);
    const el = form?.querySelector(`[name="${name}"]`);
    if (!el) return null;
    const label = el.id ? form.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
    const selected = el.localName === 'select' ? el.options[el.selectedIndex] : null;
    return {
        tag: el.localName,
        type: el.getAttribute('type') ?? '',
        label: (label?.textContent ?? '').replace(/\s+/g, ' ').replace(/\*/g, '').trim(),
        required: el.required,
        minlength: el.getAttribute('minlength'),
        maxlength: el.getAttribute('maxlength'),
        value: el.localName === 'select' ? (selected?.textContent ?? '').trim() : el.value,
        visible: el.getBoundingClientRect().height > 0,
    };
}, { formSelector, name });

await runScenarios({
    attributes: async () => {
        copyToPhp(path.join(FIXTURE_DIR, ATTRIBUTE_FIXTURE));
        copyToPhp(path.join(FIXTURE_DIR, CUSTOMER_FIXTURE));
        onCleanup('fixture files removed', () => compose('php-fpm', `rm -f /tmp/${ATTRIBUTE_FIXTURE} /tmp/${CUSTOMER_FIXTURE}`));
        onCleanup('custom attributes removed', () => { console.log('attributes fixture:', JSON.stringify(runFixture(ATTRIBUTE_FIXTURE, '--remove'))); flushCaches(); });
        const applied = runFixture(ATTRIBUTE_FIXTURE, '--apply');
        check('fixture: the three customer attributes and the address attribute exist', applied.applied === true && Object.values(ATTR).every((code) => applied.attributes?.[code]?.id > 0), JSON.stringify(applied).slice(0, 300));
        const channelOptions = applied.attributes?.[ATTR.channel]?.options ?? [];
        onCleanup('customer of the run deleted', () => console.log('customer fixture:', JSON.stringify(runFixture(CUSTOMER_FIXTURE, `${CUSTOMER.email} --remove`))));
        withConfig('reCAPTCHA of the registration and account edit forms off', { 'recaptcha_frontend/type_for/customer_create': null, 'recaptcha_frontend/type_for/customer_edit': null });

        const j = await newJourney();
        const { page } = j;
        const posts = [];
        page.on('request', (r) => { if (r.method() === 'POST' && /\/customer\/account\/createpost/i.test(r.url())) posts.push(r.url()); });

        // ---- registration
        const register = 'form#form-validate';
        await page.goto(base + '/customer/account/create/', { waitUntil: 'networkidle' });
        const nickname = await field(page, register, ATTR.nickname);
        const channel = await field(page, register, ATTR.channel);
        const memberCode = await field(page, register, ATTR.memberCode);
        check('registration: the text attribute is a labeled text field with its maximum length', nickname?.visible && nickname.tag === 'input' && nickname.label === 'Nickname' && !nickname.required && nickname.maxlength === '40', JSON.stringify(nickname));
        check('registration: the select attribute is a labeled select with its options', channel?.visible && channel.tag === 'select' && channel.label === 'Preferred channel' && channelOptions.length === 2, JSON.stringify({ channel, channelOptions }));
        check('registration: the required attribute is a labeled required field with its length rules', memberCode?.visible && memberCode.tag === 'input' && memberCode.label === 'Member code' && memberCode.required && memberCode.minlength === '3' && memberCode.maxlength === '20', JSON.stringify(memberCode));
        check('registration: no address attribute on the form without address fields', (await page.locator(`${register} [name="${ATTR.gateCode}"]`).count()) === 0);

        await page.fill(`${register} [name="firstname"]`, CUSTOMER.firstname);
        await page.fill(`${register} [name="lastname"]`, CUSTOMER.lastname);
        await page.fill(`${register} [name="email"]`, CUSTOMER.email);
        await page.fill(`${register} [name="password"]`, CUSTOMER.password);
        await page.fill(`${register} [name="password_confirmation"]`, CUSTOMER.password);
        await page.fill(`${register} [name="${ATTR.nickname}"]`, 'Ada nickname');
        await page.selectOption(`${register} [name="${ATTR.channel}"]`, { label: 'Phone' });
        await page.click(`${register} button[type="submit"]`);
        await sleep(1500);
        const blocked = await page.evaluate(({ form, name }) => {
            const el = document.querySelector(`${form} [name="${name}"]`);
            return { missing: !!el?.validity.valueMissing, url: location.pathname };
        }, { form: register, name: ATTR.memberCode });
        check('registration: the empty required attribute blocks the submit in the browser, nothing is posted', blocked.missing && /\/customer\/account\/create/.test(blocked.url) && posts.length === 0, JSON.stringify({ ...blocked, posts: posts.length }));
        await page.fill(`${register} [name="${ATTR.memberCode}"]`, 'HYP-123');
        await Promise.all([
            page.waitForURL((url) => !/\/customer\/account\/create/.test(url.pathname), { timeout: 30000 }).catch(() => {}),
            page.click(`${register} button[type="submit"]`),
        ]);
        await page.waitForLoadState('networkidle').catch(() => {});
        await shot(page, 'custom-attributes-registered');
        check('registration: the customer is created and signed in', /\/customer\/account\/?(index\/?)?$/.test(new URL(page.url()).pathname) && posts.length === 1, page.url().replace(base, ''));

        // ---- account edit: the values after a reload, then a change
        const edit = 'form#form-validate';
        await page.goto(base + '/customer/account/edit/', { waitUntil: 'networkidle' });
        const saved = {
            nickname: (await field(page, edit, ATTR.nickname))?.value,
            channel: (await field(page, edit, ATTR.channel))?.value,
            memberCode: (await field(page, edit, ATTR.memberCode))?.value,
        };
        expectEqual('account edit: the form shows the values saved at registration', saved, { nickname: 'Ada nickname', channel: 'Phone', memberCode: 'HYP-123' });
        await page.fill(`${edit} [name="${ATTR.nickname}"]`, 'Ada edited');
        await page.selectOption(`${edit} [name="${ATTR.channel}"]`, { label: 'Email' });
        await page.fill(`${edit} [name="${ATTR.memberCode}"]`, 'HYP-456');
        await Promise.all([
            page.waitForURL((url) => !/\/customer\/account\/edit/.test(url.pathname), { timeout: 30000 }).catch(() => {}),
            page.click(`${edit} button[type="submit"]`),
        ]);
        await page.waitForLoadState('networkidle').catch(() => {});
        check('account edit: the save returns to the account page', /\/customer\/account\/?(index\/?)?$/.test(new URL(page.url()).pathname), page.url().replace(base, ''));
        await page.goto(base + '/customer/account/edit/', { waitUntil: 'networkidle' });
        const edited = {
            nickname: (await field(page, edit, ATTR.nickname))?.value,
            channel: (await field(page, edit, ATTR.channel))?.value,
            memberCode: (await field(page, edit, ATTR.memberCode))?.value,
        };
        expectEqual('account edit: the changed values are there after a reload', edited, { nickname: 'Ada edited', channel: 'Email', memberCode: 'HYP-456' });

        // ---- a new address with its attribute
        const addressForm = 'form[action*="customer/address/formPost"]';
        await page.goto(base + '/customer/address/new/', { waitUntil: 'networkidle' });
        const gate = await field(page, addressForm, ATTR.gateCode);
        check('new address: the address attribute is a labeled text field with its maximum length', gate?.visible && gate.tag === 'input' && gate.label === 'Gate code' && gate.maxlength === '20', JSON.stringify(gate));
        check('new address: no customer attribute on the address form', (await page.locator(`${addressForm} [name="${ATTR.memberCode}"]`).count()) === 0);
        if (await page.locator(`${addressForm} [name="telephone"]`).count()) await page.fill(`${addressForm} [name="telephone"]`, ADDRESS.telephone);
        await page.fill(`${addressForm} [name="street[0]"]`, ADDRESS.street);
        await page.fill(`${addressForm} [name="city"]`, ADDRESS.city);
        await page.selectOption(`${addressForm} [name="country_id"]`, ADDRESS.country);
        await sleep(500);
        await page.selectOption(`${addressForm} [name="region_id"]`, { label: ADDRESS.region }).catch(() => {});
        await page.fill(`${addressForm} [name="postcode"]`, ADDRESS.postcode);
        if (gate) await page.fill(`${addressForm} [name="${ATTR.gateCode}"]`, 'G-42');
        await Promise.all([
            page.waitForURL((url) => !/\/customer\/address\/new/.test(url.pathname), { timeout: 30000 }).catch(() => {}),
            page.click(`${addressForm} button[type="submit"]`),
        ]);
        await page.waitForLoadState('networkidle').catch(() => {});
        const addressId = h.sql(`select a.entity_id from customer_address_entity a join customer_entity c on c.entity_id = a.parent_id where c.email = ${h.quote(CUSTOMER.email)} order by a.entity_id desc limit 1`);
        check('new address: the address is saved', /^\d+$/.test(addressId), `${page.url().replace(base, '')} address ${addressId || 'none'}`);
        if (/^\d+$/.test(addressId)) {
            await page.goto(base + `/customer/address/edit/id/${addressId}/`, { waitUntil: 'networkidle' });
            expectEqual('address edit: the address attribute shows the saved value after a reload', (await field(page, addressForm, ATTR.gateCode))?.value, 'G-42');
        }
        await shot(page, 'custom-attributes-address');
        noProblems(j, 'custom attributes');
        await j.close();
    },
});

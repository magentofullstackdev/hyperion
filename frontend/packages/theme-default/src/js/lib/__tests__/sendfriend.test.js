// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { installSendFriend } from '../sendfriend.js';

const row = (i, open) => `
<div data-hyperion-sendfriend-recipient ${open ? '' : 'hidden'}>
  <button type="button" data-hyperion-sendfriend-remove ${open ? '' : 'hidden'}>Remove</button>
  <input type="text" name="recipients[name][${i}]" required ${open ? '' : 'disabled'}>
  <input type="email" name="recipients[email][${i}]" required ${open ? '' : 'disabled'}>
</div>`;
const markup = (max = 3, open = 1) => `
<div data-hyperion-sendfriend>
  <form>
    ${Array.from({ length: max }, (_, i) => row(i, i < open)).join('')}
    <button type="button" data-hyperion-sendfriend-add ${open >= max ? 'hidden' : ''}>Add</button>
  </form>
</div>`;

const rows = () => [...document.querySelectorAll('[data-hyperion-sendfriend-recipient]')];
const openRows = () => rows().filter((r) => !r.hidden);
const add = () => document.querySelector('[data-hyperion-sendfriend-add]');
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

describe('sendfriend recipient rows', () => {
    let uninstall;
    beforeEach(() => {
        document.body.innerHTML = markup();
        uninstall = installSendFriend(document);
    });
    afterEach(() => {
        uninstall();
        document.body.innerHTML = '';
    });

    test('the first row is open, the add button shown, no remove button while one row is open', () => {
        expect(openRows()).toHaveLength(1);
        expect(add().hidden).toBe(false);
        expect(rows()[0].querySelector('[data-hyperion-sendfriend-remove]').hidden).toBe(true);
    });

    test('Add reveals the next row, enables its fields and focuses the first one', () => {
        click(add());
        expect(openRows()).toHaveLength(2);
        const second = rows()[1];
        expect([...second.querySelectorAll('input')].every((f) => !f.disabled)).toBe(true);
        expect(document.activeElement).toBe(second.querySelector('input'));
        expect(rows()[0].querySelector('[data-hyperion-sendfriend-remove]').hidden).toBe(false);
    });

    test('the add button hides once every row is open', () => {
        click(add());
        click(add());
        expect(openRows()).toHaveLength(3);
        expect(add().hidden).toBe(true);
        click(add());
        expect(openRows()).toHaveLength(3);
    });

    test('Remove hides the row, disables and clears its fields, and brings the add button back', () => {
        click(add());
        click(add());
        const second = rows()[1];
        second.querySelector('input[type="email"]').value = 'friend@example.com';
        click(second.querySelector('[data-hyperion-sendfriend-remove]'));
        expect(second.hidden).toBe(true);
        expect(second.querySelector('input[type="email"]').disabled).toBe(true);
        expect(second.querySelector('input[type="email"]').value).toBe('');
        expect(openRows()).toHaveLength(2);
        expect(add().hidden).toBe(false);
        expect(document.activeElement).toBe(add());
    });

    test('the last open row cannot be removed', () => {
        click(add());
        click(rows()[1].querySelector('[data-hyperion-sendfriend-remove]'));
        click(rows()[0].querySelector('[data-hyperion-sendfriend-remove]'));
        expect(openRows()).toHaveLength(1);
        expect(rows()[0].hidden).toBe(false);
    });

    test('a validation round trip with three posted rows starts with three open rows and a remove button each', () => {
        uninstall();
        document.body.innerHTML = markup(5, 3);
        uninstall = installSendFriend(document);
        expect(openRows()).toHaveLength(3);
        expect(rows().slice(0, 3).every((r) => !r.querySelector('[data-hyperion-sendfriend-remove]').hidden)).toBe(true);
        expect(add().hidden).toBe(false);
    });

    test('install is idempotent per root and uninstall stops listening', () => {
        expect(installSendFriend(document)).toBeTypeOf('function');
        click(add());
        expect(openRows()).toHaveLength(2);
        uninstall();
        click(add());
        expect(openRows()).toHaveLength(2);
        uninstall = () => {};
    });
});

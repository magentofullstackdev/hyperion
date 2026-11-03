// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-address-card: the Delete form asks through <hyperion-confirm>,
// never through window.confirm.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import '../hyperion-address-card.js';
import '../hyperion-confirm.js';

const QUESTION = 'Are you sure you want to delete this address?';

function mountCard() {
    document.body.innerHTML = `
        <hyperion-address-card data-delete-confirm="${QUESTION}">
            <form data-hyperion-address-delete method="post" action="/customer/address/delete/id/8/">
                <input type="hidden" name="form_key" value="abc">
                <button type="submit">Delete</button>
            </form>
        </hyperion-address-card>`;
    const form = document.querySelector('form');
    form.requestSubmit = vi.fn();
    form.submit = vi.fn();
    return form;
}

function submit(form) {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    return event;
}

async function dialog() {
    const confirm = document.querySelector('hyperion-confirm');
    await confirm.updateComplete;
    // The dialog opens from a promise chain: let it settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await confirm.updateComplete;
    return confirm;
}

describe('<hyperion-address-card> delete confirmation', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });
    afterEach(() => { vi.restoreAllMocks(); });

    test('the first submit is held and the themed dialog carries the card text, no window.confirm', async () => {
        const form = mountCard();
        const event = submit(form);
        expect(event.defaultPrevented).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        const confirm = await dialog();
        expect(confirm).not.toBeNull();
        expect(confirm.querySelector('#hyperion-confirm-message').textContent.trim()).toBe(QUESTION);
        expect(form.requestSubmit).not.toHaveBeenCalled();
    });

    test('OK re-submits the form once, marked as confirmed', async () => {
        const form = mountCard();
        submit(form);
        const confirm = await dialog();
        confirm.querySelector('[data-hyperion-confirm-ok]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(form.hasAttribute('data-hyperion-confirmed')).toBe(true);
        expect(form.requestSubmit).toHaveBeenCalledTimes(1);
        // The re-submission is not intercepted a second time.
        const again = submit(form);
        expect(again.defaultPrevented).toBe(false);
    });

    test('Cancel keeps the address', async () => {
        const form = mountCard();
        submit(form);
        const confirm = await dialog();
        confirm.querySelector('[data-hyperion-confirm-cancel]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(form.hasAttribute('data-hyperion-confirmed')).toBe(false);
        expect(form.requestSubmit).not.toHaveBeenCalled();
        expect(form.submit).not.toHaveBeenCalled();
    });

    test('a submit from another form inside the card is not intercepted', () => {
        mountCard();
        const other = document.createElement('form');
        other.requestSubmit = vi.fn();
        document.querySelector('hyperion-address-card').appendChild(other);
        expect(submit(other).defaultPrevented).toBe(false);
    });
});

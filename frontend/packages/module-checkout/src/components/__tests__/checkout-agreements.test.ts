// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// What the order is missing is decided elsewhere; the tests choose the answer.
const { blocker } = vi.hoisted(() => ({ blocker: { current: 'agreements' as string | null } }));
vi.mock('../../store/place-order-hint.js', () => ({
    placeOrderBlocker: () => blocker.current,
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { requestValidation, resetValidationRequestsForTests } from '../../store/validation-request.js';
import { AGREEMENT_MODE_AUTO, AGREEMENT_MODE_MANUAL, type AgreementEntry, type CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-agreements.js';
import { agreementContentHeight, type CheckoutAgreements } from '../checkout-agreements.js';

function agreement(id: number, extra: Partial<AgreementEntry> = {}): AgreementEntry {
    return {
        agreementId: id,
        checkboxText: `I agree to terms ${id}`,
        content: `<p>Full text of terms ${id}</p>`,
        contentHeight: '',
        mode: AGREEMENT_MODE_MANUAL,
        name: `Terms ${id}`,
        ...extra,
    };
}

function install(agreements: readonly AgreementEntry[], isEnabled = true): void {
    setCheckoutConfig({
        ...(guestFixture as unknown as CheckoutConfig),
        checkoutAgreements: { isEnabled, agreements },
    } as CheckoutConfig);
}

async function mount(): Promise<CheckoutAgreements> {
    const el = document.createElement('checkout-agreements');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

function box(el: Element, id: number): HTMLInputElement {
    return el.querySelector(`#hc-agreement-${id}`) as HTMLInputElement;
}

describe('<checkout-agreements>', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        resetValidationRequestsForTests();
        blocker.current = 'agreements';
        store = createStore();
        setStoreForTests(store);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('renders nothing and takes no place without manual agreements', async () => {
        install([agreement(1, { mode: AGREEMENT_MODE_AUTO })]);
        let el = await mount();
        expect(el.querySelector('input')).toBeNull();
        expect(el.hasAttribute('hidden')).toBe(true);

        document.body.innerHTML = '';
        install([agreement(1)], false);
        el = await mount();
        expect(el.querySelector('input')).toBeNull();
        expect(el.hasAttribute('hidden')).toBe(true);
    });

    it('renders a required checkbox with the short label, not described by the full text', async () => {
        install([agreement(7)]);
        const el = await mount();
        expect(el.hasAttribute('hidden')).toBe(false);
        const input = box(el, 7);
        expect(input.required).toBe(true);
        expect(input.getAttribute('aria-required')).toBe('true');
        expect(input.getAttribute('aria-invalid')).toBe('false');
        expect(input.hasAttribute('aria-describedby')).toBe(false);
        const label = el.querySelector('label[for="hc-agreement-7"]')!;
        expect(label.textContent).toContain('I agree to terms 7');
        expect(label.textContent).toContain('*');
        expect(label.textContent).not.toContain('Full text');
        // The error line is reserved while it is empty.
        expect(el.querySelector('#hc-agreement-7-msg')?.textContent?.trim()).toBe('');
    });

    it('opens the full text in a dialog from the "Read the terms" button and closes it', async () => {
        install([agreement(7, { contentHeight: '200' })]);
        const el = await mount();
        const dialog = el.querySelector('dialog')!;
        expect(dialog.hasAttribute('open')).toBe(false);
        expect(dialog.getAttribute('aria-labelledby')).toBe('hc-agreement-7-heading');
        expect(el.querySelector('#hc-agreement-7-heading')?.textContent).toBe('Terms 7');
        const content = dialog.querySelector('[data-hyperion-agreement-content]') as HTMLElement;
        expect(content.textContent).toBe('Full text of terms 7');
        expect(content.style.maxHeight).toBe('200px');

        const open = el.querySelector('[data-hyperion-agreement-open]') as HTMLButtonElement;
        expect(open.textContent?.trim()).toBe('Read the terms');
        open.click();
        expect(dialog.hasAttribute('open')).toBe(true);

        await Promise.all(Array.from(el.querySelectorAll('hc-button')).map((b) => (b as unknown as { updateComplete: Promise<unknown> }).updateComplete));
        (dialog.querySelector('hc-button button') as HTMLButtonElement).click();
        expect(dialog.hasAttribute('open')).toBe(false);
    });

    it('sanitizes the admin text and offers no button for an agreement without text', async () => {
        install([agreement(1, { content: '<p onclick="x()">Safe</p><script>window.bad = 1</script>' }), agreement(2, { content: '' })]);
        const el = await mount();
        const content = el.querySelector('[data-hyperion-agreement-content]')!;
        expect(content.querySelector('script')).toBeNull();
        expect(content.innerHTML).not.toContain('onclick');
        expect(el.querySelectorAll('[data-hyperion-agreement-open]').length).toBe(1);
        expect(el.querySelectorAll('dialog').length).toBe(1);
    });

    it('ticking and unticking writes the accepted ids', async () => {
        install([agreement(1), agreement(2)]);
        const el = await mount();
        const second = box(el, 2);
        second.checked = true;
        second.dispatchEvent(new Event('change', { bubbles: true }));
        expect(store.acceptedAgreements.get()).toEqual([2]);
        second.checked = false;
        second.dispatchEvent(new Event('change', { bubbles: true }));
        expect(store.acceptedAgreements.get()).toEqual([]);
    });

    it('after an early press every unticked box is invalid with its own message, and the first one is the first invalid control', async () => {
        install([agreement(1), agreement(2), agreement(3)]);
        store.acceptedAgreements.set([1]);
        const el = await mount();
        expect(el.querySelector('[aria-invalid="true"]')).toBeNull();

        requestValidation();
        await el.updateComplete;

        expect(box(el, 1).getAttribute('aria-invalid')).toBe('false');
        expect(box(el, 1).hasAttribute('aria-describedby')).toBe(false);
        for (const id of [2, 3]) {
            expect(box(el, id).getAttribute('aria-invalid')).toBe('true');
            expect(box(el, id).getAttribute('aria-describedby')).toBe(`hc-agreement-${id}-msg`);
            expect(el.querySelector(`#hc-agreement-${id}-msg`)?.textContent?.trim()).toBe('Accept these terms to place your order.');
        }
        expect(el.querySelector('[aria-invalid="true"]')).toBe(box(el, 2));

        store.acceptedAgreements.set([1, 2]);
        await el.updateComplete;
        expect(box(el, 2).getAttribute('aria-invalid')).toBe('false');
        expect(el.querySelector('#hc-agreement-2-msg')?.textContent?.trim()).toBe('');
        expect(el.querySelector('[aria-invalid="true"]')).toBe(box(el, 3));
    });

    it('leaves the boxes unmarked while another piece is what the order is missing', async () => {
        install([agreement(1)]);
        blocker.current = 'shipping-method';
        const el = await mount();
        requestValidation();
        await el.updateComplete;
        expect(el.querySelector('[aria-invalid="true"]')).toBeNull();
        expect(el.querySelector('#hc-agreement-1-msg')?.textContent?.trim()).toBe('');
    });

    it('an element mounted after the press starts clean', async () => {
        install([agreement(1)]);
        requestValidation();
        const el = await mount();
        expect(el.querySelector('[aria-invalid="true"]')).toBeNull();
    });

    it('reads the content height as a length and falls back for anything else', () => {
        expect(agreementContentHeight('200')).toBe('200px');
        expect(agreementContentHeight('12.5em')).toBe('12.5em');
        expect(agreementContentHeight('50vh')).toBe('50vh');
        expect(agreementContentHeight(300)).toBe('300px');
        expect(agreementContentHeight('')).toBe('60vh');
        expect(agreementContentHeight('0')).toBe('60vh');
        expect(agreementContentHeight('auto; color: red')).toBe('60vh');
        expect(agreementContentHeight(null)).toBe('60vh');
    });
});

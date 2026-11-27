// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// print -- a button or link marked `data-hyperion-print` opens the print
// dialog through one delegated listener; the content wrappers of the order
// print pages carry the same attribute and never print on a click.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { installPrint } from '../print.js';

const markup = `
<button id="print" type="button" data-hyperion-print><span id="label">Print This Page</span></button>
<a id="link" href="/catalog/product_compare/" data-hyperion-print>Print</a>
<button id="disabled" type="button" disabled data-hyperion-print>Print</button>
<button id="other" type="button">Other</button>
<div id="wrapper" data-hyperion-print="invoice"><p id="inside">Invoice</p></div>`;

const click = (el) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
};
const byId = (id) => document.getElementById(id);

describe('print', () => {
    let uninstall;
    let print;
    let original;

    beforeEach(() => {
        document.body.innerHTML = markup;
        // The test DOM has no print dialog: stand in for it on the window.
        original = Object.getOwnPropertyDescriptor(window, 'print');
        print = vi.fn();
        Object.defineProperty(window, 'print', { value: print, configurable: true, writable: true });
        uninstall = installPrint(document);
    });

    afterEach(() => {
        uninstall();
        if (original) Object.defineProperty(window, 'print', original);
        else delete window.print;
        document.body.innerHTML = '';
    });

    test('a click on the button, or on its label, opens the print dialog', () => {
        click(byId('print'));
        click(byId('label'));
        expect(print).toHaveBeenCalledTimes(2);
    });

    test('a print link prints instead of navigating', () => {
        const event = click(byId('link'));
        expect(print).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    test('a control added later is covered by the same listener', () => {
        document.body.insertAdjacentHTML('beforeend', '<button id="late" type="button" data-hyperion-print>Print</button>');
        click(byId('late'));
        expect(print).toHaveBeenCalledTimes(1);
    });

    test('a click inside a print page wrapper, on another control or on a disabled one does not print', () => {
        click(byId('inside'));
        click(byId('wrapper'));
        click(byId('other'));
        click(byId('disabled'));
        expect(print).not.toHaveBeenCalled();
    });

    test('the returned function removes the listener', () => {
        uninstall();
        click(byId('print'));
        expect(print).not.toHaveBeenCalled();
        uninstall = () => {};
    });
});

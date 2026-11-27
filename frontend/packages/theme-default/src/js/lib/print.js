// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Print buttons.
//
// A control marked `data-hyperion-print` (the Print This Page button of the
// product comparison page) opens the browser's print dialog. Templates carry
// no inline handler: one delegated listener on the document covers every such
// control, including one that arrives later in a swapped fragment.
//
// Only a button or a link is a print control: the print pages of orders,
// invoices, shipments and credit memos use `data-hyperion-print="<type>"` on
// their content wrapper, and a click inside those must not print. A link is
// kept from navigating (its `href` is the fallback without scripting).

const CONTROL = 'button[data-hyperion-print], a[data-hyperion-print]';

function controlOf(event) {
    return event.target instanceof Element ? event.target.closest(CONTROL) : null;
}

export function installPrint(root = document) {
    const view = root.defaultView || window;

    const onClick = (event) => {
        const control = controlOf(event);
        if (!control || event.defaultPrevented) return;
        if (control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') return;
        event.preventDefault();
        view.print();
    };

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
}

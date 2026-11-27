// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The fake hosted card field. Runs inside the iframe the card element frames,
// on the same origin. It answers the parent with what a real hosted field
// would: whether the number is complete and its last four digits; the number
// itself stays in this document.
//
// Messages to the parent (source "hyperion-sample-field"): ready, change
// { complete, last4 }, tokenized { requestId, complete, last4 }.
// Messages from the parent (source "hyperion-sample-host"): focus,
// invalid { invalid }, tokenize { requestId }.

const SOURCE = 'hyperion-sample-field';
const HOST = 'hyperion-sample-host';
const input = document.getElementById('sample-card-number');

const digits = () => (input?.value ?? '').replace(/\D/g, '');
const state = () => {
    const number = digits();
    return { complete: number.length >= 12 && number.length <= 19, last4: number.slice(-4) };
};
const post = (message) => {
    if (window.parent === window) return;
    window.parent.postMessage({ source: SOURCE, ...message }, window.location.origin);
};

let lastComplete = null;
input?.addEventListener('input', () => {
    const current = state();
    input.removeAttribute('aria-invalid');
    if (current.complete !== lastComplete || current.complete) {
        lastComplete = current.complete;
        post({ type: 'change', ...current });
    }
});

window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== HOST) return;
    if (data.type === 'focus') input?.focus();
    if (data.type === 'invalid') {
        if (data.invalid) input?.setAttribute('aria-invalid', 'true');
        else input?.removeAttribute('aria-invalid');
    }
    if (data.type === 'tokenize') post({ type: 'tokenized', requestId: data.requestId, ...state() });
});

post({ type: 'ready' });

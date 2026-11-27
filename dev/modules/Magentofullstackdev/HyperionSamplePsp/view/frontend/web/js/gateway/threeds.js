// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The fake 3D Secure challenge: Approve and Decline post the answer to the
// card element that framed this page (source "hyperion-sample-threeds").

for (const button of document.querySelectorAll('[data-sample-threeds]')) {
    button.addEventListener('click', () => {
        if (window.parent === window) return;
        window.parent.postMessage(
            { source: 'hyperion-sample-threeds', result: button.getAttribute('data-sample-threeds') },
            window.location.origin
        );
    });
}
document.querySelector('[data-sample-threeds="approve"]')?.focus();

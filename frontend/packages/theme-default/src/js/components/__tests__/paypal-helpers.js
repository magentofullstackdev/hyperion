// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Helpers of the PayPal component tests: a controllable IntersectionObserver
// and a stand-in for the PayPal SDK (nothing is fetched from paypal.com).
import { vi } from 'vitest';

/** Replace IntersectionObserver with one the test triggers by hand. */
export function installIntersectionObserver() {
    const original = globalThis.IntersectionObserver;
    const instances = [];
    class FakeIntersectionObserver {
        constructor(callback, options = {}) {
            this.callback = callback;
            this.options = options;
            this.targets = [];
            this.disconnected = false;
            instances.push(this);
        }

        observe(target) { this.targets.push(target); }

        unobserve() {}

        disconnect() { this.disconnected = true; }

        trigger(isIntersecting = true) {
            if (this.disconnected) return;
            this.callback(this.targets.map((target) => ({ target, isIntersecting })), this);
            // A placement in view stands for a shopper in front of it: the SDK
            // also waits for a sign of the shopper on the document, and listens
            // for it only once the placement is wanted (two microtasks later).
            if (isIntersecting) {
                Promise.resolve().then(() => Promise.resolve()).then(() => {
                    document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
                });
            }
        }
    }
    globalThis.IntersectionObserver = FakeIntersectionObserver;
    window.IntersectionObserver = FakeIntersectionObserver;
    return {
        instances,
        triggerAll(isIntersecting = true) {
            instances.forEach((instance) => instance.trigger(isIntersecting));
        },
        restore() {
            globalThis.IntersectionObserver = original;
            window.IntersectionObserver = original;
        },
    };
}

let interceptedScripts = [];

/**
 * Keep the SDK script tags out of the document (happy-dom would fetch
 * them from paypal.com) and remember them for the assertions.
 */
export function interceptSdkScripts() {
    interceptedScripts = [];
    const append = document.head.appendChild.bind(document.head);
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
        if (node instanceof HTMLScriptElement && node.hasAttribute('data-hyperion-paypal-sdk')) {
            interceptedScripts.push(node);
            node.remove = () => {
                interceptedScripts = interceptedScripts.filter((script) => script !== node);
            };
            return node;
        }
        return append(node);
    });
    return {
        restore() {
            spy.mockRestore();
            interceptedScripts = [];
        },
    };
}

export const sdkScripts = () => [...interceptedScripts];

/** A PayPal SDK double that records what the components ask of it. */
export function fakePaypal({ eligible = true } = {}) {
    const paypal = {
        buttonOptions: [],
        buttonRenders: [],
        messageRenders: [],
        closed: 0,
        Buttons: vi.fn((options) => {
            paypal.buttonOptions.push(options);
            return {
                isEligible: () => eligible,
                render: vi.fn((container) => {
                    paypal.buttonRenders.push(container);
                    return Promise.resolve();
                }),
                close: vi.fn(() => {
                    paypal.closed++;
                    return Promise.resolve();
                }),
            };
        }),
        Messages: vi.fn(() => ({
            render: vi.fn((element) => {
                paypal.messageRenders.push(element);
                return Promise.resolve();
            }),
        })),
    };
    return paypal;
}

/** Make the pending SDK script "load" with the given double. */
export function finishSdkLoad(paypal = fakePaypal()) {
    window.paypal = paypal;
    const [script] = sdkScripts();
    script.onload();
    return paypal;
}

/** Let the promise chains of the components run. */
export async function settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

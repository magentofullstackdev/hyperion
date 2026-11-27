// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-express-slot -- the express buttons of one placement.
 *
 * Server markup (`Magentofullstackdev_HyperionCheckout::express/slot.phtml`,
 * printed only when at least one button is available): the express slot with the
 * total reserved height and one box per button with its own height, so the
 * page has its final geometry before any script runs.
 *
 * Attributes:
 *   placement               `product` | `cart` | `minicart` | `checkout-top`
 *   data-hyperion-express   JSON list of the buttons (`ExpressButtonConfig`)
 *   form                    product placement: selector of the add to cart form
 *   base-url                the store base URL (storefront requests)
 *   options-message, error-message
 *                           translated messages of the context
 *
 * For each button, once its box comes near the viewport (or is touched),
 * the express slot loads the module (a first-party `builtin` chunk, or the entry's
 * module URL from an allowed origin), creates the element, gives it
 * `context`, `options` and `placement` before connecting it, and appends it
 * to the box. Events of that element (bubbling, composed):
 *
 *   hyperion-express:ready        marks the box `data-hyperion-express-ready`
 *   hyperion-express:error        shows `detail.message` in the page toast
 *   hyperion-express:unavailable  collapses the box, but only when that
 *                                 cannot move what the shopper sees: at once
 *                                 when the box is out of the viewport,
 *                                 otherwise as soon as it leaves it
 *
 * A module that fails to load counts as unavailable. The cart and the
 * mini-cart replace the express slot through htmx swaps: every new slot starts
 * again and creates new elements, which must tolerate it.
 */

import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';
import { whenWanted } from '../lib/engagement.js';
import { createExpressContext, DISPOSE, plainMessage } from '../lib/express-context.js';
import { loadExtensionElement, registerBuiltinModule } from '../lib/extension-loader.js';
import { notify } from '../lib/paypal-sdk.js';

const BOX_ATTRIBUTE = 'data-hyperion-express-button';
const READY_ATTRIBUTE = 'data-hyperion-express-ready';
const GAP_PX = 8;

/** First-party express buttons, chunks of the theme build. */
const BUILTINS = {
    'hyperion-paypal-buttons': () => import('./hyperion-paypal-buttons.js'),
};
for (const [id, load] of Object.entries(BUILTINS)) registerBuiltinModule(id, load);

function parseButtons(raw) {
    if (!raw) return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        console.error('[hyperion-express-slot] the button configuration is not valid JSON');
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === 'object'
        && typeof entry.id === 'string' && entry.id !== '' && typeof entry.tag === 'string');
}

function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom > 0 && rect.top < height && rect.height > 0;
}

export class HyperionExpressSlot extends HyperionLightElement {
    static properties = {
        placement: { type: String, reflect: true },
    };

    constructor() {
        super();
        this.placement = '';
        this._cleanups = [];
        this._connection = 0;
    }

    /** The server markup is the content: Lit renders nothing here. */
    createRenderRoot() {
        return document.createDocumentFragment();
    }

    connectedCallback() {
        super.connectedCallback();
        // A parser may connect the element before its boxes: start once they are in.
        const connection = ++this._connection;
        queueMicrotask(() => {
            if (this.isConnected && connection === this._connection) this._start();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._connection++;
        this._stop();
    }

    _start() {
        this._stop();
        const placement = this.getAttribute('placement') || this.placement || '';
        for (const entry of parseButtons(this.getAttribute('data-hyperion-express'))) {
            const box = [...this.children].find((child) => child.getAttribute(BOX_ATTRIBUTE) === entry.id);
            if (!box) {
                console.error(`[hyperion-express-slot] no box for the button "${entry.id}"`);
                continue;
            }
            this._startButton(entry, box, placement);
        }
    }

    _stop() {
        const cleanups = this._cleanups;
        this._cleanups = [];
        cleanups.forEach((cleanup) => {
            try {
                cleanup();
            } catch (error) {
                console.error('[hyperion-express-slot]', error);
            }
        });
    }

    _startButton(entry, box, placement) {
        let active = true;
        const context = createExpressContext(this, entry, box);
        const waiting = whenWanted(box);
        this._cleanups.push(() => {
            active = false;
            waiting.cancel();
            context[DISPOSE]();
        });
        // A box left by an earlier connection of this slot starts empty.
        box.replaceChildren();
        box.removeAttribute(READY_ATTRIBUTE);

        waiting
            .then(() => (active ? loadExtensionElement(entry) : null))
            .then((result) => {
                if (!active || result === null) return;
                if (result.state !== 'ready') {
                    this._collapse(box);
                    return;
                }
                this._mount(entry, box, placement, context);
            })
            .catch((error) => {
                console.error(`[hyperion-express-slot] the button "${entry.id}" failed`, error);
                if (active) this._collapse(box);
            });
    }

    _mount(entry, box, placement, context) {
        let element;
        try {
            element = document.createElement(entry.tag);
            element.context = context;
            element.options = Object.freeze({ ...(entry.options && typeof entry.options === 'object' ? entry.options : {}) });
            element.placement = placement;
        } catch (error) {
            console.error(`[hyperion-express-slot] the button "${entry.id}" could not be created`, error);
            this._collapse(box);
            return;
        }

        const onReady = (event) => {
            if (event.target !== element) return;
            box.setAttribute(READY_ATTRIBUTE, '');
        };
        const onError = (event) => {
            if (event.target !== element) return;
            const message = plainMessage(event.detail?.message);
            if (message !== '') notify(message, 'error');
        };
        const onUnavailable = (event) => {
            if (event.target !== element) return;
            this._collapse(box);
        };
        box.addEventListener('hyperion-express:ready', onReady);
        box.addEventListener('hyperion-express:error', onError);
        box.addEventListener('hyperion-express:unavailable', onUnavailable);
        this._cleanups.push(() => {
            box.removeEventListener('hyperion-express:ready', onReady);
            box.removeEventListener('hyperion-express:error', onError);
            box.removeEventListener('hyperion-express:unavailable', onUnavailable);
        });

        try {
            box.appendChild(element);
        } catch (error) {
            console.error(`[hyperion-express-slot] the button "${entry.id}" could not be connected`, error);
            this._collapse(box);
        }
    }

    /** Collapse a box when that moves nothing in view: now, or once it has left the viewport. */
    _collapse(box) {
        if (box.hidden || box.hasAttribute('data-hyperion-express-collapsing')) return;
        if (!isInViewport(box) || typeof IntersectionObserver !== 'function') {
            this._hideBox(box);
            return;
        }
        box.setAttribute('data-hyperion-express-collapsing', '');
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((item) => !item.isIntersecting)) {
                observer.disconnect();
                this._hideBox(box);
            }
        });
        observer.observe(box);
        this._cleanups.push(() => observer.disconnect());
    }

    _hideBox(box) {
        box.removeAttribute('data-hyperion-express-collapsing');
        box.hidden = true;
        box.replaceChildren();
        const visible = [...this.children].filter((child) => child.hasAttribute(BOX_ATTRIBUTE) && !child.hidden);
        if (visible.length === 0) {
            this.style.display = 'none';
            return;
        }
        const height = visible.reduce((sum, child) => sum + (parseFloat(child.style.minHeight) || 0), 0)
            + GAP_PX * (visible.length - 1);
        this.style.minHeight = `${height}px`;
    }
}

if (!customElements.get('hyperion-express-slot')) {
    customElements.define('hyperion-express-slot', HyperionExpressSlot);
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-rating -- CSS-host wrapper for server-rendered star-rating radios.
 *
 * SHADOW-BOUNDARY LIMITATION (intentional, documented):
 * -------------------------------------------------------
 * CSS sibling combinators (`:checked ~ label`) do NOT cross the shadow DOM
 * boundary and therefore cannot style slotted light-DOM siblings from inside
 * this component's `static styles` block.
 *
 * This component's sole job is to:
 *   1. Register the `<hyperion-rating>` custom element so presence can be
 *      detected in tests and feature-detection scripts.
 *   2. Publish the CSS Custom Properties below so the consumer's light-DOM
 *      stylesheet can reference them via `var(--rating-star-color)` etc.
 *   3. Apply layout (row-reverse flex) to create the RTL star ordering trick.
 *   4. Visually hide the radio inputs while keeping them focusable and
 *      keyboard-operable via `::slotted(input[type="radio"])`.
 *   5. Size and color slotted labels via `::slotted(label)`.
 *
 * CONSUMER RESPONSIBILITY:
 *   The .phtml template that uses this component MUST include a <style> block
 *   in the light DOM that handles the :checked + sibling cascade, e.g.:
 *
 *   <style>
 *     hyperion-rating input[type="radio"]:checked ~ label,
 *     hyperion-rating input[type="radio"]:checked ~ label ~ label {
 *         color: var(--rating-star-color, rgb(var(--color-accent)));
 *     }
 *     hyperion-rating label:hover,
 *     hyperion-rating label:hover ~ label {
 *         color: var(--rating-star-color, rgb(var(--color-accent)));
 *     }
 *   </style>
 *
 * The native radio `change` event bubbles out of the shadow (it fires on the
 * slotted light-DOM element), so HTMX `hx-trigger="change"` on the surrounding
 * form works without interception.
 */

import { LitElement, html, css } from 'lit';

export class HyperionRating extends LitElement {
    static styles = css`
        :host {
            --rating-star-color: rgb(var(--color-accent));
            --rating-star-empty-color: rgb(var(--color-subtle));
            --rating-star-size: 1.5rem;
            display: inline-flex;
            flex-direction: row-reverse;
            justify-content: flex-end;
            gap: 2px;
        }

        ::slotted(input[type="radio"]) {
            position: absolute;
            opacity: 0;
            width: 1px;
            height: 1px;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
        }

        ::slotted(label) {
            cursor: pointer;
            width: var(--rating-star-size);
            height: var(--rating-star-size);
            color: var(--rating-star-empty-color);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: var(--rating-star-size);
            line-height: 1;
        }
    `;

    render() {
        return html`<slot></slot>`;
    }
}

if (!customElements.get('hyperion-rating')) {
    customElements.define('hyperion-rating', HyperionRating);
}

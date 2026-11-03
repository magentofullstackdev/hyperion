// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Base Lit element for Hyperion components that need light-DOM rendering.
 *
 * Several Hyperion components -- every form-bearing component in the
 * checkout, the account-nav enhancer, the coupon form,
 * etc. -- must render to light DOM so:
 *
 *   * Tailwind utility classes from the page's stylesheet cascade in,
 *   * Browser autofill and password managers (1Password, Bitwarden,
 *     browser built-ins) can introspect the inputs,
 *   * `form.checkValidity()` and the Constraint Validation API cross
 *     the element boundary reliably.
 *
 * This base class collapses the boilerplate `createRenderRoot() { return this; }`
 * that every such component would otherwise duplicate. Components that
 * need shadow DOM (sliders, dropdowns, the mini-cart drawer) should
 * extend `LitElement` directly -- they don't need this class.
 */
import { LitElement } from 'lit';

export class HyperionLightElement extends LitElement {
    public override createRenderRoot(): HTMLElement {
        return this;
    }
}

export type HyperionLightElementBase = typeof HyperionLightElement;

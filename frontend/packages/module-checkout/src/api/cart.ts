// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Cart / quote endpoint wrappers.
 *
 * Endpoint table:
 *   GET  /guest-carts/:cartId            -- guest
 *   GET  /carts/mine                     -- customer
 *   GET  /guest-carts/:cartId/totals
 *   GET  /carts/mine/totals
 *   POST /customers/isEmailAvailable
 *   POST customer/ajax/login            -- storefront controller, not REST
 *
 * Every wrapper is a one-line typed call to `apiFetch`. The
 * guest/customer path is selected by the caller (the store usually
 * picks based on `state.isGuest`).
 */
import { apiFetch, storefrontPostJson } from './client.js';
import type { QuoteData } from '../types/quote.js';
import type { Totals } from '../types/totals.js';

export function getGuestCart(maskedCartId: string): Promise<QuoteData> {
    return apiFetch<QuoteData>(
        `guest-carts/${encodeURIComponent(maskedCartId)}`,
        { auth: 'guest' }
    );
}

export function getCustomerCart(): Promise<QuoteData> {
    return apiFetch<QuoteData>('carts/mine', { auth: 'customer' });
}

/** The fields of a cart that tell whether it was turned into an order. */
export interface CartStateProbe {
    id?: number | string;
    is_active?: boolean;
}

/** How long a cart state read may take before its answer counts as missing. */
export const CART_STATE_TIMEOUT_MS = 15000;

/**
 * One read of the cart, never retried, with a time limit: used after an
 * order request lost its answer. An ordered guest quote still answers 200,
 * with `is_active` false and without its items.
 */
export function getGuestCartState(maskedCartId: string): Promise<CartStateProbe> {
    return apiFetch<CartStateProbe>(
        `guest-carts/${encodeURIComponent(maskedCartId)}`,
        { auth: 'guest', retry: false, timeoutMs: CART_STATE_TIMEOUT_MS }
    );
}

/**
 * The customer's counterpart: `carts/mine` answers 404 once the quote was
 * ordered, and a quote with another id when a new cart was started since.
 */
export function getCustomerCartState(): Promise<CartStateProbe> {
    return apiFetch<CartStateProbe>(
        'carts/mine',
        { auth: 'customer', retry: false, timeoutMs: CART_STATE_TIMEOUT_MS }
    );
}

export function getGuestTotals(maskedCartId: string): Promise<Totals> {
    return apiFetch<Totals>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/totals`,
        { auth: 'guest' }
    );
}

export function getCustomerTotals(): Promise<Totals> {
    return apiFetch<Totals>('carts/mine/totals', { auth: 'customer' });
}

export interface IsEmailAvailableRequest {
    customerEmail: string;
    websiteId?: number;
}

export function isEmailAvailable(
    req: IsEmailAvailableRequest
): Promise<boolean> {
    return apiFetch<boolean>('customers/isEmailAvailable', {
        method: 'POST',
        body: req,
        auth: 'none',
    });
}

export interface StorefrontLoginRequest {
    username: string;
    password: string;
}

export interface StorefrontLoginResponse {
    errors: boolean;
    message: string;
}

/**
 * Inline login through the storefront's own AJAX login controller
 * (`customer/ajax/login`, `Magento\Customer\Controller\Ajax\Login`), NOT the
 * REST token service: only a storefront login starts the PHP customer
 * session, merges the guest quote into the customer's one
 * (`Magento\Checkout\Observer\LoadCustomerQuoteObserver`) and sets the
 * cookies the session-bound gateways (Vault, PayPal) rely on. The response is
 * `{ errors, message }`; the caller reloads the checkout afterwards so the
 * bundle boots from the merged quote. The reCAPTCHA token goes where
 * `Magento_ReCaptchaCustomer` reads it for this route (`g-recaptcha-response`).
 *
 * `captcha_form_id` is part of the controller's contract: the core captcha
 * plugin (`Magento\Captcha\Model\Customer\Plugin\AjaxLogin`) looks the
 * form up by that id and, when the body has none, asks the helper for a
 * `null` form. On PHP 8.5 that is a deprecation Magento turns into an
 * exception (HTTP 500). Luma always sends `user_login`; so do we.
 */
export const LOGIN_CAPTCHA_FORM_ID = 'user_login';

export function loginOnStorefront(
    req: StorefrontLoginRequest,
    recaptchaToken?: string | null
): Promise<StorefrontLoginResponse> {
    const body = { captcha_form_id: LOGIN_CAPTCHA_FORM_ID, ...req };
    return storefrontPostJson<StorefrontLoginResponse>(
        'customer/ajax/login',
        recaptchaToken ? { ...body, 'g-recaptcha-response': recaptchaToken } : body,
        recaptchaToken ? { 'g-recaptcha-response': recaptchaToken } : undefined
    );
}

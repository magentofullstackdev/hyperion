// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The `builtin` ids of the first-party checkout extensions of the generic
 * pool, each a chunk of its own: the entry `hyperion_order_comment` names
 * `order-comment`, the entry `hyperion_newsletter_optin` names `newsletter-optin`.
 * Imported by the generic extension runtime, so a checkout without entries
 * in `hyperion.extensions` never loads this registration either.
 */
import { registerBuiltinModule } from '../../extension/loader.js';

export const ORDER_COMMENT_BUILTIN = 'order-comment';
export const NEWSLETTER_OPTIN_BUILTIN = 'newsletter-optin';

export function registerCheckoutBuiltins(): void {
    registerBuiltinModule(ORDER_COMMENT_BUILTIN, () => import('./order-comment.js'));
    registerBuiltinModule(NEWSLETTER_OPTIN_BUILTIN, () => import('./newsletter-optin.js'));
}

registerCheckoutBuiltins();

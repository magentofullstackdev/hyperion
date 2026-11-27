// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { peekCheckoutConfig } from '../bootstrap-config.js';

/** The sign in page that returns to the checkout; core's plain one when the config names none. */
export function loginUrl(): string {
    const hyperion = peekCheckoutConfig()?.hyperion;
    if (hyperion?.loginUrl) return hyperion.loginUrl;
    const base = hyperion?.baseUrl ?? '/';
    return `${base.endsWith('/') ? base : `${base}/`}customer/account/login/`;
}

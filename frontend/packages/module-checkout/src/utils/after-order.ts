// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Where a payment renderer may send the browser, and what the checkout
 * does once the order exists, as the renderer answered it
 * (`AfterOrderOutcome` of `extension-api.d.ts`).
 *
 * The host rule: a URL of the renderer's gateway is followed when it is
 * same-origin, or `https:` on a host its entry lists (`redirectHosts`, bare
 * lower case host names). After the order, a URL that breaks the rule
 * continues on the success page, because the order exists.
 */
import type { AfterOrderOutcome } from '../../extension-api.js';
import { navigateTo } from './navigate.js';
import { decideRedirectTarget, resolveSameOriginUrl } from './safe-redirect.js';

/**
 * `targetUrl` when it is same-origin, or `https:` on one of `hosts`; null
 * otherwise (the refused host is logged).
 */
export function resolveAllowedUrl(targetUrl: unknown, hosts: readonly string[] = []): string | null {
    if (typeof targetUrl !== 'string' || targetUrl.trim() === '') return null;
    const same = resolveSameOriginUrl(targetUrl);
    if (same !== null) return same;
    let url: URL;
    try {
        url = new URL(targetUrl, window.location.origin);
    } catch {
        console.error('[hyperion-checkout] a payment redirect URL is not valid and was refused');
        return null;
    }
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && url.username === '' && url.password === ''
        && hosts.some((allowed) => typeof allowed === 'string' && allowed.toLowerCase() === host)) {
        return url.toString();
    }
    console.error(`[hyperion-checkout] a payment redirect to "${host}" was refused: the host is not listed in the renderer's redirect hosts`);
    return null;
}


/** Leave the page with a form POST built with DOM calls. */
function postTo(url: string, fields: Readonly<Record<string, string>>): void {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = url;
    form.hidden = true;
    for (const [name, value] of Object.entries(fields)) {
        if (typeof name !== 'string' || name === '') continue;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = typeof value === 'string' ? value : String(value ?? '');
        form.appendChild(input);
    }
    document.body.appendChild(form);
    if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
    } else {
        form.submit();
    }
}

/**
 * Carry out what a payment renderer answered once the order exists.
 * `success` (or nothing): the success page; `redirect` and `post`: the
 * renderer's URL under the host rule, else the success page; `reload`: the
 * page again (the payment failed and the module restored the quote).
 */
export function navigateAfterOrder(
    outcome: AfterOrderOutcome | void | null | undefined,
    entry: { readonly redirectHosts?: readonly string[] } | null,
    successUrl: string
): void {
    const success = decideRedirectTarget(successUrl);
    const hosts = entry?.redirectHosts ?? [];
    const action = outcome && typeof outcome === 'object' ? (outcome as { action?: unknown }).action : 'success';
    if (action === 'reload') {
        window.location.reload();
        return;
    }
    if (action === 'redirect') {
        navigateTo(resolveAllowedUrl((outcome as { url?: unknown }).url, hosts) ?? success);
        return;
    }
    if (action === 'post') {
        const target = resolveAllowedUrl((outcome as { url?: unknown }).url, hosts);
        const fields = (outcome as { fields?: unknown }).fields;
        if (target !== null && fields && typeof fields === 'object') {
            postTo(target, fields as Record<string, string>);
            return;
        }
        navigateTo(success);
        return;
    }
    if (action !== 'success') {
        console.error('[hyperion-checkout] a payment renderer answered an unknown action after the order; continuing on the success page');
    }
    navigateTo(success);
}

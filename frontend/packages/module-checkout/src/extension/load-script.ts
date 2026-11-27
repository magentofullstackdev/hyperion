// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The one classic script loader of the checkout (gateway SDKs, the
 * reCAPTCHA API): a `<script>` per URL in the head, with the page's CSP
 * nonce, one promise per URL while it loads or loaded; a failed load is
 * removed and forgotten, so a retry can succeed. A caller that gives up on
 * a script for a reason of its own (a time limit, a script that ran
 * without defining what it should) forgets it with `forgetScript()`.
 */

const loads = new Map<string, Promise<void>>();

let nonce: string | null | undefined;

/**
 * The CSP nonce of the page, read once: the `nonce` property of the
 * checkout's own script (the attribute is hidden once the page parsed).
 */
export function readCspNonce(): string | null {
    if (nonce !== undefined) return nonce;
    const candidates = [
        ...document.querySelectorAll<HTMLScriptElement>('script[type="module"]'),
        document.getElementById('checkout-config') as HTMLScriptElement | null,
        ...document.querySelectorAll<HTMLScriptElement>('script'),
    ];
    nonce = null;
    for (const script of candidates) {
        const value = script?.nonce || script?.getAttribute('nonce') || '';
        if (value !== '') {
            nonce = value;
            break;
        }
    }
    return nonce;
}

/** Attributes a caller may not set: the loader owns them, or they run code. */
function isRefusedAttribute(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'src' || lower === 'nonce' || lower.startsWith('on');
}

/** Load a classic script once per URL; resolves once it ran, rejects when it failed. */
export function loadScript(url: string, attributes: Readonly<Record<string, string>> = {}): Promise<void> {
    let href: string;
    try {
        const parsed = new URL(url, document.baseURI);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return Promise.reject(new Error(`a script may not be loaded from ${parsed.protocol}`));
        }
        href = parsed.href;
    } catch {
        return Promise.reject(new Error('the script URL is not valid'));
    }
    const running = loads.get(href);
    if (running) return running;

    const load = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        for (const [name, value] of Object.entries(attributes)) {
            if (!isRefusedAttribute(name)) script.setAttribute(name, value);
        }
        const cspNonce = readCspNonce();
        if (cspNonce !== null) script.nonce = cspNonce;
        script.async = true;
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => {
            script.remove();
            if (loads.get(href) === load) loads.delete(href);
            reject(new Error(`the script ${href} could not be loaded`));
        }, { once: true });
        script.src = href;
        document.head.appendChild(script);
    });
    loads.set(href, load);
    return load;
}

/** Forget the script of `url`: its tag leaves the page and the next load starts over. */
export function forgetScript(url: string): void {
    let href: string;
    try {
        href = new URL(url, document.baseURI).href;
    } catch {
        return;
    }
    loads.delete(href);
    for (const script of document.head.querySelectorAll<HTMLScriptElement>('script')) {
        if (script.src === href) script.remove();
    }
}

export function resetScriptLoaderForTests(): void {
    loads.clear();
    nonce = undefined;
}

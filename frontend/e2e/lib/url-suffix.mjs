// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The category and product URL suffix of the store under test. The scripts
// name the sample data pages with the stock `.html` suffix; a store whose
// `catalog/seo/*_url_suffix` is empty (or something else) answers 404 to
// those, so the suffix is resolved once against a sample category and every
// path goes through `makeUrl()`. `HYPERION_URL_SUFFIX` (empty string allowed)
// skips the probe.
import http from 'node:http';
import https from 'node:https';

const PROBE_PATH = '/women/tops-women';

function statusOf(url) {
    return new Promise((resolve) => {
        const client = url.startsWith('https:') ? https : http;
        const req = client.request(url, { method: 'HEAD', rejectUnauthorized: false, timeout: 15000 }, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.end();
    });
}

export async function resolveUrlSuffix(base) {
    if (process.env.HYPERION_URL_SUFFIX !== undefined) return process.env.HYPERION_URL_SUFFIX;
    for (const suffix of ['.html', '']) {
        if (await statusOf(base.replace(/\/$/, '') + PROBE_PATH + suffix) === 200) return suffix;
    }
    return '.html';
}

/** Rewrites the `.html` of a canonical sample data path to the store's suffix. */
export function makeUrl(suffix) {
    return (path) => path.replace(/\.html(?=$|[?#])/, suffix);
}

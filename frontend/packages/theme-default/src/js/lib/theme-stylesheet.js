// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * When the theme stylesheet applies.
 *
 * The page types that paint their fold from an inline critical sheet load
 * the theme stylesheet without blocking (`HyperionCore::head/scripts.phtml`
 * links it with `media="print"` and flips it to `all` on load). Everything
 * that is not needed for the first paint, the component chunks first of
 * all, waits for it: started at module time they would share the connection
 * with the images of the fold, and a component upgraded before the styles
 * would render its light children unstyled for a frame.
 *
 * Resolves at once when the link is already loaded (a page that links the
 * sheet synchronously: the link is loaded before any module runs) or when
 * there is no link at all; on `load` or `error` of a link still loading;
 * and after `timeout` ms in any case, so a stalled sheet never holds the
 * components back.
 *
 * @param {Document} doc
 * @param {number} timeout milliseconds
 * @returns {Promise<void>}
 */
export function whenThemeStylesheetReady(doc = document, timeout = 4000) {
    const link = doc.querySelector('link[rel="stylesheet"][data-hyperion-theme-css]');
    if (!link || link.sheet) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(done, timeout);
        link.addEventListener('load', done, { once: true });
        link.addEventListener('error', done, { once: true });
    });
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import { forgetScript, loadScript, resetScriptLoaderForTests } from '../load-script.js';

const URL_A = 'https://cdn.example/sdk.js';

function tags(): HTMLScriptElement[] {
    return Array.from(document.head.querySelectorAll<HTMLScriptElement>(`script[src="${URL_A}"]`));
}

describe('the script loader', () => {
    afterEach(() => {
        for (const script of document.head.querySelectorAll('script')) script.remove();
        resetScriptLoaderForTests();
    });

    it('loads a URL once while it loads or loaded', async () => {
        const first = loadScript(URL_A);
        expect(loadScript(URL_A)).toBe(first);
        tags()[0]!.dispatchEvent(new Event('load'));
        await first;
        expect(loadScript(URL_A)).toBe(first);
        expect(tags()).toHaveLength(1);
    });

    it('forgets a script on request: its tag leaves and the next load adds a fresh one', async () => {
        const first = loadScript(URL_A);
        tags()[0]!.dispatchEvent(new Event('load'));
        await first;

        forgetScript(URL_A);
        expect(tags()).toHaveLength(0);

        const second = loadScript(URL_A);
        expect(second).not.toBe(first);
        expect(tags()).toHaveLength(1);
    });

    it('forgets a script still loading, and ignores an invalid or unknown URL', () => {
        void loadScript(URL_A).catch(() => undefined);
        forgetScript('https://cdn.example/other.js');
        forgetScript('http://[bad');
        expect(tags()).toHaveLength(1);
        forgetScript(URL_A);
        expect(tags()).toHaveLength(0);
    });
});

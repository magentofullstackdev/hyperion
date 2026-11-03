// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
    HISTORY_EVENT, MAX_ITEMS, STORAGE_KEY, TERM_ATTRIBUTE,
    currentQuery, getRecentSearches, hydrateRecentSearches, initSearchHistory, landingQuery, normalizeTerm,
    recordSearch, renderRecentSearches, searchResultUrl, searchScope,
} from '../search-history.js';

const header = (action = '/catalogsearch/result/', value = '') => `
    <div data-hyperion-search-panel>
        <form action="${action}" method="get" role="search"><input type="search" name="q" value="${value}"></form>
        <div id="header-search-suggestions"></div>
    </div>`;
const dropdown = () => `
    <div data-hyperion-search-suggest>
        <aside>
            <section data-hyperion-recent-searches hidden>
                <h3>Recent Searches</h3>
                <ul data-hyperion-recent-searches-list></ul>
            </section>
        </aside>
        <a id="product-link" href="/joust-duffle-bag.html">Joust Duffle Bag</a>
    </div>`;
const pills = () => [...document.querySelectorAll(`[${TERM_ATTRIBUTE}]`)];

describe('search-history', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });

    test('normalizes like the server: trimmed, lower case, collapsed, capped', () => {
        expect(normalizeTerm('  Joust   DUFFLE bag ')).toBe('joust duffle bag');
        expect(normalizeTerm(null)).toBe('');
        expect(normalizeTerm('x'.repeat(80))).toHaveLength(64);
    });

    test('records newest first, deduplicated, capped, at least two characters, per scope', () => {
        const listener = vi.fn();
        document.addEventListener(HISTORY_EVENT, listener);
        expect(recordSearch('b', '/')).toBe(false);
        for (let i = 1; i <= MAX_ITEMS + 2; i++) expect(recordSearch('term ' + i, '/')).toBe(true);
        recordSearch(' Term 3 ', '/');
        recordSearch('altro', '/it/');
        const terms = getRecentSearches('/');
        expect(terms).toHaveLength(MAX_ITEMS);
        expect(terms[0]).toBe('term 3');
        expect(terms.filter((t) => t === 'term 3')).toHaveLength(1);
        expect(terms[1]).toBe('term ' + (MAX_ITEMS + 2));
        expect(getRecentSearches('/it/')).toEqual(['altro']);
        expect(listener).toHaveBeenCalledTimes(MAX_ITEMS + 4);
        expect(listener.mock.calls.at(-1)[0].detail).toEqual({ scope: '/it/', term: 'altro' });
        document.removeEventListener(HISTORY_EVENT, listener);
    });

    test('survives malformed storage', () => {
        localStorage.setItem(STORAGE_KEY, '[not an object');
        expect(getRecentSearches('/')).toEqual([]);
        expect(recordSearch('bag', '/')).toBe(true);
        expect(getRecentSearches('/')).toEqual(['bag']);
    });

    test('scopes the history on the search form path and builds the results URL from it', () => {
        document.body.innerHTML = header('https://shop.example/it/catalogsearch/result/', ' Bag ');
        expect(searchScope()).toBe('/it/');
        expect(currentQuery()).toBe('bag');
        expect(searchResultUrl('red bag')).toBe('https://shop.example/it/catalogsearch/result/?q=red+bag');
        document.body.innerHTML = '';
        expect(searchScope()).toBe('/');
        expect(currentQuery()).toBe('');
    });

    test('reads the landing query of a results page only', () => {
        expect(landingQuery({ pathname: '/catalogsearch/result/', search: '?q=Joust+Bag&p=2' })).toBe('joust bag');
        expect(landingQuery({ pathname: '/men/tops-men.html', search: '?q=bag' })).toBe('');
    });

    test('renders the pills, marks the typed query active and hides an empty section', () => {
        document.body.innerHTML = header('/catalogsearch/result/', 'bag') + dropdown();
        const section = document.querySelector('[data-hyperion-recent-searches]');
        expect(renderRecentSearches(section)).toBe(0);
        expect(section.hidden).toBe(true);
        recordSearch('bag', '/');
        recordSearch('hoodie', '/');
        expect(renderRecentSearches(section)).toBe(2);
        expect(section.hidden).toBe(false);
        const links = pills();
        expect(links.map((a) => a.textContent)).toEqual(['hoodie', 'bag']);
        expect(links[1].getAttribute('href')).toContain('q=bag');
        expect(links[1].getAttribute('aria-current')).toBe('true');
        expect(links[1].className).toContain('bg-primary text-on-primary');
        expect(links[0].getAttribute('aria-current')).toBeNull();
        expect(links[0].className).toContain('bg-surface-raised');
        // A pill is never built from HTML.
        recordSearch('<img src=x onerror=alert(1)>', '/');
        renderRecentSearches(section);
        expect(document.querySelector('[data-hyperion-recent-searches-list] img')).toBeNull();
        expect(pills()[0].textContent).toBe('<img src=x onerror=alert(1)>');
    });

    describe('wired on the page', () => {
        beforeAll(() => {
            document.body.innerHTML = header();
            initSearchHistory();
            document.addEventListener('click', (e) => e.preventDefault());
        });

        test('hydrates the dropdown after an HTMX swap', () => {
            document.body.innerHTML = header('/catalogsearch/result/', 'ba');
            recordSearch('bag', '/');
            const target = document.getElementById('header-search-suggestions');
            target.innerHTML = dropdown();
            target.dispatchEvent(new CustomEvent('htmx:afterSwap', { bubbles: true, detail: { target } }));
            expect(document.querySelector('[data-hyperion-recent-searches]').hidden).toBe(false);
            expect(pills().map((a) => a.textContent)).toEqual(['bag']);
            expect(hydrateRecentSearches(target)).toBe(1);
        });

        test('records a submitted search form', () => {
            document.body.innerHTML = header('/catalogsearch/result/', ' Yoga Strap ');
            document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            expect(getRecentSearches('/')[0]).toBe('yoga strap');
        });

        test('records the typed query on a suggestion click, the pill term on a pill click', () => {
            document.body.innerHTML = header('/catalogsearch/result/', 'duffle') + dropdown();
            document.getElementById('product-link').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(getRecentSearches('/')[0]).toBe('duffle');
            recordSearch('older term', '/');
            renderRecentSearches(document.querySelector('[data-hyperion-recent-searches]'));
            pills().find((a) => a.textContent === 'duffle').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(getRecentSearches('/')[0]).toBe('duffle');
            document.body.innerHTML = '<a id="outside" href="/x.html">x</a>';
            document.getElementById('outside').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(getRecentSearches('/')[0]).toBe('duffle');
        });
    });
});

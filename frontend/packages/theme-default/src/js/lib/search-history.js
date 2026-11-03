// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Recent searches of the shopper, kept in localStorage.
//
// The autocomplete fragment (`hyperion/search/suggest`) is public and shared
// by every visitor through Varnish, so anything personal in the dropdown has
// to come from the browser: this module records the terms the shopper
// searches (a submitted search form, a click on a suggestion, a landing on
// the results page) and, after every swap of the dropdown, fills its hidden
// "Recent Searches" section with one pill per term. Terms are normalized
// like the server does (trimmed, lower case, inner whitespace collapsed),
// kept newest first per store (the path the search form posts to, so a
// store view served under its own path keeps its own list) and capped.

export const STORAGE_KEY = 'hyperion_recent_searches';
export const MAX_ITEMS = 5;
export const MIN_LENGTH = 2;
export const MAX_LENGTH = 64;
export const QUERY_PARAM = 'q';
export const RESULT_PATH = 'catalogsearch/result';
export const SEARCH_FORM_SELECTOR = 'form[role="search"]';
export const SUGGEST_SELECTOR = '[data-hyperion-search-suggest]';
export const CONTAINER_SELECTOR = '[data-hyperion-recent-searches]';
export const LIST_SELECTOR = '[data-hyperion-recent-searches-list]';
export const TERM_ATTRIBUTE = 'data-hyperion-recent-term';
export const HISTORY_EVENT = 'hyperion:search-history';

const PILL_CLASS = 'inline-block rounded-full px-3.5 py-1.5 text-xs font-medium bg-surface-raised text-secondary '
    + 'hover:bg-primary hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors';
const ACTIVE_PILL_CLASS = 'inline-block rounded-full px-3.5 py-1.5 text-xs font-medium bg-primary text-on-primary '
    + 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors';

function storage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readAll() {
    const store = storage();
    if (!store) return {};
    try {
        const parsed = JSON.parse(store.getItem(STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(data) {
    const store = storage();
    if (!store) return false;
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

/** The server's shape of a query: trimmed, lower case, one space between words, capped. */
export function normalizeTerm(raw) {
    return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_LENGTH);
}

/** The search form of the page (header panel first, mobile drawer otherwise). */
export function searchForm(root = document) {
    return root.querySelector?.('[data-hyperion-search-panel] ' + SEARCH_FORM_SELECTOR)
        || root.querySelector?.(SEARCH_FORM_SELECTOR)
        || null;
}

/**
 * The results URL the search form posts to, as a URL object; the fallback
 * is the default store path.
 */
export function searchResultBase(root = document) {
    const action = searchForm(root)?.getAttribute('action');
    try {
        return new URL(action || '/' + RESULT_PATH + '/', pageUrl());
    } catch {
        return new URL('/' + RESULT_PATH + '/', pageUrl());
    }
}

function pageUrl() {
    try {
        return new URL(window.location.href);
    } catch {
        return new URL('http://localhost/');
    }
}

/** The store scope of the history: the path before `catalogsearch/result` of the search form. */
export function searchScope(root = document) {
    const pathname = searchResultBase(root).pathname;
    const index = pathname.indexOf(RESULT_PATH);
    return index >= 0 ? pathname.slice(0, index) || '/' : pathname || '/';
}

/** The results page URL of a term. */
export function searchResultUrl(term, root = document) {
    const url = searchResultBase(root);
    url.searchParams.set(QUERY_PARAM, term);
    return url.toString();
}

/** @returns {string[]} the stored terms of a scope, newest first */
export function getRecentSearches(scope) {
    const list = readAll()[scope];
    if (!Array.isArray(list)) return [];
    return list.filter((term) => typeof term === 'string' && term.length >= MIN_LENGTH).slice(0, MAX_ITEMS);
}

/**
 * Put a term at the top of the scope's list (deduplicated, capped).
 * @returns {boolean} whether the write happened
 */
export function recordSearch(raw, scope) {
    const term = normalizeTerm(raw);
    if (term.length < MIN_LENGTH) return false;
    const all = readAll();
    const current = Array.isArray(all[scope]) ? all[scope] : [];
    all[scope] = [term].concat(current.filter((item) => typeof item === 'string' && item !== term)).slice(0, MAX_ITEMS);
    if (!writeAll(all)) return false;
    document.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: { scope, term } }));
    return true;
}

/** The query the shopper is typing (the header panel input, or the mobile one). */
export function currentQuery(root = document) {
    const input = searchForm(root)?.querySelector('input[name="' + QUERY_PARAM + '"]');
    return normalizeTerm(input?.value);
}

/**
 * Fill the "Recent Searches" section of a swapped dropdown: one pill per
 * term (the one equal to the typed query painted active), the section
 * hidden when there is nothing to show. Built with DOM calls: the terms
 * are the shopper's own text and never go through innerHTML.
 * @param {Element} container the `[data-hyperion-recent-searches]` section
 */
export function renderRecentSearches(container, scope = searchScope(), activeQuery = currentQuery()) {
    const list = container?.querySelector?.(LIST_SELECTOR);
    if (!list) return 0;
    const terms = getRecentSearches(scope);
    list.replaceChildren();
    for (const term of terms) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = searchResultUrl(term);
        link.className = term === activeQuery ? ACTIVE_PILL_CLASS : PILL_CLASS;
        link.setAttribute(TERM_ATTRIBUTE, term);
        if (term === activeQuery) link.setAttribute('aria-current', 'true');
        link.textContent = term;
        item.appendChild(link);
        list.appendChild(item);
    }
    container.hidden = terms.length === 0;
    return terms.length;
}

/** Hydrate every recent searches section inside `root` (the swap target). */
export function hydrateRecentSearches(root = document) {
    const scope = searchScope();
    const query = currentQuery();
    const containers = [];
    if (root?.matches?.(CONTAINER_SELECTOR)) containers.push(root);
    root?.querySelectorAll?.(CONTAINER_SELECTOR).forEach((c) => containers.push(c));
    let count = 0;
    for (const container of containers) count += renderRecentSearches(container, scope, query);
    return count;
}

/** The `q` of a results page URL, when the location is one. */
export function landingQuery(location = window.location) {
    if (!String(location.pathname || '').includes(RESULT_PATH)) return '';
    try {
        return normalizeTerm(new URLSearchParams(location.search).get(QUERY_PARAM));
    } catch {
        return '';
    }
}

function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(SEARCH_FORM_SELECTOR)) return;
    recordSearch(form.querySelector('input[name="' + QUERY_PARAM + '"]')?.value, searchScope());
}

function onClick(event) {
    const link = event.target?.closest?.('a[href]');
    if (!link || !link.closest(SUGGEST_SELECTOR)) return;
    recordSearch(link.getAttribute(TERM_ATTRIBUTE) || currentQuery(), searchScope());
}

function onAfterSwap(event) {
    hydrateRecentSearches(event?.detail?.target || event?.target);
}

/** Wire the listeners and record a results page landing; called by entry.js. */
export function initSearchHistory(root = document) {
    const landing = landingQuery();
    if (landing) recordSearch(landing, searchScope(root));
    hydrateRecentSearches(root);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('click', onClick, true);
    document.body.addEventListener('htmx:afterSwap', onAfterSwap);
}

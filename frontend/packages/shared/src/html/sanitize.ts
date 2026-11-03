// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Allowlist HTML sanitizer for the few places where Magento hands the
 * storefront display HTML: session messages (the `mage-messages` cookie)
 * and admin-authored rich text in the checkout.
 *
 * Not a general-purpose sanitizer. The input is parsed into an inert
 * document (DOMParser: no script runs, no resource loads, no event
 * handler fires) and the output is rebuilt node by node from the
 * allowlist, so nothing that is not named here can reach the page.
 * Attributes are dropped, except the listed ones on links.
 */

export interface SanitizeOptions {
    /** Element names kept in the output. Anything else is unwrapped to its children. */
    tags?: readonly string[];
    /** Attributes kept on `<a>`. */
    linkAttributes?: readonly string[];
    /** URL schemes (with the colon) a link may point to; relative links resolve to the page's own. */
    linkProtocols?: readonly string[];
}

/** Inline formatting and lists, as Magento's rich-text editor emits them. */
export const RICH_TEXT_TAGS: readonly string[] = [
    'p', 'br', 'strong', 'em', 'b', 'i', 'u',
    'ul', 'ol', 'li',
    'a', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
];

/** What core's message component allows (Magento_Theme/js/view/messages.js). */
export const MESSAGE_TAGS: readonly string[] = ['div', 'span', 'b', 'strong', 'i', 'em', 'u', 'a'];

export const MESSAGE_OPTIONS: SanitizeOptions = {
    tags: MESSAGE_TAGS,
    linkAttributes: ['href'],
    linkProtocols: ['http:', 'https:'],
};

const DEFAULT_LINK_ATTRIBUTES: readonly string[] = ['href', 'title', 'rel', 'target'];
const DEFAULT_LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:'];

/** Elements whose content is code or foreign markup, never text to show. */
const DISCARDED_TAGS = new Set([
    'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed',
    'svg', 'math', 'textarea', 'title', 'head',
]);

interface Rules {
    tags: Set<string>;
    linkAttributes: Set<string>;
    linkProtocols: Set<string>;
}

function parse(input: string): { doc: Document; root: Element | null } {
    const doc = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html');
    return { doc, root: doc.body.firstElementChild };
}

/**
 * The scheme is decided by the URL parser, not by a pattern: it is what
 * the browser will use and it is immune to case and whitespace tricks.
 */
function isSafeHref(href: string, protocols: Set<string>): boolean {
    try {
        return protocols.has(new URL(href, window.location.origin).protocol);
    } catch {
        return false;
    }
}

function cleanLink(source: Element, clean: Element, rules: Rules): void {
    for (const attr of Array.from(source.attributes)) {
        const name = attr.name.toLowerCase();
        if (rules.linkAttributes.has(name)) {
            clean.setAttribute(name, attr.value);
        }
    }
    const href = clean.getAttribute('href') ?? '';
    if (href && !isSafeHref(href.trim(), rules.linkProtocols)) {
        clean.removeAttribute('href');
    }
    const target = clean.getAttribute('target');
    if (target !== null && target !== '_blank') {
        clean.removeAttribute('target');
    }
    const safeHref = clean.getAttribute('href') ?? '';
    if (/^https?:/i.test(safeHref) || clean.getAttribute('target') === '_blank') {
        clean.setAttribute('rel', 'noopener noreferrer');
    }
}

function appendClean(doc: Document, source: Node, target: Node, rules: Rules): void {
    source.childNodes.forEach((child) => {
        if (child.nodeType === 3) {
            target.appendChild(doc.createTextNode(child.textContent ?? ''));
            return;
        }
        if (child.nodeType !== 1) {
            return;
        }
        const element = child as Element;
        const tag = element.tagName.toLowerCase();
        if (DISCARDED_TAGS.has(tag)) {
            return;
        }
        if (!rules.tags.has(tag)) {
            appendClean(doc, element, target, rules);
            return;
        }
        const clean = doc.createElement(tag);
        if (tag === 'a') {
            cleanLink(element, clean, rules);
        }
        appendClean(doc, element, clean, rules);
        target.appendChild(clean);
    });
}

/**
 * HTML that holds only the allowed elements; safe to assign to `innerHTML`.
 */
export function sanitizeHtml(input: string, options: SanitizeOptions = {}): string {
    const { doc, root } = parse(String(input ?? ''));
    if (!root) return '';
    const out = doc.createElement('div');
    appendClean(doc, root, out, {
        tags: new Set(options.tags ?? RICH_TEXT_TAGS),
        linkAttributes: new Set(options.linkAttributes ?? DEFAULT_LINK_ATTRIBUTES),
        linkProtocols: new Set(options.linkProtocols ?? DEFAULT_LINK_PROTOCOLS),
    });
    return out.innerHTML;
}

/**
 * Session message from Magento as HTML: core's message allowlist, links
 * to http(s) and relative targets only.
 */
export function sanitizeMessageHtml(input: string): string {
    return sanitizeHtml(input, MESSAGE_OPTIONS);
}

/**
 * Plain text of a value Magento hands out as display HTML (messages, cart
 * item option values: escaped text, list entries joined with `<br />`,
 * bundle selections with the price in a `<span>`). Line breaks become `, `.
 */
export function htmlToText(input: string): string {
    const { doc, root } = parse(String(input ?? ''));
    if (!root) return '';
    root.querySelectorAll(Array.from(DISCARDED_TAGS).join(',')).forEach((element) => element.remove());
    root.querySelectorAll('br').forEach((br) => br.replaceWith(doc.createTextNode(', ')));
    return (root.textContent ?? '').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Collapsible navigation blocks of CMS content (`.block-collapsible-nav`).
//
// The Luma sample "Privacy Policy" page carries a section menu whose title
// core toggles with the RequireJS `toggleAdvanced` widget (class `active`
// on the title). The title is a plain <div> inside stored CMS content, so
// this module gives it the button semantics on narrow viewports (role,
// tabindex, aria-expanded, aria-controls) and toggles `active` on click,
// Enter and Space; _widgets.css shows the menu below md only while the
// title is active and always above it, where the title is a heading again.
// Delegated on the root; the media query change re-applies the semantics.

const NAV = '.block-collapsible-nav';
const TITLE = `${NAV} > .title`;
const CONTENT = ':scope > .block-collapsible-content, :scope > .content';
export const NARROW = '(max-width: 767.98px)';

let ids = 0;

function contentOf(title) {
    return title.parentElement?.querySelector(CONTENT) ?? null;
}

function isOpen(title) {
    return title.classList.contains('active');
}

function enhance(title, narrow) {
    if (!narrow) {
        ['role', 'tabindex', 'aria-expanded', 'aria-controls'].forEach((name) => title.removeAttribute(name));
        return;
    }
    const content = contentOf(title);
    if (content && !content.id) content.id = `hyperion-collapsible-nav-${++ids}`;
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.setAttribute('aria-expanded', isOpen(title) ? 'true' : 'false');
    if (content) title.setAttribute('aria-controls', content.id);
}

export function toggleCollapsibleNav(title, open = !isOpen(title)) {
    title.classList.toggle('active', open);
    title.setAttribute('aria-expanded', open ? 'true' : 'false');
    return open;
}

export function installCollapsibleNav(root = document) {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null;
    const narrow = () => (media ? media.matches : true);
    const titles = () => [...root.querySelectorAll(TITLE)];

    const apply = () => titles().forEach((title) => enhance(title, narrow()));

    const onClick = (event) => {
        const title = event.target.closest(TITLE);
        if (!title || !narrow()) return;
        event.preventDefault();
        toggleCollapsibleNav(title);
    };

    const onKeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const title = event.target.closest?.(TITLE);
        if (!title || !narrow()) return;
        event.preventDefault();
        toggleCollapsibleNav(title);
    };

    apply();
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('htmx:afterSettle', apply);
    media?.addEventListener?.('change', apply);

    return () => {
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKeydown);
        root.removeEventListener('htmx:afterSettle', apply);
        media?.removeEventListener?.('change', apply);
    };
}

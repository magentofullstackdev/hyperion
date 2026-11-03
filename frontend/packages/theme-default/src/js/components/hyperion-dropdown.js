// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css, nothing } from 'lit';
import { focusFirst, trapTabKey } from '../lib/focus-trap.js';
import { lockBodyScroll, unlockBodyScroll } from '../lib/scroll-lock.js';
import { dismissAllNotifications } from './hyperion-notification.js';

// Hyperion dropdown -- supports two placement modes:
//   placement="inline" (default): absolute flyout below the trigger. Used
//     for in-page menus such as account switchers where a small panel is
//     acceptable.
//   placement="drawer":           fixed off-canvas drawer sliding in from
//     the right edge with a dark backdrop. Used for the mobile navigation
//     menu in the header (the `bottom-end` Luma-era value is also treated
//     as drawer for backwards compatibility).
export class HyperionDropdown extends LitElement {
    static properties = {
        label: { type: String, reflect: true },
        menuLabel: { type: String, attribute: 'menu-label', reflect: true },
        placement: { type: String, reflect: true },
        _open: { state: true },
    };

    static styles = css`
        :host {
            --dropdown-background: rgb(var(--color-surface));
            --dropdown-surface-raised: rgb(var(--color-surface-raised));
            --dropdown-border-radius: 0.25rem;
            --dropdown-border-color: rgb(var(--color-subtle));
            --dropdown-text-color: rgb(var(--color-secondary));
            --dropdown-focus-ring-color: rgb(var(--color-primary));
            --drawer-width: 20rem;
            --drawer-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
            --backdrop-color: rgba(0, 0, 0, 0.5);
            --transition-duration: 0.3s;
            display: inline-block;
            position: relative;
        }

        [part="trigger"] {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            background: transparent;
            border: none;
            color: var(--dropdown-text-color);
            cursor: pointer;
            padding: 0.5rem 0.75rem;
            border-radius: var(--dropdown-border-radius);
        }

        [part="trigger"]:focus-visible {
            outline: 2px solid var(--dropdown-focus-ring-color);
            outline-offset: 2px;
        }

        /* A slotted trigger replaces the built-in button: the hidden
           attribute must win over the inline-flex above, or the empty
           button keeps its padding (24px) next to the slotted one. */
        [part="trigger"][hidden] {
            display: none;
        }

        /* Inline (default) placement -- unchanged legacy behavior. */
        [part="panel"] {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            min-width: 100%;
            background: var(--dropdown-background);
            border: 1px solid var(--dropdown-border-color);
            border-radius: var(--dropdown-border-radius);
            z-index: 100;
            padding: 0.25rem 0;
        }

        [part="panel"][hidden] {
            display: none;
        }

        [part="backdrop"] {
            display: none;
        }

        /* Drawer placement -- fixed off-canvas sidebar from the right edge.
           Other placements (bottom-end, bottom-start, ...) keep the default
           popover styling above (absolute below the trigger). */
        :host([placement="drawer"]) {
            position: static;
        }

        :host([placement="drawer"]) [part="backdrop"] {
            display: block;
            position: fixed;
            inset: 0;
            background: var(--backdrop-color);
            opacity: 0;
            visibility: hidden;
            transition: opacity var(--transition-duration) ease, visibility var(--transition-duration) ease;
            z-index: 9998;
        }

        :host([placement="drawer"][open]) [part="backdrop"] {
            opacity: 1;
            visibility: visible;
        }

        :host([placement="drawer"]) [part="panel"] {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: auto;
            /* 100% of the viewport minus the scrollbar: a viewport unit
               includes the scrollbar and, with the root's stable gutter,
               overflows the page by its width. */
            width: 100%;
            max-width: var(--drawer-width);
            min-width: auto;
            background: var(--dropdown-background);
            border: none;
            border-radius: 0;
            box-shadow: var(--drawer-shadow);
            padding: 0;
            transform: translateX(100%);
            transition: transform var(--transition-duration) ease;
            z-index: 9999;
            overflow-y: auto;
        }

        :host([placement="drawer"]) [part="panel"][hidden] {
            display: flex;
        }

        :host([placement="drawer"][open]) [part="panel"] {
            transform: translateX(0);
        }

        /* Anchor the panel to the right edge of the trigger for bottom-end. */
        :host([placement="bottom-end"]) [part="panel"] {
            left: auto;
            right: 0;
        }

        @media (prefers-reduced-motion: reduce) {
            [part="panel"], [part="backdrop"] { transition: none; }
        }
    `;

    constructor() {
        super();
        this.label     = '';
        this.menuLabel = '';
        this.placement = 'inline';
        this._open     = false;
        this._onOutsideClick = this._onOutsideClick.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('click', this._onOutsideClick);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('click', this._onOutsideClick);
        if (this._open && this._isDrawer()) unlockBodyScroll();
    }

    updated(changed) {
        if (changed.has('_open')) {
            // The slotted light-DOM trigger is the real opener: keep its
            // expanded state in sync (the internal button has its own).
            this.querySelector('[slot="trigger"]')?.setAttribute('aria-expanded', String(this._open));
            if (this._open) {
                this.setAttribute('open', '');
                if (this._isDrawer()) {
                    lockBodyScroll();
                    dismissAllNotifications();
                    // A modal drawer takes the focus with it; the opener
                    // gets it back in _close(). Never on a text field: the
                    // mobile menu starts with the search box and a phone
                    // would raise its keyboard over the menu on every open
                    // (a tap on the box is what starts a search).
                    requestAnimationFrame(() => {
                        const panel = this.shadowRoot?.querySelector('[part="panel"]');
                        if (panel && this._open) focusFirst(panel, { avoidTextEntry: true });
                    });
                }
            } else {
                this.removeAttribute('open');
                if (this._isDrawer() && changed.get('_open') === true) unlockBodyScroll();
            }
        }
    }

    // The element that opened the panel: the slotted trigger when the
    // template provides one, otherwise the internal button.
    _opener() {
        return this.querySelector('[slot="trigger"]') ?? this.shadowRoot?.querySelector('[part="trigger"]');
    }

    // `drawer` is the only placement that renders as a full-viewport
    // right-edge side panel. `bottom-end` / `bottom-start` / etc. are
    // popover placements anchored under the trigger: rendering them
    // as drawers would turn the header Account button into a side-menu
    // overlay instead of the compact popup the design calls for.
    _isDrawer() {
        return this.placement === 'drawer';
    }

    _toggle() {
        this._open = !this._open;
        this._emitToggle();
    }

    // The opener is a header control inside the sticky wrapper: a plain
    // focus() makes Chrome scroll the page towards its in-flow position when the
    // drawer closes after a scroll. The header is on screen, the focus return
    // never needs to scroll.
    _close() {
        if (!this._open) return;
        this._open = false;
        this._emitToggle();
        this._opener()?.focus({ preventScroll: true });
    }

    _emitToggle() {
        this.dispatchEvent(new CustomEvent('hyperion-dropdown-toggle', {
            bubbles: true,
            composed: true,
            detail: { open: this._open },
        }));
    }

    _onOutsideClick(e) {
        if (!this._open) return;
        if (!e.composedPath().includes(this)) {
            this._open = false;
            this._emitToggle();
        }
    }

    _onBackdropClick() {
        this._close();
    }

    _onTriggerKey(e) {
        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                this._toggle();
                // A keyboard open lands on the first item (menu button
                // pattern); the drawer focuses its first control itself in
                // updated(), the pointer path (click) leaves the focus alone.
                if (this._open && !this._isDrawer()) {
                    this.updateComplete.then(() => this._focusFirstItem());
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (!this._open) {
                    this._open = true;
                    this._emitToggle();
                }
                this.updateComplete.then(() => this._focusFirstItem());
                break;
            case 'Escape':
                this._close();
                break;
        }
    }

    _onPanelKey(e) {
        if (e.key === 'Tab' && this._isDrawer() && this._open) {
            trapTabKey(e, e.currentTarget);
            return;
        }
        switch (e.key) {
            case 'Escape':
                this._close();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this._focusNextItem(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._focusNextItem(-1);
                break;
        }
    }

    _getMenuItems() {
        const slot = this.shadowRoot.querySelector('slot:not([name])');
        if (!slot) return [];
        return slot.assignedElements({ flatten: true }).flatMap(el => {
            if (el.matches('[role="menuitem"], a, button')) return [el];
            return [...el.querySelectorAll('[role="menuitem"], a, button')];
        });
    }

    _focusFirstItem() {
        const items = this._getMenuItems();
        items[0]?.focus({ preventScroll: true });
    }

    _focusNextItem(direction) {
        const items = this._getMenuItems();
        if (!items.length) return;
        const current = document.activeElement;
        const idx     = items.indexOf(current);
        const next    = (idx + direction + items.length) % items.length;
        items[next]?.focus({ preventScroll: true });
    }

    render() {
        const drawer = this._isDrawer();
        return html`
            <slot name="trigger" @click=${this._toggle} @keydown=${this._onTriggerKey}></slot>
            <button
                part="trigger"
                aria-haspopup="${drawer ? 'dialog' : nothing}"
                aria-expanded="${this._open}"
                @click=${this._toggle}
                @keydown=${this._onTriggerKey}
                ?hidden=${this.querySelector('[slot="trigger"]') !== null}
            >
                <slot name="trigger-icon"></slot>
                <span>${this.label}</span>
            </button>
            <div
                part="backdrop"
                aria-hidden="${!this._open}"
                @click=${this._onBackdropClick}
            ></div>
            <div
                part="panel"
                role="${drawer ? 'dialog' : nothing}"
                aria-modal="${drawer ? 'true' : nothing}"
                aria-label="${drawer ? this.menuLabel || nothing : nothing}"
                aria-hidden="${!this._open}"
                ?hidden=${!this._open}
                ?inert=${!this._open}
                @keydown=${this._onPanelKey}
            >
                <slot></slot>
            </div>
        `;
    }
}

if (!customElements.get('hyperion-dropdown')) {
    customElements.define('hyperion-dropdown', HyperionDropdown);
}

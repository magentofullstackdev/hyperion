// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css, nothing } from 'lit';

// --- hyperion-tab (child component) -----------------------------------------
export class HyperionTab extends LitElement {
    static properties = {
        label: { type: String },
        active: { type: Boolean, reflect: true },
    };

    static styles = css`
        :host {
            display: block;
        }
        :host(:not([active])) {
            display: none;
        }
    `;

    constructor() {
        super();
        this.label  = '';
        this.active = false;
    }

    render() {
        return html`<slot></slot>`;
    }
}

if (!customElements.get('hyperion-tab')) {
    customElements.define('hyperion-tab', HyperionTab);
}

// --- hyperion-tabs (parent component) ---------------------------------------
let _tabsInstanceCounter = 0;

export class HyperionTabs extends LitElement {
    static properties = {
        tablistLabel: { type: String, attribute: 'tablist-label' },
        _activeIndex: { state: true },
        _tabs: { state: true },
    };

    static styles = css`
        :host {
            --tabs-background: rgb(var(--color-surface));
            --tabs-border-color: rgb(var(--color-subtle));
            --tabs-active-color: rgb(var(--color-primary));
            --tabs-text-color: rgb(var(--color-secondary));
            --tabs-header-padding: 0.75rem 1rem;
            display: block;
        }

        [part="tab-list"] {
            display: flex;
            /* Narrower than the labels (three tabs at 320px) the strip wraps
               instead of widening the page: a tab is never split over two
               lines, a row is. The skeleton strip (product/view.phtml) wraps
               the same way. */
            flex-wrap: wrap;
            border-bottom: 1px solid var(--tabs-border-color);
            background: var(--tabs-background);
        }

        [part="tab"] {
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--tabs-text-color);
            cursor: pointer;
            padding: var(--tabs-header-padding);
            margin-bottom: -1px;
            /* The page's font, not the UA button font: the server rendered strip
               skeleton (product/view.phtml) must measure the same (CLS). */
            font: inherit;
            line-height: 1.5;
            white-space: nowrap;
        }

        [part="tab"][aria-selected="true"] {
            color: var(--tabs-active-color);
            border-bottom-color: var(--tabs-active-color);
        }

        [part="tab"]:focus-visible {
            outline: 2px solid var(--tabs-active-color);
            outline-offset: 2px;
        }

        [part="panel"] {
            padding: 1rem 0;
        }
    `;

    constructor() {
        super();
        this.tablistLabel = '';
        this._activeIndex = 0;
        this._tabs        = [];
        this._uid         = `htabs-${++_tabsInstanceCounter}`;
    }

    connectedCallback() {
        super.connectedCallback();
        this._onHashChange = () => this._revealHashTarget();
        window.addEventListener('hashchange', this._onHashChange);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('hashchange', this._onHashChange);
    }

    onSlotChange() {
        const tabs = [...this.children].filter(
            el => el.tagName?.toLowerCase() === 'hyperion-tab'
        );
        this._tabs = tabs;
        this._applyActiveState(this._activeIndex);
        this._revealHashTarget();
    }

    /**
     * A link such as `#reviews` or `#review-form` may point inside a tab
     * that is not the open one: open that tab, then scroll to the target.
     */
    _revealHashTarget() {
        const id = decodeURIComponent(window.location.hash.slice(1));
        if (!id) return;
        const target = document.getElementById(id);
        const index = target ? this._tabs.findIndex((tab) => tab.contains(target)) : -1;
        if (index === -1) return;
        if (index !== this._activeIndex) this.activate(index);
        this.updateComplete.then(() => target.scrollIntoView({ block: 'start' }));
    }

    activate(i) {
        this._activeIndex = i;
        this._applyActiveState(i);
        this.dispatchEvent(new CustomEvent('hyperion-tabs-change', {
            bubbles: true,
            composed: true,
            detail: { index: i },
        }));
    }

    _applyActiveState(activeIdx) {
        this._tabs.forEach((tab, i) => {
            const isActive = i === activeIdx;
            if (isActive) {
                tab.setAttribute('active', '');
            } else {
                tab.removeAttribute('active');
            }
        });
        // Sync tabindex on tab buttons after next render
        this.updateComplete.then(() => {
            const buttons = this.shadowRoot?.querySelectorAll('[part="tab"]') ?? [];
            buttons.forEach((btn, i) => {
                btn.setAttribute('tabindex', i === this._activeIndex ? '0' : '-1');
                btn.setAttribute('aria-selected', String(i === this._activeIndex));
            });
        });
    }

    onKeyDown(e) {
        const count = this._tabs.length;
        if (!count) return;
        let next = this._activeIndex;
        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                next = (this._activeIndex + 1) % count;
                break;
            case 'ArrowLeft':
                e.preventDefault();
                next = (this._activeIndex - 1 + count) % count;
                break;
            case 'Home':
                e.preventDefault();
                next = 0;
                break;
            case 'End':
                e.preventDefault();
                next = count - 1;
                break;
            case 'Enter':
            case ' ': {
                e.preventDefault();
                const focused = this.shadowRoot?.activeElement;
                const buttons = [...(this.shadowRoot?.querySelectorAll('[part="tab"]') ?? [])];
                const idx     = buttons.indexOf(focused);
                if (idx !== -1) this.activate(idx);
                return;
            }
            default:
                return;
        }
        this.activate(next);
        this.updateComplete.then(() => {
            this.shadowRoot?.querySelectorAll('[part="tab"]')[next]?.focus();
        });
    }

    render() {
        const uid = this._uid;
        return html`
            <div
                part="tab-list"
                role="tablist"
                aria-label="${this.tablistLabel || nothing}"
                @keydown=${this.onKeyDown}
            >
                ${this._tabs.map((tab, i) => html`
                    <button
                        part="tab"
                        role="tab"
                        id="hyperion-tab-${i}-${uid}"
                        aria-selected="${i === this._activeIndex}"
                        aria-controls="hyperion-panel-${uid}"
                        tabindex="${i === this._activeIndex ? '0' : '-1'}"
                        @click=${() => this.activate(i)}
                    >${tab.label}</button>
                `)}
            </div>
            <div
                part="panel"
                role="tabpanel"
                id="hyperion-panel-${uid}"
                aria-labelledby="hyperion-tab-${this._activeIndex}-${uid}"
            >
                <slot @slotchange=${this.onSlotChange}></slot>
            </div>
        `;
    }
}

if (!customElements.get('hyperion-tabs')) {
    customElements.define('hyperion-tabs', HyperionTabs);
}

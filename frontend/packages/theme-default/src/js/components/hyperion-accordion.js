// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css } from 'lit';

// --- hyperion-accordion-item (child component) -------------------------------
let _accordionItemCounter = 0;

export class HyperionAccordionItem extends LitElement {
    static properties = {
        label: { type: String },
        open: { type: Boolean, reflect: true },
    };

    static styles = css`
        :host {
            display: block;
        }

        [part="header"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background: var(--accordion-header-background, rgb(var(--color-surface-raised)));
            color: var(--accordion-header-color, rgb(var(--color-secondary)));
            border: none;
            cursor: pointer;
            padding: var(--accordion-header-padding, 1rem);
            text-align: left;
        }

        [part="header"]:focus-visible {
            outline: 2px solid rgb(var(--color-primary));
            outline-offset: 2px;
        }

        [part="body"] {
            padding: var(--accordion-body-padding, 1rem);
        }

        [part="body"][hidden] {
            display: none;
        }

        [part="item"] {
            border-bottom: 1px solid var(--accordion-border-color, rgb(var(--color-subtle)));
        }
    `;

    constructor() {
        super();
        this.label = '';
        this.open  = false;
        this._uid  = `hacc-${++_accordionItemCounter}`;
    }

    _toggle() {
        this.dispatchEvent(new CustomEvent('hyperion-accordion-item-toggle', {
            bubbles: true,
            composed: true,
            detail: { item: this },
        }));
    }

    _onKeyDown(e) {
        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                this._toggle();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.dispatchEvent(new CustomEvent('hyperion-accordion-item-focus-next', {
                    bubbles: true, composed: true, detail: { item: this, direction: 1 },
                }));
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.dispatchEvent(new CustomEvent('hyperion-accordion-item-focus-next', {
                    bubbles: true, composed: true, detail: { item: this, direction: -1 },
                }));
                break;
        }
    }

    focusHeader() {
        this.shadowRoot?.querySelector('[part="header"]')?.focus();
    }

    render() {
        const uid = this._uid;
        return html`
            <div part="item">
                <button
                    part="header"
                    role="button"
                    aria-expanded="${this.open}"
                    aria-controls="hacc-body-${uid}"
                    id="hacc-trigger-${uid}"
                    @click=${this._toggle}
                    @keydown=${this._onKeyDown}
                >
                    <span>${this.label}</span>
                    <span aria-hidden="true">${this.open ? '\u2212' : '+'}</span>
                </button>
                <div
                    part="body"
                    role="region"
                    id="hacc-body-${uid}"
                    aria-labelledby="hacc-trigger-${uid}"
                    ?hidden=${!this.open}
                >
                    <slot></slot>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('hyperion-accordion-item')) {
    customElements.define('hyperion-accordion-item', HyperionAccordionItem);
}

// --- hyperion-accordion (parent component) -----------------------------------
export class HyperionAccordion extends LitElement {
    static properties = {
        allowMultiple: { type: Boolean, attribute: 'allow-multiple', reflect: true },
        _openItems: { state: true },
        _itemCount: { state: true },
    };

    static styles = css`
        :host {
            --accordion-background: rgb(var(--color-surface));
            --accordion-border-color: rgb(var(--color-subtle));
            --accordion-header-background: rgb(var(--color-surface-raised));
            --accordion-header-color: rgb(var(--color-secondary));
            --accordion-header-padding: 1rem;
            --accordion-body-padding: 1rem;
            display: block;
            background: var(--accordion-background);
            border: 1px solid var(--accordion-border-color);
        }
    `;

    constructor() {
        super();
        this.allowMultiple = false;
        this._openItems    = new Set();
        this._itemCount    = 0;
        this._onItemToggle     = this._onItemToggle.bind(this);
        this._onItemFocusNext  = this._onItemFocusNext.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('hyperion-accordion-item-toggle',    this._onItemToggle);
        this.addEventListener('hyperion-accordion-item-focus-next', this._onItemFocusNext);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('hyperion-accordion-item-toggle',    this._onItemToggle);
        this.removeEventListener('hyperion-accordion-item-focus-next', this._onItemFocusNext);
    }

    _getItems() {
        // Direct-children filter instead of `:scope > hyperion-accordion-item`
        // -- the `:scope` pseudo-class is unreliable outside real browsers
        // (e.g. happy-dom returns an empty list) and tag-name filtering on
        // `this.children` is equivalent here since every item is a direct
        // child by the component contract.
        return [...this.children].filter(
            el => el.tagName?.toLowerCase() === 'hyperion-accordion-item'
        );
    }

    _onSlotChange() {
        const items = this._getItems();
        this._itemCount = items.length;
        // Pass CSS custom properties down via host
        items.forEach(item => {
            item.style.setProperty('--accordion-header-background', 'var(--accordion-header-background)');
            item.style.setProperty('--accordion-header-color',      'var(--accordion-header-color)');
            item.style.setProperty('--accordion-header-padding',    'var(--accordion-header-padding)');
            item.style.setProperty('--accordion-body-padding',      'var(--accordion-body-padding)');
            item.style.setProperty('--accordion-border-color',      'var(--accordion-border-color)');
        });
    }

    _onItemToggle(e) {
        const item  = e.detail.item;
        const items = this._getItems();
        const idx   = items.indexOf(item);
        if (idx === -1) return;

        const newOpen = new Set(this._openItems);

        if (newOpen.has(idx)) {
            newOpen.delete(idx);
            item.open = false;
        } else {
            if (!this.allowMultiple) {
                newOpen.clear();
                items.forEach((it, i) => { if (i !== idx) it.open = false; });
            }
            newOpen.add(idx);
            item.open = true;
        }

        this._openItems = newOpen;
    }

    _onItemFocusNext(e) {
        const items = this._getItems();
        const idx   = items.indexOf(e.detail.item);
        if (idx === -1) return;
        const next = idx + e.detail.direction;
        if (next >= 0 && next < items.length) {
            items[next].focusHeader();
        }
    }

    render() {
        return html`
            <slot @slotchange=${this._onSlotChange}></slot>
        `;
    }
}

if (!customElements.get('hyperion-accordion')) {
    customElements.define('hyperion-accordion', HyperionAccordion);
}

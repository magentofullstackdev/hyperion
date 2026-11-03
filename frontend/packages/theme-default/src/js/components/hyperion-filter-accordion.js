// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-filter-accordion -- exclusive-open wrapper for layered-nav filters.
 *
 * The Hyperion layered-nav template (Magento_LayeredNavigation/templates/
 * layer/view.phtml) renders each filter as a native `<details>` card.
 * Native <details> elements can all be open independently -- but the design
 * calls for only ONE filter to be expanded at a time on the category page.
 *
 * This component is a LIGHT-DOM wrapper: it doesn't render anything of its
 * own (everything stays in the light DOM so server-rendered markup keeps
 * working before the Lit bundle upgrades). Its only job is to listen for
 * the `toggle` event from every descendant `<details>` and, when one opens,
 * close the siblings.
 *
 * Usage in layer/view.phtml (wrapper around the filter cards):
 *   <hyperion-filter-accordion>
 *     <details>...</details>
 *     <details>...</details>
 *   </hyperion-filter-accordion>
 *
 * Dedicated component (per SRP memory rule): exclusive-open is a discrete
 * behavior that doesn't belong in the catch-all `hyperion-accordion`
 * component, which owns its own Shadow-DOM UI for PDP tabs/panels.
 */

const TAG = 'hyperion-filter-accordion';

class HyperionFilterAccordion extends HTMLElement {
    // Light DOM -- the filter cards stay as server-rendered <details> so the
    // page works immediately without JS.
    connectedCallback() {
        if (this._bound) return;
        this._bound = true;
        this.addEventListener('toggle', this._onToggle, true);
    }

    disconnectedCallback() {
        this.removeEventListener('toggle', this._onToggle, true);
    }

    _onToggle = (event) => {
        const opened = event.target;
        if (!(opened instanceof HTMLDetailsElement)) return;
        if (!opened.open) return;

        // Close every OTHER direct descendant <details> inside this wrapper.
        // Using querySelectorAll('details') and filtering to those whose
        // nearest .hyperion-filter-accordion ancestor is THIS element keeps
        // nested sub-accordions (if any ever exist) free of side effects.
        const details = this.querySelectorAll('details');
        for (const d of details) {
            if (d === opened) continue;
            if (d.closest(TAG) !== this) continue;
            if (d.open) d.open = false;
        }
    };
}

if (!customElements.get(TAG)) {
    customElements.define(TAG, HyperionFilterAccordion);
}

export { HyperionFilterAccordion };

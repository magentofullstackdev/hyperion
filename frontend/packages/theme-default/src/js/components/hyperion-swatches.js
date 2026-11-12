// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-swatches -- Configurable-product swatch selector.
 *
 * Replaces Magento's native swatch-renderer.js entirely.
 * The component accepts the merged Magento jsonConfig + jsonSwatchConfig blob
 * as a JSON string on its `config` attribute (produced by
 * Hyperion\Catalog\ViewModel\SwatchConfig::getEncodedConfigAttribute()).
 *
 * Behavior:
 *   * Swatch click -> local state update -> recompute compatible product id ->
 *     update price + SKU + displayed image -- NO network request.
 *   * Hidden `super_attribute[<id>]` inputs (light-DOM, typically inside the
 *     Add-to-Cart form) are kept in sync with the selection so the HTMX POST
 *     carries the correct payload.
 *   * The main gallery image is updated by pointing at the element matching
 *     the `gallery-target` CSS selector (usually `hyperion-image-zoom img`).
 *   * `hyperion-swatch-change` event is dispatched with
 *     `{ detail: { superAttributes, price, sku, productId, image } }`.
 *   * `config.defaultValues` (`{attributeId: optionId}`, the options of the
 *     buy request a wish list or cart item was saved with) are applied on
 *     first render exactly like clicks, so the edit page opens preselected.
 *   * `config.stockNotices` (`{childId: "Only N left"}`, the variants within
 *     the store's stock threshold) fills the `stock-target` element with the
 *     matched variant's notice and hides it while no variant matches.
 *
 * Attributes (all strings so server-render sets them verbatim):
 * - `config` -- JSON blob (required).
 * - `gallery-target` -- CSS selector for main image element (optional).
 * - `form-id` -- id of the Add-to-Cart form whose hidden `super_attribute[]`
 *   inputs should be updated (optional; defaults to document-wide query).
 * - `price-currency-format` -- sprintf-style currency template ("$%s").
 * - `price-target` -- CSS selector for a price `<span>` in the light DOM
 *   that should mirror the computed price (optional; the component also
 *   renders its own `price-display` part).
 * - `stock-target` -- CSS selector of the light-DOM element that shows the
 *   matched variant's stock notice (optional; nothing is written without it,
 *   so the tiles of a listing never touch the product page's element).
 */

import { LitElement, html, css } from 'lit';
import { formatPrice } from '../lib/price-format.js';

// Magento\Swatches\Model\Swatch constants. Type is a numeric-string
// in jsonSwatchConfig:
//   '0' -- empty (no swatch, fall back to option label; never matched explicitly)
//   '1' -- visual color swatch (value is a hex like "#8f8f8f")
//   '2' -- visual image swatch (value is a relative image path)
//   '3' -- textual swatch (value is a short display string like "XL")
const SWATCH_TYPE_VISUAL_COLOR = '1';
const SWATCH_TYPE_VISUAL_IMAGE = '2';
const SWATCH_TYPE_TEXTUAL = '3';

export class HyperionSwatches extends LitElement {
    static properties = {
        config: { type: String },
        galleryTarget: { type: String, attribute: 'gallery-target' },
        formId: { type: String, attribute: 'form-id' },
        priceCurrencyFormat: { type: String, attribute: 'price-currency-format' },
        priceTarget: { type: String, attribute: 'price-target' },
        stockTarget: { type: String, attribute: 'stock-target' },
        // Compact PLP-tile mode -- hides the "Color: Black / Size: XS"
        // attribute legends + the in-component price display so tiles only
        // show the bare chip row.
        compact: { type: Boolean, reflect: true },
        _parsedConfig: { state: true },
        _selected: { state: true },
        _currentProductId: { state: true },
    };

    static styles = css`
        :host {
            --swatch-size: 2rem;
            --swatch-border-radius: 0.25rem;
            --swatch-selected-border-color: rgb(var(--color-primary));
            --swatch-border-color: rgb(var(--color-subtle));
            --swatch-text-color: rgb(var(--color-secondary));
            --swatch-focus-ring-color: rgb(var(--color-primary));
            --swatch-unavailable-opacity: 0.4;
            display: block;
        }

        [part="swatch-list"] {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        /* Compact PLP-tile mode: pull the attribute groups in tight and
           drop the row-level gap -- tiles only show chip rows so the
           between-group spacing is unnecessary. */
        :host([compact]) [part="swatch-list"] {
            gap: 0.375rem;
        }

        [part="attribute-group"] {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            border: none;
            padding: 0;
            margin: 0;
        }

        :host([compact]) [part="attribute-group"] {
            gap: 0;
        }

        [part="attribute-label"] {
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--swatch-text-color);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        [part="attribute-label"] .selected-option {
            font-weight: 400;
            opacity: 0.7;
        }

        /* Hide legends and the in-component price in compact PLP mode so the
           tile only shows the chip rows; the price is delivered into the
           external price-target element on the tile instead. */
        :host([compact]) [part="attribute-label"],
        :host([compact]) [part="price-display"] {
            display: none;
        }

        [part="options"] {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        [part="swatch-item"] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: var(--swatch-size);
            height: var(--swatch-size);
            padding: 0 0.75rem;
            background: transparent;
            border: 1px solid var(--swatch-border-color);
            border-radius: var(--swatch-border-radius);
            color: var(--swatch-text-color);
            cursor: pointer;
            font: inherit;
            font-size: 0.875rem;
            transition: border-color 150ms ease-in-out;
        }

        [part="swatch-item"][aria-checked="true"] {
            border-color: var(--swatch-selected-border-color);
            border-width: 2px;
            padding: 0 calc(0.75rem - 1px);
        }

        /* Color / image swatches drop the outer button border so only the
           circular chip is visible. Textual (size) swatches keep their
           button border (the XS/S/M/L/XL boxes stay bordered). Selected state is carried by a
           ring on the chip itself instead of a 2px border on the button,
           so the chip row stays on a single visual line. */
        [part="swatch-item"][data-swatch-type="1"],
        [part="swatch-item"][data-swatch-type="2"] {
            border: 0;
            padding: 0;
            min-width: 0;
            background: transparent;
        }

        [part="swatch-item"][data-swatch-type="1"][aria-checked="true"],
        [part="swatch-item"][data-swatch-type="2"][aria-checked="true"] {
            border: 0;
            padding: 0;
        }

        [part="swatch-item"][data-swatch-type="1"][aria-checked="true"] .color-chip,
        [part="swatch-item"][data-swatch-type="2"][aria-checked="true"] .color-chip {
            box-shadow: 0 0 0 2px var(--swatch-selected-border-color);
        }

        [part="swatch-item"]:focus-visible {
            outline: 2px solid var(--swatch-focus-ring-color);
            outline-offset: 2px;
        }

        [part="swatch-item"][data-available="false"] {
            opacity: var(--swatch-unavailable-opacity);
            cursor: not-allowed;
            text-decoration: line-through;
        }

        [part="swatch-item"] .color-chip {
            display: inline-block;
            width: calc(var(--swatch-size) - 0.625rem);
            height: calc(var(--swatch-size) - 0.625rem);
            border-radius: 9999px;
            border: 1px solid var(--swatch-border-color);
            background-size: cover;
            background-position: center;
        }

        /* Shadow-DOM-local .sr-only -- Tailwind's utility does not penetrate. */
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        [part="price-display"] {
            font-weight: 700;
            font-size: 1.125rem;
            color: var(--swatch-text-color);
            margin: 0;
            display: inline-flex;
            align-items: baseline;
            gap: 0.5rem;
        }

        /* Unified price styling -- see _pricing.css.
           Final and old prices share size, weight, and color; only
           the strikethrough differentiates the old price. */
        [part="price-display"] .final,
        [part="price-display"] .old {
            font-weight: 700;
            font-size: inherit;
            color: inherit;
        }

        [part="price-display"] .old {
            text-decoration: line-through;
        }
    `;

    constructor() {
        super();
        this.config = '';
        this.galleryTarget = '';
        this.formId = '';
        this.priceCurrencyFormat = '$%s';
        this.priceTarget = '';
        this.stockTarget = '';
        this.compact = false;
        this._parsedConfig = null;
        this._selected = {};
        this._currentProductId = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._parseConfig();
    }

    updated(changed) {
        if (changed.has('config')) {
            this._parseConfig();
        }
    }

    _parseConfig() {
        if (!this.config) {
            this._parsedConfig = null;
            return;
        }
        try {
            const parsed = JSON.parse(this.config);
            this._parsedConfig = (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (_e) {
            this._parsedConfig = null;
        }
        this._applyDefaultValues();
    }

    /**
     * Preselect the options of `config.defaultValues` (wish list item edit,
     * cart item configure). Options are applied in attribute order and an
     * option that the earlier picks make unreachable is skipped, then the
     * side effects of a click follow once: hidden inputs, gallery, price,
     * change event. A selection already made by the shopper is kept.
     */
    _applyDefaultValues() {
        const defaults = this._parsedConfig?.defaultValues;
        if (!defaults || typeof defaults !== 'object' || Object.keys(this._selected).length) return;

        let applied = false;
        for (const attr of this._getAttributes()) {
            const optionId = defaults[String(attr.id)];
            if (optionId == null || optionId === '') continue;
            if (!this._isOptionAvailable(attr.id, optionId)) continue;
            this._selected = { ...this._selected, [String(attr.id)]: String(optionId) };
            applied = true;
        }
        if (applied) {
            this._commitSelection();
        }
    }

    // --- Data accessors --------------------------------------------------

    _getAttributes() {
        const cfg = this._parsedConfig;
        if (!cfg || !cfg.attributes) return [];
        return Object.values(cfg.attributes).sort(
            (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)
        );
    }

    _getSwatchMeta(attrId, optionId) {
        return this._parsedConfig?.swatches?.[String(attrId)]?.[String(optionId)] ?? null;
    }

    _getOption(attrId, optionId) {
        const attr = this._parsedConfig?.attributes?.[String(attrId)];
        if (!attr) return null;
        return attr.options.find(o => String(o.id) === String(optionId)) ?? null;
    }

    // Products still in play given current partial selection, optionally
    // excluding one attribute from the filter (used to decide if an
    // individual option is still reachable).
    _getCompatibleProductIds(excludeAttrId = null) {
        const cfg = this._parsedConfig;
        if (!cfg || !cfg.attributes) return [];
        let compatible = null;
        for (const [attrId, optionId] of Object.entries(this._selected)) {
            if (excludeAttrId !== null && String(attrId) === String(excludeAttrId)) continue;
            const option = this._getOption(attrId, optionId);
            if (!option) continue;
            const set = new Set((option.products ?? []).map(String));
            compatible = compatible === null ? set : new Set([...compatible].filter(x => set.has(x)));
        }
        if (compatible === null) {
            // No selection yet -- every product addressed by any option is in play.
            compatible = new Set();
            for (const attr of Object.values(cfg.attributes)) {
                for (const opt of attr.options) {
                    for (const p of (opt.products ?? [])) compatible.add(String(p));
                }
            }
        }
        return [...compatible];
    }

    _isOptionAvailable(attrId, optionId) {
        const option = this._getOption(attrId, optionId);
        if (!option || !(option.products ?? []).length) return false;
        const compatible = new Set(this._getCompatibleProductIds(attrId));
        return (option.products ?? []).some(p => compatible.has(String(p)));
    }

    _resolveUniqueProduct() {
        const compat = this._getCompatibleProductIds();
        return compat.length === 1 ? compat[0] : null;
    }

    _getFinalPriceAmount(productId) {
        if (!productId) return null;
        const prices = this._parsedConfig?.optionPrices?.[String(productId)];
        if (!prices) return null;
        const amount = prices.finalPrice?.amount ?? prices.basePrice?.amount ?? null;
        return amount == null ? null : Number(amount);
    }

    // The price the customer would pay WITHOUT the discount -- used to render
    // the strikethrough "was X, now Y" pair on PDP and tile when the variant
    // is on sale. Magento's Configurable block exposes this as
    // `optionPrices[productId].oldPrice.amount`. We treat an oldPrice that is
    // equal to or lower than the finalPrice as "no discount" and return null.
    _getOldPriceAmount(productId) {
        if (!productId) return null;
        const prices = this._parsedConfig?.optionPrices?.[String(productId)];
        if (!prices) return null;
        const raw = prices.oldPrice?.amount;
        if (raw == null) return null;
        const amount = Number(raw);
        const final = this._getFinalPriceAmount(productId);
        if (final == null || !(amount > final)) return null;
        return amount;
    }

    // The amount the way the server printed it for this store view: Magento's
    // `priceFormat` of the JSON config (decimal and group symbols, precision,
    // pattern). Without it, two decimals inside the currency pattern.
    _formatPrice(amount) {
        if (amount == null) return '';
        const config = this._parsedConfig;
        return formatPrice(amount, config?.priceFormat, config?.currencyFormat || this.priceCurrencyFormat || '$%s');
    }

    // Render a <span> for the final price and, when the variant is on sale,
    // an additional <span> with the original price struck through. Kept as
    // plain HTML (not a tagged template) so it can be written into the light
    // DOM via innerHTML without dragging the Lit runtime into the host page.
    _buildPriceHtml(productId) {
        const final = this._getFinalPriceAmount(productId);
        if (final == null) return '';

        const old = this._getOldPriceAmount(productId);
        const finalText = this._escape(this._formatPrice(final));

        // Unified appearance: final and old prices share weight, size, and
        // color; only the strikethrough distinguishes the old price. Per
        // the design, the post-swatch state
        // must not switch to a red sale tone.
        if (old == null) {
            return `<span class="font-bold text-secondary">${finalText}</span>`;
        }

        const oldText = this._escape(this._formatPrice(old));
        return (
            `<span class="font-bold text-secondary">${finalText}</span>` +
            ` <span class="line-through font-bold text-secondary">${oldText}</span>`
        );
    }

    _escape(text) {
        return String(text)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    _getMainImage(productId) {
        if (!productId) return null;
        const images = this._parsedConfig?.images?.[String(productId)] ?? [];
        if (!images.length) return null;
        return images.find(i => i.isMain) ?? images[0];
    }

    /**
     * Full image list for a specific child product, normalized to the
     * shape hyperion-gallery expects:
     *   [{ thumb, img, full, caption, isMain, position }]
     *
     * Magento's jsonConfig.images[productId] rows already ship those
     * keys, but defensively we fall back through alternates -- some
     * third-party extensions mutate the structure before serialisation.
     */
    _getImagesForProduct(productId) {
        if (!productId) return [];
        const raw = this._parsedConfig?.images?.[String(productId)] ?? [];
        if (!raw.length) return [];
        return raw.map((image) => ({
            thumb: image.thumb || image.img || image.full || '',
            img: image.img   || image.full || image.thumb || '',
            full: image.full  || image.img || image.thumb || '',
            caption: String(image.caption ?? image.label ?? ''),
            isMain: Boolean(image.isMain),
            position: Number.isFinite(+image.position) ? +image.position : 0,
        }));
    }

    /**
     * Resolve which child product's images to surface in the gallery
     * for the current selection. When every attribute is picked the
     * compatible set is a single product; when the shopper has only
     * chosen (say) color, every remaining SKU shares the same image
     * set and any of them works. Returns a child product id or null.
     */
    _resolveImageProduct() {
        if (this._currentProductId) return this._currentProductId;
        const compat = this._getCompatibleProductIds();
        return compat.length === 1 ? compat[0] : (compat[0] ?? null);
    }

    // --- Side effects ----------------------------------------------------

    _selectOption(attrId, optionId) {
        if (!this._isOptionAvailable(attrId, optionId)) return;
        this._selected = { ...this._selected, [String(attrId)]: String(optionId) };
        this._commitSelection();
    }

    // Everything a new selection changes outside the component.
    _commitSelection() {
        this._currentProductId = this._resolveUniqueProduct();
        this._syncHiddenInputs();
        this._syncGallery();
        this._dispatchGalleryUpdate();
        this._syncLightDomPrice();
        this._syncStockNotice();
        this._emitChange();
    }

    /**
     * Announce the image set the selected (or partially selected) variant
     * should render with. Consumers -- hyperion-gallery is the one we ship,
     * but any third-party listener can subscribe -- receive:
     *
     *   detail: {
     *     productId: number | null,    // resolved child product id
     *     images:    GalleryImage[]    // empty array -> restore base
     *   }
     *
     * The event is dispatched on `document` with bubbles + composed so
     * it escapes this component's Shadow DOM and propagates across any
     * peer custom elements mounted elsewhere on the page.
     */
    _dispatchGalleryUpdate() {
        const productId = this._resolveImageProduct();
        const images = this._getImagesForProduct(productId);
        const detail = {
            productId: productId ? Number(productId) : null,
            images,
        };
        document.dispatchEvent(new CustomEvent('hyperion:gallery-update', {
            bubbles: true,
            composed: true,
            detail,
        }));
    }

    _syncHiddenInputs() {
        const scope = this.formId
            ? document.getElementById(this.formId)
            : document;
        if (!scope) return;
        for (const [attrId, optionId] of Object.entries(this._selected)) {
            const selector = `input[name="super_attribute[${attrId}]"]`;
            const input = scope.querySelector(selector);
            if (input) input.value = String(optionId);
        }
    }

    _syncGallery() {
        // PDP: the `gallery-target` selector. Product list tile: the tile's
        // own image, found from the surrounding card.
        const target = this.galleryTarget
            ? document.querySelector(this.galleryTarget)
            : this.closest('article')?.querySelector('[data-tile-image]');
        if (!target) return;
        // A color alone is enough to preview the variant picture.
        const main = this._getMainImage(this._currentProductId || this._resolveImageProduct());
        if (!main) return;
        const src = main.img || main.full || main.thumb;
        if (src) {
            // The <source> companions (AVIF / WebP) belong to the default image
            // and would win over `src`, so they go when the picture changes.
            if (target.parentElement?.tagName === 'PICTURE') {
                target.parentElement.querySelectorAll('source').forEach((source) => source.remove());
            }
            target.src = src;
            target.removeAttribute('srcset');
        }
        if (main.caption || main.label) {
            target.alt = main.caption || main.label;
        }
    }

    // MAP state of a variant: `config.msrp[id]` exists only for variants whose
    // price must stay hidden (HyperionCatalog\ViewModel\SwatchConfig), the
    // amount is core's `optionPrices[id].msrpPrice`.
    _getMsrp(productId) {
        if (!productId) return null;
        const entry = this._parsedConfig?.msrp?.[String(productId)];
        if (!entry) return null;
        const raw = this._parsedConfig?.optionPrices?.[String(productId)]?.msrpPrice?.amount;
        const amount = raw == null ? null : Number(raw);
        return { amount, gesture: Boolean(entry.gesture), message: String(entry.message || '') };
    }

    _syncLightDomPrice() {
        if (!this.priceTarget) return;
        const amount = this._getFinalPriceAmount(this._currentProductId);
        if (amount == null) return;
        const target = document.querySelector(this.priceTarget);
        if (!target) return;
        const msrp = this._getMsrp(this._currentProductId);
        if (msrp) {
            this._syncMapPrice(target, msrp, amount);
            return;
        }
        // Use innerHTML so discounted variants render their original price
        // struck-through next to the final price. The markup is built by
        // _buildPriceHtml which escapes every text fragment. The schema.org
        // Offer survives the swap: every `<meta itemprop>` of the target (core
        // nests them in its `.price-container`, the Offer scope) is kept, the
        // `price` meta takes the variant's amount, and the metas go back into
        // an Offer scope when the server rendered one.
        const meta = Array.from(target.querySelectorAll('meta[itemprop]'));
        const scope = target.querySelector('[itemprop="offers"][itemscope]');
        const itemType = scope?.getAttribute('itemtype') || '';
        target.innerHTML = this._buildPriceHtml(this._currentProductId);
        if (!meta.length) return;
        let host = target;
        if (scope) {
            host = document.createElement('span');
            host.setAttribute('itemprop', 'offers');
            host.setAttribute('itemscope', '');
            if (itemType) host.setAttribute('itemtype', itemType);
            target.appendChild(host);
        }
        meta.forEach((el) => {
            if (el.getAttribute('itemprop') === 'price') el.setAttribute('content', String(amount));
            host.appendChild(el);
        });
    }

    // A MAP variant never shows its real price in the page: the struck MSRP
    // and the popup's "Actual Price" (Magento_Msrp::product/price/msrp.phtml)
    // are updated in place when the server rendered that block, otherwise a
    // struck MSRP with the configured message is rendered.
    _syncMapPrice(target, msrp, finalAmount) {
        const msrpText = msrp.amount == null ? '' : this._formatPrice(msrp.amount);
        const finalText = this._formatPrice(finalAmount);
        const block = target.querySelector('[data-hyperion-msrp]');
        if (block) {
            // The inner price span first: a selector list answers in document
            // order, so `.map-old-price .price, .map-old-price` would hand back
            // the outer wrapper and its textContent write would drop the span.
            const struck = block.querySelector('.map-old-price .price') ?? block.querySelector('.map-old-price');
            if (struck && msrpText) struck.textContent = msrpText;
            block.querySelectorAll('hyperion-msrp-popup').forEach((popup) => {
                if (typeof popup.setActualPriceHtml === 'function') {
                    popup.setActualPriceHtml(`<span class="price">${this._escape(finalText)}</span>`);
                }
            });
            return;
        }
        const struckHtml = msrpText
            ? `<span class="old-price map-old-price line-through font-bold text-muted">${this._escape(msrpText)}</span> `
            : '';
        const message = this._escape(msrp.message || (msrp.gesture ? this._label('clickForPrice', 'Click for price') : ''));
        target.innerHTML = `<div data-hyperion-msrp="${msrp.gesture ? 'gesture' : 'message'}">${struckHtml}<span class="msrp-message text-sm text-secondary">${message}</span></div>`;
    }

    // A label the component prints itself, translated by SwatchConfig (`labels`), English otherwise.
    _label(key, fallback) {
        const value = this._parsedConfig?.labels?.[key];
        return typeof value === 'string' && value !== '' ? value : fallback;
    }

    // "Only N left" of a variant, '' when it is not within the threshold
    // (HyperionCatalog\ViewModel\SwatchConfig `stockNotices`).
    _getStockNotice(productId) {
        if (!productId) return '';
        return String(this._parsedConfig?.stockNotices?.[String(productId)] ?? '');
    }

    // The notice shows only for a fully matched variant and goes away as soon
    // as the selection stops matching one (or matches one without a notice).
    _syncStockNotice() {
        if (!this.stockTarget) return;
        const target = document.querySelector(this.stockTarget);
        if (!target) return;
        const notice = this._getStockNotice(this._currentProductId);
        target.textContent = notice;
        target.hidden = notice === '';
    }

    _emitChange() {
        const productId = this._currentProductId;
        const amount = this._getFinalPriceAmount(productId);
        const sku = productId
            ? String(this._parsedConfig?.skus?.[String(productId)] ?? '')
            : '';
        this.dispatchEvent(new CustomEvent('hyperion-swatch-change', {
            bubbles: true,
            composed: true,
            detail: {
                superAttributes: { ...this._selected },
                price: amount,
                sku,
                productId: productId ? Number(productId) : null,
                image: this._getMainImage(productId),
                stockNotice: this._getStockNotice(productId),
            },
        }));
    }

    // --- Render ----------------------------------------------------------

    render() {
        const attrs = this._getAttributes();
        if (!attrs.length) {
            // Fallback: let the server-rendered <select>/etc. light children
            // remain usable when config is missing or parse failed.
            return html`<slot></slot>`;
        }

        // Only render the internal price-display when no external price-target
        // element is configured. When a price-target is set (PDP), the
        // component mirrors the variant price into that light-DOM element via
        // _syncLightDomPrice() -- rendering it here as well would duplicate the
        // price on the page.
        let priceHtml = '';
        if (!this.priceTarget) {
            const finalAmount = this._getFinalPriceAmount(this._currentProductId);
            const oldAmount   = this._getOldPriceAmount(this._currentProductId);
            if (finalAmount != null && oldAmount != null) {
                priceHtml = html`
                    <p part="price-display" aria-live="polite">
                        <span class="final">${this._formatPrice(finalAmount)}</span>
                        <span class="old" aria-label="${this._label('regularPrice', 'Regular Price')}">${this._formatPrice(oldAmount)}</span>
                    </p>
                `;
            } else if (finalAmount != null) {
                priceHtml = html`<p part="price-display" aria-live="polite">${this._formatPrice(finalAmount)}</p>`;
            }
        }

        return html`
            <div part="swatch-list">
                ${attrs.map(attr => this._renderAttributeGroup(attr))}
                ${priceHtml}
            </div>
        `;
    }

    _renderAttributeGroup(attr) {
        const attrIdStr = String(attr.id);
        const selectedOptionId = this._selected[attrIdStr];
        const selectedOption = selectedOptionId
            ? attr.options.find(o => String(o.id) === String(selectedOptionId))
            : null;

        return html`
            <fieldset part="attribute-group" role="radiogroup" aria-label="${attr.label || ''}">
                <legend part="attribute-label">
                    <span>${attr.label || ''}</span>
                    ${selectedOption
                        ? html`<span class="selected-option">${selectedOption.label}</span>`
                        : ''}
                </legend>
                <div part="options">
                    ${attr.options.map(opt => this._renderSwatchOption(attr, opt))}
                </div>
            </fieldset>
        `;
    }

    _renderSwatchOption(attr, opt) {
        const available = this._isOptionAvailable(attr.id, opt.id);
        const isSelected = String(this._selected[String(attr.id)]) === String(opt.id);
        const meta = this._getSwatchMeta(attr.id, opt.id);
        const metaType = meta ? String(meta.type ?? '') : '';
        const metaValue = meta ? (meta.value ?? '') : '';

        // Visual color swatches need the chip AND screen-reader text --
        // the label stays in aria-label/title so accessibility tools
        // announce "Gray" rather than "#8f8f8f".
        let content;
        if (metaType === SWATCH_TYPE_VISUAL_COLOR && metaValue) {
            content = html`
                <span class="color-chip" style="background-color: ${metaValue}" aria-hidden="true"></span>
                <span class="sr-only">${opt.label || ''}</span>
            `;
        } else if (metaType === SWATCH_TYPE_VISUAL_IMAGE && metaValue) {
            // Image swatches: background-image on the chip. Magento ships
            // both .jpg and .svg relative paths; we render the URL as-is.
            const imageUrl = metaValue.startsWith('http') || metaValue.startsWith('/')
                ? metaValue
                : `/media/attribute/swatch${metaValue.startsWith('/') ? '' : '/'}${metaValue}`;
            content = html`
                <span class="color-chip" style="background-image: url('${imageUrl}')" aria-hidden="true"></span>
                <span class="sr-only">${opt.label || ''}</span>
            `;
        } else if (metaType === SWATCH_TYPE_TEXTUAL && metaValue) {
            content = html`<span>${metaValue}</span>`;
        } else {
            content = html`<span>${opt.label || ''}</span>`;
        }

        return html`
            <button
                type="button"
                part="swatch-item"
                role="radio"
                aria-checked="${isSelected}"
                aria-label="${opt.label || ''}"
                title="${opt.label || ''}"
                data-available="${available}"
                data-attribute-id="${attr.id}"
                data-option-id="${opt.id}"
                data-swatch-type="${metaType}"
                ?disabled=${!available}
                @click=${() => this._selectOption(attr.id, opt.id)}>
                ${content}
            </button>
        `;
    }
}

if (!customElements.get('hyperion-swatches')) {
    customElements.define('hyperion-swatches', HyperionSwatches);
}

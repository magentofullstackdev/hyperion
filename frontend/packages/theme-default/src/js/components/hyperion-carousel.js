// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css, nothing } from 'lit';
import { prefersReducedMotion, scrollBehavior } from '../lib/reduced-motion.js';

/**
 * Attribute converter for booleans that default to TRUE: the attribute may be
 * absent (keep the default) or carry an explicit "false".
 */
const explicitBoolean = {
    fromAttribute: (value) => value !== null && value !== 'false' && value !== '0',
    toAttribute: (value) => (value ? 'true' : 'false'),
};

/**
 * Multi-item scroll carousel.
 *
 * Own API: `autoplay`, `autoplay-interval`, `show-arrows`, `show-dots`,
 * `loop`, `prev-label`, `next-label`, `dot-label`.
 *
 * PageBuilder API: inside a "Products" content type with the carousel
 * appearance, the settings core's slick widget reads from the content type
 * element win: `data-autoplay`, `data-autoplay-speed`, `data-infinite-loop`,
 * `data-show-arrows`, `data-show-dots`, `data-carousel-mode` and
 * `data-center-padding` ("continuous" mode lets the neighbours peek in).
 */
export class HyperionCarousel extends LitElement {
    static properties = {
        autoplay: { type: Boolean, reflect: true },
        autoplayInterval: { type: Number, attribute: 'autoplay-interval', reflect: true },
        showArrows: { attribute: 'show-arrows', converter: explicitBoolean },
        showDots: { attribute: 'show-dots', converter: explicitBoolean },
        loop: { converter: explicitBoolean },
        prevLabel: { type: String, attribute: 'prev-label' },
        nextLabel: { type: String, attribute: 'next-label' },
        dotLabel: { type: String, attribute: 'dot-label' },
        _pageCount: { state: true },
        _currentPage: { state: true },
    };

    static styles = css`
        :host {
            /* Items per viewport size -- overridable per-instance with
               style="--items-base: 1; --items-md: 4;" if a usage
               needs a different ramp. The CSS-var approach keeps the
               component declarative without growing the JS API
               surface (no extra attributes, no Lit re-renders on
               viewport change). */
            --items-base: 2; /* < 640 px */
            --items-sm: 3; /* >= 640 px (Tailwind sm) */
            --items-lg: 4; /* >= 1024 px (Tailwind lg) */
            --items-xl: 5; /* >= 1280 px (Tailwind xl) -- max */

            --carousel-gap: 16px;
            --carousel-button-background: rgb(var(--color-surface-raised));
            --carousel-button-color: rgb(var(--color-primary));
            --carousel-dot-color: rgb(var(--color-subtle));
            --carousel-dot-active-color: rgb(var(--color-primary));
            --carousel-center-padding: 0px;

            /* Active items-per-view, set by media queries below. The
               width formula divides the available track width minus
               the inter-item gaps by the count. Resulting item width
               adjusts smoothly to the viewport. */
            --items-per-view: var(--items-base);

            display: block;
            position: relative;
        }

        @media (min-width: 640px) {
            :host { --items-per-view: var(--items-sm); }
        }
        @media (min-width: 1024px) {
            :host { --items-per-view: var(--items-lg); }
        }
        @media (min-width: 1280px) {
            :host { --items-per-view: var(--items-xl); }
        }

        /* position: relative makes the track the containing block of
           absolutely positioned descendants (sr-only labels in the cards);
           otherwise they are laid out against the host, escape the scroll
           clipping and widen the whole page. */
        [part="track"] {
            position: relative;
            display: flex;
            gap: var(--carousel-gap);
            overflow-x: auto;
            padding-inline: var(--carousel-center-padding);
            scroll-behavior: smooth;
            scroll-padding-inline: var(--carousel-center-padding);
            scroll-snap-type: x mandatory;
            scrollbar-width: none; /* Firefox */
        }

        [part="track"]::-webkit-scrollbar {
            display: none;
        }

        /* The document's _motion.css never reaches this shadow root: the
           track jumps instead of gliding when the visitor asked for reduced
           motion (the JS scroll calls read the same preference). */
        @media (prefers-reduced-motion: reduce) {
            [part="track"] {
                scroll-behavior: auto;
            }
        }

        ::slotted(*) {
            /* (track width - total gaps) / items-per-view. The
               (n - 1) gap count makes the math correct regardless
               of how many items the slot ends up with. */
            width: calc(
                (100% - var(--carousel-gap) * (var(--items-per-view) - 1))
                / var(--items-per-view)
            );
            flex-shrink: 0;
            scroll-snap-align: start;
        }

        [part="viewport"] {
            position: relative;
        }

        [part="prev-button"],
        [part="next-button"] {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: var(--carousel-button-background);
            color: var(--carousel-button-color);
            border: none;
            cursor: pointer;
            padding: 0.5rem 0.75rem;
            font-size: 1.5rem;
            line-height: 1;
            z-index: 10;
        }

        [part="prev-button"]:focus-visible,
        [part="next-button"]:focus-visible,
        [part="dot"]:focus-visible {
            outline: 2px solid var(--carousel-button-color);
            outline-offset: 2px;
        }

        [part="prev-button"] { left: 0; }
        [part="next-button"] { right: 0; }

        [part="dots"] {
            display: flex;
            gap: 10px;
            justify-content: center;
            padding: 15px 0;
        }

        [part="dots"][hidden] {
            display: none;
        }

        [part="dot"] {
            background: var(--carousel-dot-color);
            border: 0;
            border-radius: 9999px;
            cursor: pointer;
            height: 14px;
            padding: 0;
            width: 14px;
        }

        [part="dot"][aria-current="true"] {
            background: var(--carousel-dot-active-color);
        }
    `;

    constructor() {
        super();
        this.autoplay         = false;
        this.autoplayInterval = 4000;
        this.showArrows       = true;
        this.showDots         = false;
        this.loop             = true;
        // Defaults keep the arrows named when a template passes no label;
        // templates pass the translated strings.
        this.prevLabel        = 'Previous slide';
        this.nextLabel        = 'Next slide';
        this.dotLabel         = 'Go to page';
        this._pageCount       = 1;
        this._currentPage     = 0;
        this._autoplayTimer   = null;
        this._resizeObserver  = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._readPageBuilderSettings();
        if (this.autoplay) this._startAutoplay();
        // Autoplay pauses while the pointer or the keyboard focus is on the element.
        this.addEventListener('mouseenter', this._pauseAutoplay);
        this.addEventListener('focusin', this._pauseAutoplay);
        this.addEventListener('mouseleave', this._resumeAutoplay);
        this.addEventListener('focusout', this._resumeAutoplay);
        this.addEventListener('pointerenter', this._stopAutoplay);
        this.addEventListener('pointerleave',  this._restartAutoplay);
        this.addEventListener('focusin', this._stopAutoplay);
        this.addEventListener('focusout', this._restartAutoplay);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopAutoplay();
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this.removeEventListener('pointerenter', this._stopAutoplay);
        this.removeEventListener('pointerleave',  this._restartAutoplay);
        this.removeEventListener('focusin', this._stopAutoplay);
        this.removeEventListener('focusout', this._restartAutoplay);
    }

    firstUpdated() {
        if (typeof ResizeObserver === 'function' && this._track) {
            this._resizeObserver = new ResizeObserver(() => this._measure());
            this._resizeObserver.observe(this._track);
        }
        this._measure();
    }

    _readPageBuilderSettings() {
        const source = this.closest('[data-content-type="products"]') ?? this;
        const data = source.dataset;
        if ('autoplay' in data) this.autoplay = data.autoplay === 'true';
        if (Number(data.autoplaySpeed) > 0) this.autoplayInterval = Number(data.autoplaySpeed);
        if ('infiniteLoop' in data) this.loop = data.infiniteLoop === 'true';
        if ('showArrows' in data) this.showArrows = data.showArrows === 'true';
        if ('showDots' in data) this.showDots = data.showDots === 'true';
        if (data.carouselMode === 'continuous') {
            // Core's center mode always wraps around.
            this.loop = true;
            if (data.centerPadding) {
                this.style.setProperty('--carousel-center-padding', data.centerPadding);
            }
        }
    }

    _measure() {
        const track = this._track;
        if (!track || !track.clientWidth) return;
        this._pageCount = Math.max(1, Math.ceil((track.scrollWidth - 1) / track.clientWidth));
        this._onScroll();
    }

    _onScroll() {
        const track = this._track;
        if (!track || !track.clientWidth) return;
        const maxScroll = track.scrollWidth - track.clientWidth;
        this._currentPage = track.scrollLeft >= maxScroll - 1
            ? this._pageCount - 1
            : Math.round(track.scrollLeft / track.clientWidth);
    }

    _goToPage(page) {
        const track = this._track;
        if (!track) return;
        track.scrollTo({ left: page * track.clientWidth, behavior: scrollBehavior() });
    }

    get _track() {
        return this.shadowRoot?.querySelector('[part="track"]');
    }

    _startAutoplay() {
        // Autoplay never runs for visitors who asked for reduced motion.
        if (this._autoplayTimer || prefersReducedMotion()) return;
        this._autoplayTimer = setInterval(() => {
            const track = this._track;
            if (!track) return;
            const itemWidth = this._itemWidth();
            const maxScroll = track.scrollWidth - track.clientWidth;
            if (track.scrollLeft >= maxScroll - 1) {
                if (!this.loop) {
                    this._stopAutoplay();
                    return;
                }
                track.scrollLeft = 0;
            } else {
                track.scrollBy({ left: itemWidth, behavior: scrollBehavior() });
            }
        }, this.autoplayInterval);
    }

    _stopAutoplay() {
        if (this._autoplayTimer) {
            clearInterval(this._autoplayTimer);
            this._autoplayTimer = null;
        }
    }

    _pauseAutoplay = () => {
        this._stopAutoplay();
    };

    _resumeAutoplay = () => {
        if (this.autoplay && !this.matches(':hover') && !this.matches(':focus-within')) this._startAutoplay();
    };

    _restartAutoplay() {
        if (this.autoplay) this._startAutoplay();
    }

    /** Distance from one item to the next, gap included. */
    _itemWidth() {
        const track = this._track;
        const assigned = track?.querySelector('slot')?.assignedElements() ?? [];
        if (assigned.length > 1) {
            return assigned[1].getBoundingClientRect().left - assigned[0].getBoundingClientRect().left;
        }
        return assigned[0]?.getBoundingClientRect().width || track?.clientWidth || 200;
    }

    _prev() {
        const track = this._track;
        if (!track) return;
        if (track.scrollLeft <= 1) {
            if (this.loop) track.scrollTo({ left: track.scrollWidth, behavior: scrollBehavior() });
            return;
        }
        track.scrollBy({ left: -track.clientWidth, behavior: scrollBehavior() });
    }

    _next() {
        const track = this._track;
        if (!track) return;
        if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 1) {
            if (this.loop) track.scrollTo({ left: 0, behavior: scrollBehavior() });
            return;
        }
        track.scrollBy({ left: track.clientWidth, behavior: scrollBehavior() });
    }

    _renderArrows() {
        if (!this.showArrows) return nothing;
        return html`
            <button
                part="prev-button"
                type="button"
                aria-label="${this.prevLabel}"
                @click=${this._prev}
            >&#8249;</button>
            <button
                part="next-button"
                type="button"
                aria-label="${this.nextLabel}"
                @click=${this._next}
            >&#8250;</button>
        `;
    }

    _renderDots() {
        if (!this._dotsVisible) return nothing;
        return Array.from({ length: this._pageCount }, (_, page) => html`
            <button
                part="dot"
                type="button"
                aria-label="${this.dotLabel ? `${this.dotLabel} ${page + 1}` : page + 1}"
                aria-current="${page === this._currentPage ? 'true' : 'false'}"
                @click=${() => this._goToPage(page)}
            ></button>
        `);
    }

    get _dotsVisible() {
        return this.showDots && this._pageCount > 1;
    }

    render() {
        return html`
            <div part="viewport">
                <div part="track" @scroll=${this._onScroll}>
                    <slot @slotchange=${this._measure}></slot>
                </div>
                ${this._renderArrows()}
            </div>
            <div part="dots" ?hidden=${!this._dotsVisible}>${this._renderDots()}</div>
        `;
    }
}

if (!customElements.get('hyperion-carousel')) {
    customElements.define('hyperion-carousel', HyperionCarousel);
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css, nothing } from 'lit';

/**
 * Attribute converter for booleans that default to TRUE: the attribute may be
 * absent (keep the default) or carry an explicit "false".
 */
const explicitBoolean = {
    fromAttribute: (value) => value !== null && value !== 'false' && value !== '0',
    toAttribute: (value) => (value ? 'true' : 'false'),
};

/**
 * One-slide-per-view slider.
 *
 * Own API: `autoplay`, `autoplay-interval`, `show-arrows`, `show-dots`,
 * `loop`, `fade`, `prev-label`, `next-label`, `dot-label`.
 *
 * PageBuilder API: HyperionCms turns the stored slider into this element and
 * keeps the attributes core's slick widget reads, so whatever the merchant set
 * in the admin wins: `data-autoplay`, `data-autoplay-speed`, `data-fade`,
 * `data-infinite-loop`, `data-show-arrows`, `data-show-dots`.
 */
export class HyperionSlider extends LitElement {
    static properties = {
        autoplay: { type: Boolean, reflect: true },
        autoplayInterval: { type: Number, attribute: 'autoplay-interval', reflect: true },
        showArrows: { attribute: 'show-arrows', converter: explicitBoolean },
        showDots: { attribute: 'show-dots', converter: explicitBoolean },
        loop: { converter: explicitBoolean },
        fade: { type: Boolean, reflect: true },
        prevLabel: { type: String, attribute: 'prev-label' },
        nextLabel: { type: String, attribute: 'next-label' },
        dotLabel: { type: String, attribute: 'dot-label' },
        _currentIndex: { state: true },
        _slideCount: { state: true },
    };

    static styles = css`
        :host {
            --slide-gap: 0px;
            --slide-transition-duration: 300ms;
            --slider-button-background: rgb(var(--color-surface-raised));
            --slider-button-color: rgb(var(--color-primary));
            --slider-button-focus-ring: rgb(var(--color-primary));
            --slider-dot-color: rgb(var(--color-subtle));
            --slider-dot-active-color: rgb(var(--color-primary));
            display: block;
            position: relative;
        }

        /* min-height set on the host (PageBuilder writes it there) has to
           reach the slides: each level hands it down. */
        [part="viewport"] {
            min-height: inherit;
            overflow: hidden;
            position: relative;
        }

        [part="track"] {
            display: flex;
            gap: var(--slide-gap);
            min-height: inherit;
            transition: transform var(--slide-transition-duration);
            will-change: transform;
        }

        slot {
            min-height: inherit;
        }

        ::slotted(*) {
            box-sizing: border-box;
            flex-shrink: 0;
            min-width: 100%;
            width: 100%;
        }

        :host([fade]) [part="track"] {
            display: grid;
            transform: none !important;
        }

        :host([fade]) ::slotted(*) {
            grid-area: 1 / 1;
            opacity: 0;
            transition: opacity var(--slide-transition-duration), visibility var(--slide-transition-duration);
            visibility: hidden;
        }

        :host([fade]) ::slotted([data-hyperion-active]) {
            opacity: 1;
            visibility: visible;
        }

        @media (prefers-reduced-motion: reduce) {
            :host {
                --slide-transition-duration: 0ms;
            }
        }

        [part="prev-button"],
        [part="next-button"] {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: var(--slider-button-background);
            color: var(--slider-button-color);
            border: none;
            cursor: pointer;
            padding: 0.5rem 0.75rem;
            font-size: 1.5rem;
            line-height: 1;
            z-index: 10;
        }

        [part="prev-button"]:disabled,
        [part="next-button"]:disabled {
            cursor: default;
            opacity: 0.35;
        }

        [part="prev-button"]:focus-visible,
        [part="next-button"]:focus-visible,
        [part="dot"]:focus-visible {
            outline: 2px solid var(--slider-button-focus-ring);
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
            background: var(--slider-dot-color);
            border: 0;
            border-radius: 9999px;
            cursor: pointer;
            height: 14px;
            padding: 0;
            width: 14px;
        }

        [part="dot"][aria-current="true"] {
            background: var(--slider-dot-active-color);
        }
    `;

    constructor() {
        super();
        this.autoplay         = false;
        this.autoplayInterval = 5000;
        this.showArrows       = true;
        this.showDots         = false;
        this.loop             = true;
        this.fade             = false;
        this.prevLabel        = 'Previous slide';
        this.nextLabel        = 'Next slide';
        this.dotLabel         = 'Go to slide';
        this._currentIndex    = 0;
        this._slideCount      = 0;
        this._autoplayTimer   = null;
        this._pointerStartX   = null;
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
        this.removeEventListener('pointerenter', this._stopAutoplay);
        this.removeEventListener('pointerleave',  this._restartAutoplay);
        this.removeEventListener('focusin', this._stopAutoplay);
        this.removeEventListener('focusout', this._restartAutoplay);
    }

    firstUpdated() {
        // `slotchange` is not guaranteed for children parsed before the upgrade.
        this.onSlotChange();
    }

    _readPageBuilderSettings() {
        const data = this.dataset;
        if ('autoplay' in data) this.autoplay = data.autoplay === 'true';
        if (Number(data.autoplaySpeed) > 0) this.autoplayInterval = Number(data.autoplaySpeed);
        if ('fade' in data) this.fade = data.fade === 'true';
        if ('infiniteLoop' in data) this.loop = data.infiniteLoop === 'true';
        if ('showArrows' in data) this.showArrows = data.showArrows === 'true';
        if ('showDots' in data) this.showDots = data.showDots === 'true';
    }

    _startAutoplay() {
        // Autoplay never runs for visitors who asked for reduced motion.
        if (this._autoplayTimer || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
        this._autoplayTimer = setInterval(() => {
            if (!this.loop && this._currentIndex >= this._slideCount - 1) {
                this._stopAutoplay();
                return;
            }
            this.next();
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

    onSlotChange() {
        this._slideCount = this.children.length;
        if (this._currentIndex >= this._slideCount && this._slideCount > 0) {
            this._currentIndex = 0;
        }
        this._syncSlides();
    }

    /**
     * Off-screen slides stay in the DOM (crawlers, no-JS) but must not take
     * focus or be announced; the active one is flagged for the fade styles.
     */
    _syncSlides() {
        Array.from(this.children).forEach((slide, index) => {
            const active = index === this._currentIndex;
            slide.toggleAttribute('data-hyperion-active', active);
            slide.toggleAttribute('inert', !active);
        });
    }

    goTo(index) {
        if (!this._slideCount || index === this._currentIndex) return;
        if (index < 0 || index >= this._slideCount) {
            if (!this.loop) return;
            index = (index + this._slideCount) % this._slideCount;
        }
        this._currentIndex = index;
        this._syncSlides();
        this._emitChange();
    }

    prev() {
        this.goTo(this._currentIndex - 1);
    }

    next() {
        this.goTo(this._currentIndex + 1);
    }

    _emitChange() {
        this.dispatchEvent(new CustomEvent('hyperion-slide-change', {
            bubbles: true,
            composed: true,
            detail: { index: this._currentIndex },
        }));
    }

    _onPointerDown(e) {
        this._pointerStartX = e.clientX;
    }

    _onPointerUp(e) {
        if (this._pointerStartX === null) return;
        const delta = e.clientX - this._pointerStartX;
        this._pointerStartX = null;
        if (Math.abs(delta) < 50) return;
        delta < 0 ? this.next() : this.prev();
    }

    _onPointerMove(e) {
        // Track only -- prevents text selection during drag.
        if (this._pointerStartX !== null) e.preventDefault();
    }

    _renderArrows() {
        if (!this.showArrows || this._slideCount < 2) return nothing;
        const atStart = !this.loop && this._currentIndex === 0;
        const atEnd = !this.loop && this._currentIndex === this._slideCount - 1;
        return html`
            <button
                part="prev-button"
                type="button"
                aria-label="${this.prevLabel}"
                ?disabled=${atStart}
                @click=${this.prev}
            >&#8249;</button>
            <button
                part="next-button"
                type="button"
                aria-label="${this.nextLabel}"
                ?disabled=${atEnd}
                @click=${this.next}
            >&#8250;</button>
        `;
    }

    _renderDots() {
        if (!this._dotsVisible) return nothing;
        return Array.from({ length: this._slideCount }, (_, index) => html`
            <button
                part="dot"
                type="button"
                aria-label="${this.dotLabel ? `${this.dotLabel} ${index + 1}` : index + 1}"
                aria-current="${index === this._currentIndex ? 'true' : 'false'}"
                @click=${() => this.goTo(index)}
            ></button>
        `);
    }

    get _dotsVisible() {
        return this.showDots && this._slideCount > 1;
    }

    render() {
        const offset = this._currentIndex * 100;
        return html`
            <div part="viewport">
                <div
                    part="track"
                    style="transform: translateX(-${offset}%);"
                    @pointerdown=${this._onPointerDown}
                    @pointermove=${this._onPointerMove}
                    @pointerup=${this._onPointerUp}
                    @pointercancel=${() => { this._pointerStartX = null; }}
                >
                    <slot @slotchange=${this.onSlotChange}></slot>
                </div>
                ${this._renderArrows()}
            </div>
            <div part="dots" ?hidden=${!this._dotsVisible}>${this._renderDots()}</div>
        `;
    }
}

if (!customElements.get('hyperion-slider')) {
    customElements.define('hyperion-slider', HyperionSlider);
}

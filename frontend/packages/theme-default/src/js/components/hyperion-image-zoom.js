// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css } from 'lit';

export class HyperionImageZoom extends LitElement {
    static properties = {
        zoomScale: { type: Number, attribute: 'zoom-scale', reflect: true },
        _active: { state: true },
        _originX: { state: true },
        _originY: { state: true },
    };

    static styles = css`
        :host {
            --zoom-scale: 2.5;
            --zoom-overlay-background: rgb(var(--color-surface));
            display: inline-block;
            position: relative;
            overflow: hidden;
            cursor: zoom-in;
        }

        [part="image"] {
            display: block;
            width: 100%;
            height: 100%;
        }

        [part="zoom-overlay"] {
            position: absolute;
            inset: 0;
            background-repeat: no-repeat;
            pointer-events: none;
        }

        [part="zoom-overlay"][hidden] {
            display: none;
        }
    `;

    constructor() {
        super();
        this.zoomScale = 2.5;
        this._active   = false;
        this._originX  = 50;
        this._originY  = 50;
    }

    _getImg() {
        return this.querySelector('img');
    }

    activate(e) {
        const img = this._getImg();
        if (!img) return;
        const src = img.currentSrc || img.src;
        if (!src) return;
        this.style.setProperty('--_zoom-bg', `url(${src})`);
        this._active = true;
        this.updateOrigin(e);
    }

    updateOrigin(e) {
        if (!this._active) return;
        const rect = this.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width)  * 100;
        const y = ((e.clientY - rect.top)  / rect.height) * 100;
        this._originX = Math.max(0, Math.min(100, x));
        this._originY = Math.max(0, Math.min(100, y));
    }

    deactivate() {
        this._active = false;
    }

    render() {
        const scale = this.zoomScale ?? 2.5;
        return html`
            <div
                part="image"
                @pointerenter=${this.activate}
                @pointermove=${this.updateOrigin}
                @pointerleave=${this.deactivate}
            >
                <slot></slot>
            </div>
            <div
                part="zoom-overlay"
                ?hidden=${!this._active}
                style="
                    background-image: var(--_zoom-bg);
                    background-size: calc(${scale} * 100%);
                    background-position: ${this._originX}% ${this._originY}%;
                "
                aria-hidden="true"
            ></div>
        `;
    }
}

if (!customElements.get('hyperion-image-zoom')) {
    customElements.define('hyperion-image-zoom', HyperionImageZoom);
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-gallery -- PDP media gallery with hover-zoom, thumbnail
 * navigation, variant-aware image swapping, and lazy-loaded fullscreen
 * lightbox.
 *
 * -- Architecture -----------------------------------------------------
 * Shadow-DOM Lit component. The server emits:
 *
 *     <hyperion-gallery
 *         images="<json>"          (base product gallery)
 *         alt="Product name"
 *         zoom-scale="2.5"></hyperion-gallery>
 *
 * Labels the component prints itself (translated by the template, English
 * defaults here): `gallery-label` (thumbnail group), `expand-label`
 * (fullscreen button), `play-label` (video poster), `close-label` (lightbox),
 * `image-label` / `video-label` (thumbnail names, `%1` is the position).
 *
 * -- Touch swipe ------------------------------------------------------
 * A horizontal drag on the main stage (40px or more, more horizontal than
 * vertical) moves to the next / previous slide; vertical gestures stay the
 * page scroll (`touch-action: pan-y`). The click that may follow a swipe
 * does not open the lightbox.
 *
 * The `images` attribute is a JSON-encoded `GalleryImage[]`:
 *
 *     GalleryImage = {
 *       thumb:    string,   // low-res thumb url
 *       img:      string,   // medium (displayed) url
 *       full:     string,   // original full-size url
 *       caption?: string,
 *       isMain?:  boolean,
 *       position?: number
 *     }
 *
 * -- Thumbnail navigation --------------------------------------------
 * Clicking a thumbnail updates `_activeIndex` (state). The main <img>
 * `src` reflects that index reactively, so the swap is a single DOM
 * attribute change -- zero network request when the image has been
 * preloaded as a thumbnail source.
 *
 * -- Variant-aware swapping ------------------------------------------
 * Listens for `hyperion:gallery-update` on the document. The event
 * detail is:
 *
 *     detail: {
 *       productId?: number | null,
 *       images:     GalleryImage[]
 *     }
 *
 * When an empty `images` array is received, we fall back to the
 * original base-product gallery -- this mirrors Magento's native
 * configurable-product behavior where unselecting a swatch restores
 * the parent product's gallery.
 *
 * -- Lightbox (lazy) -------------------------------------------------
 * Clicking the main image triggers a dynamic `import('photoswipe/
 * lightbox')` + `import('photoswipe/style.css')`. Neither ship in the
 * initial bundle; the shopper only pays the ~30 KB cost when they opt
 * into fullscreen. Subsequent openings reuse the cached module -- the
 * promise is memoised.
 *
 * -- Hover zoom ------------------------------------------------------
 * The component absorbs the behavior of the legacy hyperion-image-
 * zoom: a pointer-scoped magnifying overlay that uses a background-
 * image + large scale transform to emulate a loupe. Only active when
 * the pointer coarseness is fine (desktop) -- touch devices get the
 * lightbox instead, which is a better fit for thumb navigation.
 */

import { LitElement, html, css } from 'lit';
import { videoEmbedUrl } from '../lib/video-embed.js';

const DEFAULT_ZOOM_SCALE = 2.5;
// A touch drag on the stage of at least this many px, more horizontal than
// vertical, moves to the next / previous slide.
const SWIPE_THRESHOLD = 40;

/**
 * Cached feature-detection probes for modern image formats. PhotoSwipe
 * loads slides via JavaScript and never sees the page's <picture>
 * markup, so we can't rely on the browser to pick the format -- we have
 * to feature-detect and choose ourselves.
 *
 * Each detector resolves once and the promise is reused for the rest
 * of the session. The 1x1 base64 payloads are the canonical "tiniest
 * valid image" datapoints.
 */
let _webpSupportPromise = null;
let _avifSupportPromise = null;

function detectFormatSupport(dataUrl) {
    return new Promise((resolve) => {
        const probe = new Image();
        probe.onload = () => resolve(probe.naturalWidth > 0);
        probe.onerror = () => resolve(false);
        probe.src = dataUrl;
    });
}

function supportsWebP() {
    if (!_webpSupportPromise) {
        _webpSupportPromise = detectFormatSupport(
            'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
        );
    }
    return _webpSupportPromise;
}

function supportsAVIF() {
    if (!_avifSupportPromise) {
        _avifSupportPromise = detectFormatSupport(
            // 1x1 AVIF (under 200 bytes), valid main image item.
            'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAAAEQAABAAEAAAAAARYAAQAAABgAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACBtZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI='
        );
    }
    return _avifSupportPromise;
}

/**
 * Pick the best supported source URL for a slide. Order of preference:
 * AVIF (smallest) -> WebP (universal) -> JPG (baseline). Each tier is
 * guarded by both the per-slide companion URL (server-side existence
 * check) and the per-session feature support flag.
 */
async function pickBestSlideSrc(image) {
    const fullJpg = image.full || image.img || '';
    if (image.fullAvif && (await supportsAVIF())) return image.fullAvif;
    if (image.fullWebp && (await supportsWebP())) return image.fullWebp;
    return fullJpg;
}

/**
 * Append a one-shot stylesheet with our PhotoSwipe theme overrides.
 * PhotoSwipe v5 attaches its own structures to <body>, so the override
 * has to live in document scope (not the gallery's Shadow DOM). Idempotent
 * via the `data-hyperion-pswp-theme` flag on <html> so reopening the
 * lightbox doesn't keep stacking <style> tags.
 *
 * Default PhotoSwipe ships a near-black overlay with white icons; we
 * invert that to a soft white scrim with dark icons so the storefront's
 * existing color palette stays cohesive when zoomed.
 */
function injectPhotoSwipeThemeOverrides() {
    const root = document.documentElement;
    if (root.hasAttribute('data-hyperion-pswp-theme')) return;
    root.setAttribute('data-hyperion-pswp-theme', 'true');

    const style = document.createElement('style');
    style.setAttribute('data-hyperion', 'pswp-theme');
    style.textContent = `
        .pswp {
            --pswp-bg: #ffffff;
            --pswp-icon-color: #1f2937;
            --pswp-icon-color-secondary: #ffffff;
            --pswp-icon-stroke-color: #ffffff;
            --pswp-icon-stroke-width: 2;
            --pswp-placeholder-bg: #f4f4f5;
            --pswp-error-text-color: #1f2937;
            --pswp-root-z-index: 100000;
        }
        .pswp__bg {
            background: #ffffff;
        }
        .pswp__counter,
        .pswp__error-msg {
            color: #1f2937;
            text-shadow: none;
        }
        .pswp__button {
            color: #1f2937;
        }
        .pswp__button:hover,
        .pswp__button:focus-visible {
            color: rgb(var(--color-primary, 37 99 235));
        }
    `;
    document.head.appendChild(style);
}

/**
 * Normalise a caller-supplied image descriptor to the canonical shape
 * used internally. Accepts the shape emitted by Hyperion\Catalog\
 * ViewModel\ProductView::getGalleryImages() (url + label + position)
 * AS WELL as the Magento configurable jsonConfig.images[productId][]
 * rows (thumb + img + full + caption + isMain). Returns `null` when
 * the input has no usable URL so bad data falls out of the gallery
 * rather than crashing the render loop.
 */
function normaliseImage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const full = raw.full || raw.url || raw.img || raw.thumb || '';
    const img = raw.img || raw.url || raw.full || raw.thumb || '';
    const thumb = raw.thumb || raw.img || raw.url || raw.full || '';
    if (!img) return null;
    return {
        thumb,
        img,
        full,
        // WebP / AVIF companion URLs. Empty string when the companion
        // isn't on disk yet -- render only the JPG <img> for that slot
        // since browsers don't fall through <picture> on a 404.
        thumbWebp: (raw.thumbWebp || '').toString(),
        imgWebp: (raw.imgWebp   || '').toString(),
        fullWebp: (raw.fullWebp  || '').toString(),
        thumbAvif: (raw.thumbAvif || '').toString(),
        imgAvif: (raw.imgAvif   || '').toString(),
        fullAvif: (raw.fullAvif  || '').toString(),
        caption: (raw.caption || raw.label || '').toString(),
        isMain: Boolean(raw.isMain),
        position: Number.isFinite(+raw.position) ? +raw.position : 0,
        // Magento_ProductVideo entries (`type` is 'video' in the Hyperion
        // payload and in core's configurable image rows); the image URLs
        // above are the preview frame.
        type: raw.videoUrl && String(raw.type || '').includes('video') ? 'video' : 'image',
        videoUrl: (raw.videoUrl || '').toString(),
        videoTitle: (raw.videoTitle || raw.caption || '').toString(),
    };
}

function parseImages(source) {
    if (!source) return [];
    if (Array.isArray(source)) {
        return source.map(normaliseImage).filter(Boolean);
    }
    if (typeof source === 'string') {
        const trimmed = source.trim();
        if (!trimmed) return [];
        try {
            const parsed = JSON.parse(trimmed);
            return parseImages(parsed);
        } catch (_e) {
            return [];
        }
    }
    return [];
}

export class HyperionGallery extends LitElement {
    static properties = {
        images: { type: String },
        alt: { type: String },
        zoomScale: { type: Number, attribute: 'zoom-scale', reflect: true },
        galleryLabel: { type: String, attribute: 'gallery-label' },
        expandLabel: { type: String, attribute: 'expand-label' },
        playLabel: { type: String, attribute: 'play-label' },
        closeLabel: { type: String, attribute: 'close-label' },
        imageLabel: { type: String, attribute: 'image-label' },
        videoLabel: { type: String, attribute: 'video-label' },
        _base: { state: true },
        _current: { state: true },
        _activeIndex: { state: true },
        _zoomActive: { state: true },
        _originX: { state: true },
        _originY: { state: true },
        _lightboxBusy: { state: true },
        _videoPlaying: { state: true },
    };

    static styles = css`
        :host {
            --hg-radius: 1rem;
            --hg-thumb-size: 5rem;
            --hg-zoom-scale: 2.5;
            --hg-border: rgb(var(--color-subtle));
            --hg-border-active: rgb(var(--color-primary));
            --hg-surface-raised: rgb(var(--color-surface-raised));
            display: block;
        }

        [part="main"] {
            position: relative;
            aspect-ratio: 1 / 1;
            background: var(--hg-surface-raised);
            border-radius: var(--hg-radius);
            overflow: hidden;
            cursor: zoom-in;
            /* Horizontal drags are the swipe, vertical ones the page scroll. */
            touch-action: pan-y;
        }

        [part="main-image"] {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            transition: transform 150ms ease-out;
            user-select: none;
        }

        [part="zoom-overlay"] {
            position: absolute;
            inset: 0;
            background-repeat: no-repeat;
            pointer-events: none;
            opacity: 0;
            transition: opacity 120ms ease-in-out;
        }

        [part="zoom-overlay"][data-active="true"] {
            opacity: 1;
        }

        /* Only show hover-zoom on fine-pointer devices. Touch users get
           the lightbox instead (cleaner finger-friendly interaction). */
        @media (any-pointer: coarse) {
            [part="zoom-overlay"] {
                display: none !important;
            }
            [part="main"] {
                cursor: default;
            }
        }

        [part="expand-button"] {
            position: absolute;
            bottom: 0.75rem;
            right: 0.75rem;
            width: 2.25rem;
            height: 2.25rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            background: rgb(var(--color-surface) / 0.9);
            color: rgb(var(--color-secondary));
            border: 1px solid var(--hg-border);
            border-radius: 9999px;
            cursor: pointer;
            box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
            transition: background-color 150ms, color 150ms, transform 150ms;
        }

        [part="expand-button"]:hover,
        [part="expand-button"]:focus-visible {
            background: rgb(var(--color-surface));
            color: rgb(var(--color-primary));
            outline: none;
            transform: scale(1.05);
        }

        [part="expand-button"] svg {
            width: 1rem;
            height: 1rem;
            stroke: currentColor;
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        [part="thumbs"] {
            display: flex;
            gap: 0.75rem;
            overflow-x: auto;
            padding: 0.5rem 0;
            scroll-behavior: smooth;
        }

        [part="video"] {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            overflow: hidden;
            border-radius: 0.75rem;
            background: #000;
        }
        [part="video-frame"] {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: 0;
        }
        [part="video"][data-poster] img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        [part="play-button"],
        [part="thumb-play"] {
            position: absolute;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
            background: rgb(0 0 0 / 0.6);
            color: #fff;
            border: 0;
        }
        [part="play-button"] {
            top: 50%;
            left: 50%;
            width: 4rem;
            height: 4rem;
            transform: translate(-50%, -50%);
            cursor: pointer;
        }
        [part="play-button"]:focus-visible {
            outline: 2px solid #fff;
            outline-offset: 2px;
        }
        [part="play-button"] svg,
        [part="thumb-play"] svg {
            width: 55%;
            height: 55%;
            fill: currentColor;
        }
        [part="thumb-play"] {
            top: 50%;
            left: 50%;
            width: 1.75rem;
            height: 1.75rem;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 1;
        }
        [part="thumb"] {
            flex: 0 0 var(--hg-thumb-size);
            width: var(--hg-thumb-size);
            height: var(--hg-thumb-size);
            padding: 0;
            background: var(--hg-surface-raised);
            border: 2px solid transparent;
            border-radius: 0.5rem;
            overflow: hidden;
            cursor: pointer;
            transition: border-color 150ms ease-in-out;
        }

        [part="thumb"]:hover,
        [part="thumb"]:focus-visible {
            border-color: rgba(var(--color-primary), 0.4);
            outline: none;
        }

        [part="thumb"][aria-current="true"] {
            border-color: var(--hg-border-active);
        }

        [part="thumb"] img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        /* The document's _motion.css never reaches this shadow root: under
           reduced motion the thumbnail strip jumps and the transitions of
           this sheet (image zoom, zoom overlay, expand button, thumb border)
           are cut to a near-zero duration (never none: transitionend
           must keep firing). This block is the LAST rule of the sheet on
           purpose: a later transition shorthand on the same part would
           win over the duration set here. */
        @media (prefers-reduced-motion: reduce) {
            [part="thumbs"] {
                scroll-behavior: auto;
            }
            [part="main-image"],
            [part="zoom-overlay"],
            [part="expand-button"],
            [part="thumb"] {
                transition-duration: 0.01ms;
            }
        }
    `;

    constructor() {
        super();
        this.images = '';
        this.alt = '';
        this.zoomScale = DEFAULT_ZOOM_SCALE;
        this.galleryLabel = 'Product image gallery';
        this.expandLabel = 'Open fullscreen';
        this.playLabel = 'Play video';
        this.closeLabel = 'Close';
        this.imageLabel = 'Image %1';
        this.videoLabel = 'Video %1';
        this._swipe = null;
        this._swiped = false;
        this._base = [];
        this._current = [];
        this._activeIndex = 0;
        this._zoomActive = false;
        this._originX = 50;
        this._originY = 50;
        this._lightboxBusy = false;
        this._lightboxPromise = null;
        this._onGalleryUpdate = this._onGalleryUpdate.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        // Bubble + composed lets events cross <hyperion-swatches>'s
        // Shadow DOM and land on the document without either component
        // knowing about the other's internals.
        document.addEventListener('hyperion:gallery-update', this._onGalleryUpdate);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('hyperion:gallery-update', this._onGalleryUpdate);
    }

    willUpdate(changed) {
        if (changed.has('images')) {
            const parsed = parseImages(this.images);
            this._base = parsed;
            this._current = parsed;
            this._activeIndex = parsed.length ? Math.min(this._activeIndex, parsed.length - 1) : 0;
        }
    }

    /**
     * Handler for the swatch-triggered gallery refresh. Payload contract
     * is documented in the module header.
     */
    _onGalleryUpdate(event) {
        const detail = event?.detail || {};
        const nextImages = parseImages(detail.images);
        this._videoPlaying = false;
        if (nextImages.length > 0) {
            this._current = nextImages;
            this._activeIndex = 0;
            return;
        }
        // Empty payload => variant deselected or unknown product;
        // restore the base product's gallery so the shopper never
        // sees an empty stage.
        this._current = this._base;
        this._activeIndex = 0;
    }

    /**
     * Forward click on a thumbnail to the active-index state. The main
     * <img> is driven by the reactive index, so the swap is a single
     * attribute update and keeps the zoom-overlay backdrop in sync.
     */
    _onThumbClick(index) {
        if (index < 0 || index >= this._current.length) return;
        this._activeIndex = index;
        // Reset zoom on navigation so the overlay doesn't render a
        // cached crop of the previous image.
        this._zoomActive = false;
        // A video slide picked by the shopper starts playing; the player
        // is unmounted as soon as another slide is active.
        this._videoPlaying = this._current[index]?.type === 'video';
    }

    /** Mount the player of the active video slide (the poster's play button). */
    _playVideo(event) {
        event?.stopPropagation();
        if (this._activeImage()?.type !== 'video') return;
        this._videoPlaying = true;
    }

    _renderVideoStage(active) {
        const embed = this._videoPlaying ? videoEmbedUrl(active.videoUrl, { autoplay: true }) : null;
        if (embed) {
            return html`
                <div part="video" data-provider="${embed.includes('vimeo') ? 'vimeo' : 'youtube'}">
                    <iframe part="video-frame"
                            src="${embed}"
                            title="${active.videoTitle || active.caption || this.alt || 'Product video'}"
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowfullscreen
                            loading="lazy"
                            referrerpolicy="strict-origin-when-cross-origin"></iframe>
                </div>`;
        }
        return html`
            <div part="video" data-poster>
                <img part="main-image" src="${active.img || ''}" alt="${active.caption || this.alt || ''}" loading="eager">
                <button type="button" part="play-button" aria-label="${this.playLabel}" @click=${this._playVideo}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>`;
    }

    _activeImage() {
        return this._current[this._activeIndex] || null;
    }

    /** "Image %1" with the position, or the label followed by the position. */
    _positionLabel(template, position) {
        const label = String(template || '');
        return label.includes('%1') ? label.replace('%1', String(position)) : `${label} ${position}`.trim();
    }

    // -- Touch swipe on the stage ------------------------------------

    _onSwipeStart(event) {
        if (event.pointerType === 'mouse') return;
        this._swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }

    _onSwipeCancel() {
        this._swipe = null;
    }

    _onSwipeEnd(event) {
        const start = this._swipe;
        this._swipe = null;
        if (!start || start.id !== event.pointerId || this._current.length < 2) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
        // The click that may follow the gesture must not open the lightbox.
        this._swiped = true;
        const count = this._current.length;
        this._onThumbClick((this._activeIndex + (dx < 0 ? 1 : count - 1)) % count);
    }

    // -- Hover zoom --------------------------------------------------

    _onPointerEnter(event) {
        if (event.pointerType === 'touch') return;
        this._zoomActive = true;
        this._updateOrigin(event);
    }

    _updateOrigin(event) {
        if (!this._zoomActive) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        this._originX = Math.max(0, Math.min(100, x));
        this._originY = Math.max(0, Math.min(100, y));
    }

    _onPointerLeave() {
        this._zoomActive = false;
    }

    // -- Lightbox (lazy) ---------------------------------------------

    async _openLightbox(event) {
        if (event) event.preventDefault();
        if (this._swiped) {
            this._swiped = false;
            return;
        }
        if (this._lightboxBusy) return;
        const images = this._current;
        if (!images.length) return;

        this._lightboxBusy = true;
        try {
            const { PhotoSwipeLightbox } = await this._loadPhotoSwipe();

            // Probe the real intrinsic dimensions of every slide before
            // opening. PhotoSwipe needs accurate width/height to fit
            // the image without the 1:1 letterbox stretch we used as a
            // placeholder before this fix (see img_19). We preload via
            // in-memory Image objects and kick off the lightbox as soon
            // as every probe has settled. A probe that fails falls back
            // to the natural size of the inline <img> (if available)
            // and finally to a 1:1 1600px frame so the viewer still
            // opens rather than aborting on one broken asset. */
            const fallbackImg = this.shadowRoot?.querySelector('[part="main-image"]');
            const fallbackRatio = fallbackImg?.naturalWidth && fallbackImg?.naturalHeight
                ? { w: fallbackImg.naturalWidth, h: fallbackImg.naturalHeight }
                : { w: 1600, h: 1600 };

            // Resolve the best-supported source URL per slide once,
            // ahead of probing -- that way the dimension probe and the
            // PhotoSwipe `dataSource[].src` agree on a single resource
            // (no double-fetch, no JPG vs WebP size mismatch).
            const slideSrcs = await Promise.all(images.map((img) => pickBestSlideSrc(img)));

            const probed = await Promise.all(
                slideSrcs.map((src) => this._probeImage(src, fallbackRatio))
            );

            const dataSource = images.map((img, index) => ({
                src: slideSrcs[index],
                alt: img.caption || this.alt || '',
                width: probed[index].w,
                height: probed[index].h,
            }));

            const lightbox = new PhotoSwipeLightbox({
                dataSource,
                pswpModule: () => import('photoswipe'),
                showHideAnimationType: 'fade',
                // White scrim painted by injectPhotoSwipeThemeOverrides;
                // 0.92 keeps the page faintly visible behind the lightbox
                // so the modal feels lighter than the default solid black.
                bgOpacity: 0.92,
                closeTitle: this.closeLabel,
                zoomTitle: 'Zoom',
                arrowPrevTitle: 'Previous image',
                arrowNextTitle: 'Next image',
            });

            lightbox.on('uiRegister', () => {
                lightbox.pswp?.ui?.registerElement?.({
                    name: 'download-button',
                    ariaLabel: 'Download image',
                    order: 8,
                    isButton: false,
                    tagName: 'div',
                });
            });

            lightbox.on('close', () => {
                lightbox.destroy();
            });

            lightbox.init();
            lightbox.loadAndOpen(this._activeIndex);
        } catch (err) {
            // Fail gracefully -- the shopper still has the inline image.
            // eslint-disable-next-line no-console
            console.error('hyperion-gallery: lightbox failed to load', err);
        } finally {
            this._lightboxBusy = false;
        }
    }

    /**
     * Load an image in-memory and report its intrinsic dimensions.
     * Falls back to the provided frame on network failure so a single
     * broken asset can't block the rest of the gallery from opening.
     * Results are memoised on the component instance so reopening the
     * lightbox doesn't re-probe the same URLs.
     */
    _probeImage(src, fallback) {
        if (!src) return Promise.resolve(fallback);
        if (!this._probeCache) this._probeCache = new Map();
        if (this._probeCache.has(src)) return this._probeCache.get(src);

        const promise = new Promise((resolve) => {
            const probe = new Image();
            probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
            probe.onerror = () => resolve(fallback);
            probe.src = src;
        });
        this._probeCache.set(src, promise);
        return promise;
    }

    /**
     * Memoise the dynamic import so reopening the lightbox does not
     * refetch the chunk. `photoswipe/lightbox` and the stylesheet are
     * separate chunks emitted by Vite -- the CSS import attaches a
     * <link rel="stylesheet"> when the chunk first evaluates. After
     * the stylesheet lands we inject our brand-overrides once so the
     * default black overlay becomes a soft white scrim that matches
     * the rest of the storefront.
     */
    _loadPhotoSwipe() {
        if (!this._lightboxPromise) {
            this._lightboxPromise = Promise.all([
                import('photoswipe/lightbox'),
                import('photoswipe/style.css'),
            ]).then(([mod]) => {
                injectPhotoSwipeThemeOverrides();
                return { PhotoSwipeLightbox: mod.default };
            });
        }
        return this._lightboxPromise;
    }

    // -- Render ------------------------------------------------------

    _renderMainStage(active, scale, zoomBg) {
        return html`
            <div part="main"
                 @pointerenter=${this._onPointerEnter}
                 @pointermove=${this._updateOrigin}
                 @pointerleave=${this._onPointerLeave}
                 @pointerdown=${this._onSwipeStart}
                 @pointerup=${this._onSwipeEnd}
                 @pointercancel=${this._onSwipeCancel}
                 @click=${this._openLightbox}>
                <picture>
                    ${active?.imgAvif
                        ? html`<source type="image/avif" srcset="${active.imgAvif}">`
                        : ''}
                    ${active?.imgWebp
                        ? html`<source type="image/webp" srcset="${active.imgWebp}">`
                        : ''}
                    <img part="main-image"
                         src="${active?.img || ''}"
                         alt="${active?.caption || this.alt || ''}"
                         loading="eager"
                         fetchpriority="high"
                         itemprop="image">
                </picture>
                <div part="zoom-overlay"
                     data-active="${String(this._zoomActive)}"
                     style="background-image:${zoomBg};
                            background-size: calc(${scale} * 100%);
                            background-position: ${this._originX}% ${this._originY}%;"
                     aria-hidden="true"></div>
                <button type="button"
                        part="expand-button"
                        aria-label="${this.expandLabel}"
                        @click=${this._openLightbox}
                        @pointerenter=${(e) => e.stopPropagation()}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
            </div>
        `;
    }

    render() {
        if (!this._current.length) {
            return html`<slot></slot>`;
        }

        const active = this._activeImage();
        const scale = this.zoomScale || DEFAULT_ZOOM_SCALE;
        const zoomBg = active ? `url(${active.full || active.img})` : 'none';
        const isVideo = active?.type === 'video';

        return html`
            ${isVideo ? this._renderVideoStage(active) : this._renderMainStage(active, scale, zoomBg)}
            ${this._current.length > 1
                ? html`
                    <div part="thumbs"
                         role="group"
                         aria-label="${this.galleryLabel}">
                        ${this._current.map((img, idx) => html`
                            <button type="button"
                                    part="thumb"
                                    data-type="${img.type}"
                                    aria-current="${idx === this._activeIndex ? 'true' : 'false'}"
                                    aria-label="${img.type === 'video' ? (img.videoTitle || this._positionLabel(this.videoLabel, idx + 1)) : (img.caption || this._positionLabel(this.imageLabel, idx + 1))}"
                                    @click=${() => this._onThumbClick(idx)}>
                                ${img.type === 'video' ? html`<span part="thumb-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>` : ''}
                                <picture>
                                    ${img.thumbAvif
                                        ? html`<source type="image/avif" srcset="${img.thumbAvif}">`
                                        : ''}
                                    ${img.thumbWebp
                                        ? html`<source type="image/webp" srcset="${img.thumbWebp}">`
                                        : ''}
                                    <img src="${img.thumb || img.img}"
                                         alt=""
                                         loading="lazy"
                                         decoding="async">
                                </picture>
                            </button>
                        `)}
                    </div>
                `
                : ''}
        `;
    }
}

if (!customElements.get('hyperion-gallery')) {
    customElements.define('hyperion-gallery', HyperionGallery);
}

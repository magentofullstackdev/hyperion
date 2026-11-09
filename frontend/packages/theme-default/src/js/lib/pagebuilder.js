// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { videoEmbedUrl } from './video-embed.js';

// PageBuilder storefront behavior.
//
// Core drives a handful of content types with RequireJS widgets
// (module-page-builder/view/base/web/js). Layout and every admin setting that
// is a style come from CSS (generated `data-pb-style` rules plus
// css/source/_pagebuilder.css); this module covers what is left, reading the
// very same data attributes the core widgets read:
//
//   tabs                  content-type/tabs/appearance/default/widget.js
//   show-on-hover         widget/show-on-hover.js (banner, slide)
//   equal-width buttons   content-type/buttons/appearance/inline/widget.js
//   video backgrounds     widget/video-background.js (row, banner, slide)
//   maps                  content-type/map/appearance/default/widget.js
//
// Slider and products carousel are Lit components (hyperion-slider,
// hyperion-carousel). The module is loaded by entry.js only when the page
// holds PageBuilder content, and initPageBuilder() is idempotent so it can
// run again after an HTMX swap.

const READY = 'data-hyperion-ready';

// --- Tabs ------------------------------------------------------------------

// Direct children only: tabs can be nested inside a tab item.
function tabHeaders(tabs) {
    const navigation = [...tabs.children].find((child) => child.dataset.element === 'navigation');
    return navigation ? [...navigation.children].filter((child) => child.classList.contains('tab-header')) : [];
}

function tabPanel(tabs, header) {
    const id = header.querySelector('a')?.getAttribute('href')?.split('#')[1];
    if (!id) return null;
    return [...tabs.querySelectorAll('[data-content-type="tab-item"]')].find((panel) => panel.id === id) ?? null;
}

function activateTab(tabs, index, { focus = false } = {}) {
    const headers = tabHeaders(tabs);
    headers.forEach((header, i) => {
        const active = i === index;
        const panel = tabPanel(tabs, header);
        header.setAttribute('aria-selected', String(active));
        header.setAttribute('tabindex', active ? '0' : '-1');
        panel?.toggleAttribute('hidden', !active);
        if (active && focus) header.focus();
    });
    equalizeButtons(tabs);
}

function initTabs(tabs) {
    const headers = tabHeaders(tabs);
    if (!headers.length) return;

    headers.forEach((header, index) => {
        const link = header.querySelector('a');
        const panel = tabPanel(tabs, header);
        header.setAttribute('role', 'tab');
        link?.setAttribute('role', 'presentation');
        link?.setAttribute('tabindex', '-1');
        if (panel) {
            header.id ||= `${panel.id}-tab`;
            header.setAttribute('aria-controls', panel.id);
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', header.id);
        }
        header.addEventListener('click', (event) => {
            event.preventDefault();
            activateTab(tabs, index);
        });
        header.addEventListener('keydown', (event) => {
            const last = headers.length - 1;
            const target = {
                ArrowRight: index === last ? 0 : index + 1,
                ArrowLeft: index === 0 ? last : index - 1,
                Home: 0,
                End: last,
            }[event.key];
            if (target === undefined) return;
            event.preventDefault();
            activateTab(tabs, target, { focus: true });
        });
    });

    const configured = parseInt(tabs.dataset.activeTab ?? '', 10);
    const hashTarget = window.location.hash.length > 1
        ? document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
        : null;
    const fromHash = hashTarget
        ? headers.findIndex((header) => tabPanel(tabs, header)?.contains(hashTarget))
        : -1;
    const initial = fromHash !== -1 ? fromHash : (configured >= 0 && configured < headers.length ? configured : 0);

    activateTab(tabs, initial);
}

// --- Show overlay on hover ---------------------------------------------------

// The hover rule lives in CSS; it needs the color as a custom property
// because CSS cannot read `data-overlay-color` as a color.
function initOverlay(overlay) {
    const color = overlay.dataset.overlayColor;
    if (color) overlay.style.setProperty('--pb-overlay', color);
}

// --- Buttons: "same width" ---------------------------------------------------

function equalizeButtons(root = document) {
    root.querySelectorAll('[data-content-type="buttons"][data-same-width="true"]').forEach((group) => {
        const buttons = [...group.querySelectorAll('[data-element="link"], [data-element="empty_link"]')];
        buttons.forEach((button) => { button.style.minWidth = '0'; });
        const widest = Math.max(0, ...buttons.map((button) => button.getBoundingClientRect().width));
        // Zero means the group is not rendered yet (closed tab, off-screen slide).
        buttons.forEach((button) => { button.style.minWidth = widest ? `${Math.ceil(widest)}px` : ''; });
    });
}

// --- Video backgrounds ------------------------------------------------------

function mountVideo(element) {
    const src = element.dataset.videoSrc;
    const loop = element.dataset.videoLoop !== 'false';
    const embed = videoEmbedUrl(src, { background: true, loop });
    let media;

    if (embed) {
        media = document.createElement('iframe');
        media.src = embed;
        media.allow = 'autoplay; encrypted-media; picture-in-picture';
        media.setAttribute('tabindex', '-1');
        media.setAttribute('aria-hidden', 'true');
        media.title = '';
    } else {
        media = document.createElement('video');
        media.src = src;
        media.muted = true;
        media.loop = loop;
        media.autoplay = true;
        media.playsInline = true;
        media.setAttribute('aria-hidden', 'true');
    }
    media.className = 'hyperion-pb-video';
    element.prepend(media);
    return media;
}

function initVideoBackground(element) {
    const fallback = element.dataset.videoFallbackSrc;
    if (fallback) {
        element.style.backgroundImage = `url("${fallback.replace(/"/g, '%22')}")`;
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = 'center';
    }
    if (!element.dataset.videoSrc || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const playOnlyVisible = element.dataset.videoPlayOnlyVisible !== 'false';
    let media = null;

    // Always lazy: a third-party player is never requested for a video the
    // visitor has not scrolled to, whatever `data-video-lazy-load` says.
    const observer = new IntersectionObserver((entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible && !media) {
            media = mountVideo(element);
            if (!playOnlyVisible) observer.disconnect();
            return;
        }
        if (media instanceof HTMLVideoElement) {
            visible ? media.play().catch(() => {}) : media.pause();
        }
    }, { rootMargin: '200px' });
    observer.observe(element);
}

// --- Maps --------------------------------------------------------------------

let googleMapsPromise = null;

function loadGoogleMaps(key) {
    googleMapsPromise ??= new Promise((resolve, reject) => {
        if (window.google?.maps?.Map) {
            resolve(window.google.maps);
            return;
        }
        window.hyperionPbMapsReady = () => resolve(window.google.maps);
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?v=3.56&key=${encodeURIComponent(key)}&callback=hyperionPbMapsReady`;
        script.async = true;
        script.onerror = reject;
        document.head.append(script);
    });
    return googleMapsPromise;
}

function infoWindowContent(location) {
    const box = document.createElement('div');
    const title = document.createElement('h3');
    title.style.fontWeight = '700';
    title.textContent = location.location_name ?? '';
    box.append(title);
    const line = (text) => {
        if (!text) return;
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-line';
        p.textContent = text;
        box.append(p);
    };
    line(location.comment);
    line(location.phone ? `Phone: ${location.phone}` : '');
    const cityLine = [location.city, [location.state, location.zipcode].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ');
    line([location.address, cityLine, location.country].filter(Boolean).join('\n'));
    return box;
}

function drawGoogleMap(element, locations, maps) {
    let styles;
    try {
        styles = JSON.parse(element.dataset.hyperionMapsStyle || '[]');
    } catch {
        styles = [];
    }
    const controls = element.dataset.showControls === 'true';
    const map = new maps.Map(element, {
        zoom: 8,
        center: { lat: 30.2672, lng: -97.7431 },
        scrollwheel: false,
        disableDefaultUI: !controls,
        mapTypeControl: controls,
        styles,
    });
    const bounds = new maps.LatLngBounds();
    let openWindow = null;

    locations.forEach((location) => {
        const position = { lat: location.position.latitude, lng: location.position.longitude };
        const marker = new maps.Marker({ map, position, title: location.location_name ?? '' });
        bounds.extend(position);
        if (!location.location_name) return;
        const infoWindow = new maps.InfoWindow({ content: infoWindowContent(location), maxWidth: 350 });
        marker.addListener('click', () => {
            openWindow?.close();
            infoWindow.open(map, marker);
            openWindow = infoWindow;
        });
    });

    if (locations.length > 1) {
        map.fitBounds(bounds);
    } else {
        map.setCenter(bounds.getCenter());
        map.setZoom(8);
    }
}

// No API key configured: a keyless embed of the first location is more
// useful to the visitor than core's "this page can't load Google Maps".
function drawEmbeddedMap(element, locations) {
    const { latitude, longitude } = locations[0].position;
    const frame = document.createElement('iframe');
    frame.src = `https://www.google.com/maps?q=${latitude},${longitude}&z=12&output=embed`;
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.title = locations[0].location_name ?? 'Map';
    element.replaceChildren(frame);
}

function initMap(element) {
    let locations = [];
    try {
        locations = JSON.parse(element.dataset.locations || '[]');
    } catch {
        locations = [];
    }
    locations = locations
        .map((location) => ({
            ...location,
            position: {
                latitude: parseFloat(location.position?.latitude),
                longitude: parseFloat(location.position?.longitude),
            },
        }))
        .filter((location) => Number.isFinite(location.position.latitude)
            && Number.isFinite(location.position.longitude));

    if (!locations.length) {
        element.style.display = 'none';
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const key = element.dataset.hyperionMapsKey;
        if (!key) {
            drawEmbeddedMap(element, locations);
            return;
        }
        loadGoogleMaps(key)
            .then((maps) => drawGoogleMap(element, locations, maps))
            .catch(() => drawEmbeddedMap(element, locations));
    }, { rootMargin: '300px' });
    observer.observe(element);
}

// --- Entry point -------------------------------------------------------------

const INITIALIZERS = [
    ['[data-content-type="tabs"]', initTabs],
    ['.pagebuilder-overlay[data-overlay-color]', initOverlay],
    ['[data-background-type="video"]', initVideoBackground],
    ['[data-content-type="map"]', initMap],
];

export function initPageBuilder(root = document) {
    INITIALIZERS.forEach(([selector, init]) => {
        root.querySelectorAll(selector).forEach((element) => {
            if (element.hasAttribute(READY)) return;
            element.setAttribute(READY, '');
            init(element);
        });
    });
    equalizeButtons(root);
}

let fontsHooked = false;

export function bootPageBuilder(root = document) {
    initPageBuilder(root);
    if (fontsHooked) return;
    fontsHooked = true;
    // Button widths change once the web font replaces the fallback.
    document.fonts?.ready.then(() => equalizeButtons());
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @vitest-environment jsdom
//
// jsdom, not happy-dom: nested Lit templates inside a shadow root render
// empty under happy-dom 14, and the stage and the thumbs are nested.
import { describe, test, expect, beforeEach } from 'vitest';
import { HyperionGallery } from '../hyperion-gallery.js';
import { mount } from './helpers.js';

const images = [
    { thumb: '/t1.jpg', img: '/i1.jpg', full: '/f1.jpg', caption: 'Front', isMain: true, position: 1 },
    { thumb: '/t2.jpg', img: '/i2.jpg', full: '/f2.jpg', caption: 'Video poster', position: 2, type: 'video', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', videoTitle: 'How it works' },
    { thumb: '/t3.jpg', img: '/i3.jpg', full: '/f3.jpg', caption: 'Back', position: 3 },
];

function gallery() {
    const el = document.createElement('hyperion-gallery');
    el.setAttribute('alt', 'Joust Duffle Bag');
    el.setAttribute('images', JSON.stringify(images));
    return el;
}
const sr = (el) => el.shadowRoot;

describe('<hyperion-gallery> video slides', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('video thumbnails carry a play overlay and a video name', async () => {
        const el = await mount(gallery());
        const thumbs = sr(el).querySelectorAll('[part="thumb"]');
        expect(thumbs).toHaveLength(3);
        expect(thumbs[1].getAttribute('data-type')).toBe('video');
        expect(thumbs[1].querySelector('[part="thumb-play"]')).not.toBeNull();
        expect(thumbs[1].getAttribute('aria-label')).toBe('How it works');
        expect(thumbs[0].querySelector('[part="thumb-play"]')).toBeNull();
        expect(sr(el).querySelector('[part="video"]')).toBeNull();
    });

    test('selecting the video slide mounts a nocookie iframe; another slide unmounts it', async () => {
        const el = await mount(gallery());
        sr(el).querySelectorAll('[part="thumb"]')[1].click();
        await el.updateComplete;
        const frame = sr(el).querySelector('[part="video-frame"]');
        expect(frame).not.toBeNull();
        expect(frame.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
        expect(frame.getAttribute('src')).toContain('autoplay=1');
        expect(frame.getAttribute('title')).toBe('How it works');
        expect(sr(el).querySelector('[part="main"]')).toBeNull();
        sr(el).querySelectorAll('[part="thumb"]')[2].click();
        await el.updateComplete;
        expect(sr(el).querySelector('[part="video-frame"]')).toBeNull();
        expect(sr(el).querySelector('[part="main"]')).not.toBeNull();
        expect(sr(el).querySelector('[part="main-image"]').getAttribute('src')).toBe('/i3.jpg');
    });

    test('a video that is the first slide shows its poster until the play button is pressed', async () => {
        const el = document.createElement('hyperion-gallery');
        el.setAttribute('images', JSON.stringify([images[1], images[0]]));
        await mount(el);
        expect(sr(el).querySelector('[part="video"][data-poster]')).not.toBeNull();
        expect(sr(el).querySelector('[part="video-frame"]')).toBeNull();
        sr(el).querySelector('[part="play-button"]').click();
        await el.updateComplete;
        expect(sr(el).querySelector('[part="video-frame"]')).not.toBeNull();
    });
});

describe('<hyperion-gallery> labels', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('the shadow labels come from the attributes, with the position filled in', async () => {
        const el = gallery();
        el.setAttribute('gallery-label', 'Galleria immagini del prodotto');
        el.setAttribute('expand-label', 'Apri a schermo intero');
        el.setAttribute('play-label', 'Riproduci il video');
        el.setAttribute('image-label', 'Immagine %1');
        el.setAttribute('video-label', 'Video %1');
        el.setAttribute('images', JSON.stringify([
            { ...images[0], caption: '' },
            { ...images[1], caption: '', videoTitle: '' },
            images[2],
        ]));
        await mount(el);

        expect(sr(el).querySelector('[part="thumbs"]').getAttribute('aria-label')).toBe('Galleria immagini del prodotto');
        expect(sr(el).querySelector('[part="expand-button"]').getAttribute('aria-label')).toBe('Apri a schermo intero');
        const thumbs = sr(el).querySelectorAll('[part="thumb"]');
        expect(thumbs[0].getAttribute('aria-label')).toBe('Immagine 1');
        expect(thumbs[1].getAttribute('aria-label')).toBe('Video 2');
        expect(thumbs[2].getAttribute('aria-label')).toBe('Back');
        // The poster of a video that is the first slide shows the play label.
        const poster = document.createElement('hyperion-gallery');
        poster.setAttribute('play-label', 'Riproduci il video');
        poster.setAttribute('images', JSON.stringify([images[1], images[0]]));
        await mount(poster);
        expect(sr(poster).querySelector('[part="play-button"]').getAttribute('aria-label')).toBe('Riproduci il video');
    });

    test('without attributes the English defaults stay', async () => {
        const el = await mount(gallery());
        expect(sr(el).querySelector('[part="thumbs"]').getAttribute('aria-label')).toBe('Product image gallery');
        expect(sr(el).querySelector('[part="expand-button"]').getAttribute('aria-label')).toBe('Open fullscreen');
    });
});

describe('<hyperion-gallery> touch swipe on the stage', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    const pointer = (type, x, y, extra = {}) => {
        const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
        Object.assign(event, extra);
        return event;
    };
    const swipe = (el, fromX, toX, fromY = 100, toY = 100) => {
        const stage = sr(el).querySelector('[part="main"]');
        stage.dispatchEvent(pointer('pointerdown', fromX, fromY, { pointerType: 'touch', pointerId: 7 }));
        stage.dispatchEvent(pointer('pointerup', toX, toY, { pointerType: 'touch', pointerId: 7 }));
    };
    const src = (el) => sr(el).querySelector('[part="main-image"]').getAttribute('src');

    test('a leftward drag shows the next slide, a rightward one the previous, wrapping around', async () => {
        const el = gallery();
        el.setAttribute('images', JSON.stringify([images[0], images[2]]));
        await mount(el);
        expect(src(el)).toBe('/i1.jpg');
        swipe(el, 300, 100);
        await el.updateComplete;
        expect(src(el)).toBe('/i3.jpg');
        swipe(el, 300, 100);
        await el.updateComplete;
        expect(src(el)).toBe('/i1.jpg');
        swipe(el, 100, 300);
        await el.updateComplete;
        expect(src(el)).toBe('/i3.jpg');
    });

    test('a swipe onto a video slide starts it like a thumbnail click does', async () => {
        const el = await mount(gallery());
        swipe(el, 300, 100);
        await el.updateComplete;
        expect(sr(el).querySelector('[part="video-frame"]')).not.toBeNull();
    });

    test('a short drag, a vertical one and a mouse drag change nothing', async () => {
        const el = await mount(gallery());
        swipe(el, 300, 280);
        await el.updateComplete;
        expect(src(el)).toBe('/i1.jpg');
        swipe(el, 300, 200, 100, 400);
        await el.updateComplete;
        expect(src(el)).toBe('/i1.jpg');
        const stage = sr(el).querySelector('[part="main"]');
        stage.dispatchEvent(pointer('pointerdown', 300, 100, { pointerType: 'mouse', pointerId: 1 }));
        stage.dispatchEvent(pointer('pointerup', 100, 100, { pointerType: 'mouse', pointerId: 1 }));
        await el.updateComplete;
        expect(src(el)).toBe('/i1.jpg');
    });

    test('the click that follows a swipe does not open the lightbox', async () => {
        const el = await mount(gallery());
        el.setAttribute('images', JSON.stringify([images[0], images[2]]));
        await el.updateComplete;
        swipe(el, 300, 100);
        await el.updateComplete;
        expect(src(el)).toBe('/i3.jpg');
        sr(el).querySelector('[part="main"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(el._lightboxBusy).toBe(false);
        expect(el._lightboxPromise).toBeNull();
    });
});

describe('<hyperion-gallery> reduced motion', () => {
    // The document's `_motion.css` never reaches the shadow root: the sheet
    // carries its own media rule for the thumbnail strip and the transitions
    // it declares.
    test('the shadow stylesheet turns smooth scrolling and its transitions off under reduce', () => {
        const cssText = [].concat(HyperionGallery.styles).map((style) => style.cssText).join('\n');
        expect(cssText).toMatch(/\[part="thumbs"\]\s*\{[^}]*scroll-behavior:\s*smooth/);
        const reduce = cssText.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\s{8}\}/);
        expect(reduce).not.toBeNull();
        expect(reduce[1]).toMatch(/\[part="thumbs"\]\s*\{[^}]*scroll-behavior:\s*auto/);
        // Every part that declares a transition in the sheet is covered.
        const transitioned = [...cssText.matchAll(/\[part="([^"]+)"\]\s*\{[^}]*\btransition:/g)].map((m) => m[1]);
        expect(transitioned.length).toBeGreaterThan(0);
        transitioned.forEach((part) => expect(reduce[1]).toContain(`[part="${part}"]`));
        expect(reduce[1]).toMatch(/transition-duration:\s*0\.01ms/);
        expect(cssText).not.toMatch(/transform:\s*none/);
    });
});

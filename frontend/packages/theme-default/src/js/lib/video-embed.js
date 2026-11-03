// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// YouTube / Vimeo URL parsing and privacy-friendly embed URLs, shared by the
// PageBuilder video backgrounds (lib/pagebuilder.js) and the product gallery
// (<hyperion-gallery>, Magento_ProductVideo entries). YouTube goes through
// youtube-nocookie.com, Vimeo through player.vimeo.com; both hosts are in
// the CSP whitelist of HyperionCms.

const YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/;

/** `{ provider: 'youtube' | 'vimeo', id }` or null for anything else. */
export function parseVideoUrl(url) {
    const src = String(url || '');
    const youtube = src.match(YOUTUBE);
    if (youtube) return { provider: 'youtube', id: youtube[1] };
    const vimeo = src.match(VIMEO);
    if (vimeo) return { provider: 'vimeo', id: vimeo[1] };
    return null;
}

/**
 * Embed URL for a player.
 * @param {string} url
 * @param {{ autoplay?: boolean, loop?: boolean, background?: boolean }} options
 *   `background` is the muted, chromeless mode of the PageBuilder backgrounds.
 */
export function videoEmbedUrl(url, options = {}) {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;
    const { autoplay = false, loop = false, background = false } = options;
    if (parsed.provider === 'youtube') {
        const params = new URLSearchParams({ rel: '0', playsinline: '1', modestbranding: '1' });
        if (autoplay || background) params.set('autoplay', '1');
        if (background) {
            params.set('mute', '1');
            params.set('controls', '0');
            params.set('disablekb', '1');
        }
        if (loop) {
            params.set('loop', '1');
            params.set('playlist', parsed.id);
        }
        return `https://www.youtube-nocookie.com/embed/${parsed.id}?${params}`;
    }
    const params = new URLSearchParams({ dnt: '1' });
    if (autoplay || background) params.set('autoplay', '1');
    if (background) {
        params.set('background', '1');
        params.set('muted', '1');
    }
    params.set('loop', loop ? '1' : '0');
    return `https://player.vimeo.com/video/${parsed.id}?${params}`;
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect } from 'vitest';
import { parseVideoUrl, videoEmbedUrl } from '../video-embed.js';

describe('video-embed', () => {
    test('parses YouTube and Vimeo URLs in their usual forms', () => {
        expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
        expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
        expect(parseVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
        expect(parseVideoUrl('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', id: '76979871' });
        expect(parseVideoUrl('https://example.com/video.mp4')).toBeNull();
    });

    test('builds privacy-enhanced embed URLs', () => {
        const yt = videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { autoplay: true });
        expect(yt.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?')).toBe(true);
        expect(yt).toContain('autoplay=1');
        expect(yt).not.toContain('mute=1');
        const bg = videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ', { background: true, loop: true });
        expect(bg).toContain('mute=1');
        expect(bg).toContain('controls=0');
        expect(bg).toContain('playlist=dQw4w9WgXcQ');
        const vimeo = videoEmbedUrl('https://vimeo.com/76979871');
        expect(vimeo).toBe('https://player.vimeo.com/video/76979871?dnt=1&loop=0');
        expect(videoEmbedUrl('nope')).toBeNull();
    });
});

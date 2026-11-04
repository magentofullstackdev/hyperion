<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Service;

use Magentofullstackdev\HyperionImage\ViewModel\ImageConfig;

/**
 * Rewrites `<img>` tags in arbitrary HTML to `<picture>` wrappers
 * with WebP/AVIF `<source>` siblings -- used for content that can't
 * be templated explicitly (CMS blocks, CMS pages, widget HTML).
 *
 * Conservative by design:
 *   * Only rewrites `<img>` tags whose `src` resolves to the local
 *     /media/ root -- third-party CDN URLs are skipped.
 *   * Skips `<img>` already inside a `<picture>` element so we
 *     never double-wrap.
 *   * Emits `<source>` ONLY when the companion file exists on disk
 *     (browsers don't fall through `<picture>` on a 404).
 *
 * Cost is bounded: one regex pass per cached HTML string, then per-
 * image `file_exists()` calls memoised inside ImageConfig. With the
 * full_page cache hot, this runs once per cache fill -- not per
 * request.
 */
class HtmlImageRewriter
{
    /** The first content image of the request already carries the priority hint. */
    private bool $priorityHinted = false;

    public function __construct(
        private readonly ImageConfig $imageConfig
    ) {
    }

    public function rewrite(string $html): string
    {
        if ($html === '' || stripos($html, '<img') === false) {
            return $html;
        }
        $html = $this->addIntrinsicSizes($html);
        $html = $this->addPriorityHint($html);
        if (!$this->imageConfig->isWebpEnabled() && !$this->imageConfig->isAvifEnabled()) {
            return $html;
        }

        // First neutralise <img> tags already inside a <picture> so
        // they don't get wrapped a second time.
        $protected = preg_replace_callback(
            '/<picture\b[^>]*>.*?<\/picture>/is',
            static fn (array $m): string => str_replace('<img', '<img data-hyperion-skip-picture', $m[0]),
            $html
        );
        if ($protected === null) {
            return $html;
        }

        $rewritten = preg_replace_callback(
            '/<img\b([^>]*)>/i',
            function (array $match): string {
                $attrs = $match[1];
                if (strpos($attrs, 'data-hyperion-skip-picture') !== false) {
                    return $match[0];
                }
                // Group 1 is the quote character, group 2 the (non-empty) value.
                if (!preg_match('/\bsrc\s*=\s*(["\'])(.+?)\1/is', $attrs, $srcMatch)) {
                    return $match[0];
                }
                $src = $srcMatch[2];

                $sources = '';
                if ($this->imageConfig->hasAvifCompanion($src)) {
                    $sources .= '<source type="image/avif" srcset="'
                        . htmlspecialchars($this->imageConfig->getAvifUrl($src), ENT_QUOTES, 'UTF-8')
                        . '">';
                }
                if ($this->imageConfig->hasWebpCompanion($src)) {
                    $sources .= '<source type="image/webp" srcset="'
                        . htmlspecialchars($this->imageConfig->getWebpUrl($src), ENT_QUOTES, 'UTF-8')
                        . '">';
                }
                if ($sources === '') {
                    return $match[0];
                }
                return '<picture>' . $sources . $match[0] . '</picture>';
            },
            $protected
        );
        if ($rewritten === null) {
            return $html;
        }

        return str_replace(' data-hyperion-skip-picture', '', $rewritten);
    }

    /**
     * `fetchpriority="high"` on the first content image of the request: the
     * CMS blocks render in document order, so on a landing page it is the
     * hero banner, the usual largest contentful paint. Without the hint the
     * browser queues it behind the stylesheet and the module preloads. An
     * image that opts out (`loading="lazy"`, its own `fetchpriority`) is
     * skipped and the hint goes to no other image of the request.
     */
    private function addPriorityHint(string $html): string
    {
        if ($this->priorityHinted) {
            return $html;
        }
        if (!preg_match('/<img\b([^>]*)>/i', $html, $match, PREG_OFFSET_CAPTURE)) {
            return $html;
        }
        $this->priorityHinted = true;
        $attrs = $match[1][0];
        if (preg_match('/\b(fetchpriority\s*=|loading\s*=\s*(["\']?)lazy\2)/i', $attrs)) {
            return $html;
        }
        $end = str_ends_with($attrs, '/') ? ' /' : '';
        $attrs = $end === '' ? $attrs : rtrim(substr($attrs, 0, -1));
        $tag = '<img' . rtrim($attrs) . ' fetchpriority="high"' . $end . '>';

        return substr_replace($html, $tag, $match[0][1], strlen($match[0][0]));
    }

    /**
     * `width` and `height` for the local images that carry neither (no layout shift):
     * the browser reserves the box from the attributes and the content around
     * the image never moves when it loads. The theme's `img { height: auto;
     * max-width: 100% }` keeps the attributes to the aspect ratio only.
     */
    private function addIntrinsicSizes(string $html): string
    {
        $result = preg_replace_callback(
            '/<img\b([^>]*)>/i',
            function (array $match): string {
                $attrs = $match[1];
                if (preg_match('/\b(width|height)\s*=/i', $attrs)) {
                    return $match[0];
                }
                if (!preg_match('/\bsrc\s*=\s*(["\'])(.+?)\1/is', $attrs, $srcMatch)) {
                    return $match[0];
                }
                $size = $this->imageConfig->getIntrinsicSize(html_entity_decode($srcMatch[2], ENT_QUOTES, 'UTF-8'));
                if ($size === null) {
                    return $match[0];
                }
                $end = str_ends_with($attrs, '/') ? ' /' : '';
                $attrs = $end === '' ? $attrs : rtrim(substr($attrs, 0, -1));

                return '<img' . rtrim($attrs) . ' width="' . $size[0] . '" height="' . $size[1] . '"' . $end . '>';
            },
            $html
        );

        return $result ?? $html;
    }
}

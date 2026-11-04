<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Seo;

/**
 * A meta description made from the text a page already carries (the
 * category or product description, the CMS page content): tags, scripts,
 * styles and `{{...}}` directives removed, entities decoded, whitespace
 * collapsed, cut at a word boundary within the length search engines show.
 */
class MetaDescription
{
    public const MAX_LENGTH = 160;

    public function fromHtml(string $html, int $maxLength = self::MAX_LENGTH): string
    {
        $text = (string) preg_replace('/<(script|style)\b[^>]*>.*?<\/\1>/is', ' ', $html);
        $text = (string) preg_replace('/\{\{.*?\}\}/s', ' ', $text);
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim((string) preg_replace('/\s+/u', ' ', $text));
        if ($text === '' || mb_strlen($text) <= $maxLength) {
            return $text;
        }
        $head = mb_substr($text, 0, $maxLength + 1);
        $space = mb_strrpos($head, ' ');
        $cut = $space !== false && $space >= intdiv($maxLength, 2) ? mb_substr($head, 0, $space) : mb_substr($text, 0, $maxLength);

        return rtrim($cut, " \t,;:-");
    }
}

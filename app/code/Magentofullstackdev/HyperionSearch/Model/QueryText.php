<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model;

/**
 * Text helpers shared by the suggestions, the stop word plugin and the
 * zero-results fallback.
 */
class QueryText
{
    public const MAX_LENGTH = 64;

    public function __construct(
        private readonly Config $config
    ) {
    }

    /**
     * Lower case, trimmed, inner whitespace collapsed, capped: the shape every
     * cache key (application cache and Varnish) sees, so "Bag", " bag " and
     * "BAG" share one entry.
     */
    public function normalize(string $query): string
    {
        $query = mb_strtolower(trim($query));
        $query = (string) preg_replace('/\s+/u', ' ', $query);

        return mb_substr($query, 0, self::MAX_LENGTH);
    }

    /**
     * The query without the configured stop words. The original text comes
     * back when nothing would remain, or when no stop word is configured.
     */
    public function stripStopWords(string $query, ?int $storeId = null): string
    {
        $stopWords = $this->config->getStopWords($storeId);
        if ($stopWords === [] || trim($query) === '') {
            return $query;
        }
        $kept = [];
        foreach (preg_split('/\s+/u', trim($query)) ?: [] as $word) {
            if ($word !== '' && !in_array(mb_strtolower($word), $stopWords, true)) {
                $kept[] = $word;
            }
        }

        return $kept === [] ? $query : implode(' ', $kept);
    }

    /**
     * @return string[] the distinct words of the query, longest first, stop words removed
     */
    public function words(string $query, ?int $storeId = null): array
    {
        $words = array_values(array_unique(array_filter(
            preg_split('/\s+/u', $this->normalize($this->stripStopWords($query, $storeId))) ?: [],
            static fn (string $word): bool => $word !== ''
        )));
        usort($words, static fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));

        return $words;
    }
}

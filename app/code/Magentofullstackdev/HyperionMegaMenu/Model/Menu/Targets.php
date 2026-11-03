<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

/**
 * What the items of a tree point at, resolved in batch for one store view.
 */
class Targets
{
    /**
     * @param array<int, array{id: int, name: string, url: string, level: int, parent_id: int, children: int[]}> $categories
     *        by category id (the items' categories and their live descendants)
     * @param array<string, string> $products URL by SKU
     * @param array<string, string> $pages URL by identifier (or page id as a string)
     * @param array<string, string> $blocks rendered HTML by block identifier
     * @param string[] $identities cache tags of everything resolved
     */
    public function __construct(
        public readonly array $categories = [],
        public readonly array $products = [],
        public readonly array $pages = [],
        public readonly array $blocks = [],
        public readonly array $identities = []
    ) {
    }
}

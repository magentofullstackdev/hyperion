<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

use Magentofullstackdev\HyperionMegaMenu\Model\Group;

/**
 * A built menu: nested node arrays (see TreeBuilder::node()) and the cache
 * identities of everything they show.
 */
class Tree
{
    /**
     * @param array<int, array<string, mixed>> $nodes root nodes in order
     * @param string[] $identities
     */
    public function __construct(
        public readonly Group $group,
        public readonly array $nodes,
        public readonly array $identities
    ) {
    }

    public function isEmpty(): bool
    {
        return $this->nodes === [];
    }
}

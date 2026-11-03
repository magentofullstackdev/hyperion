<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

/**
 * Session-bound header fragments (account menu, wish list and compare
 * counters, mini-cart badge) that the storefront fetches with ONE request
 * per page view: `hyperion/header/state`.
 *
 * Modules register their fragment through di.xml:
 *
 *   <type name="Magentofullstackdev\HyperionCore\Model\Htmx\HeaderStatePool">
 *       <arguments><argument name="fragments" xsi:type="array">
 *           <item name="wishlist" xsi:type="array">
 *               <item name="handle" xsi:type="string">hyperion_customer_wishlist</item>
 *               <item name="block" xsi:type="string">hyperion.customer.wishlist.fragment</item>
 *               <item name="sort_order" xsi:type="number">20</item>
 *           </item>
 *       </argument></arguments>
 *   </type>
 *
 * The block is rendered with `oob => true`, so its template must carry the
 * id of the header placeholder and `hx-swap-oob`. A fragment whose markup
 * is only the INNER html of its placeholder sets `target_id` instead and
 * gets wrapped in an `hx-swap-oob="innerHTML"` element.
 */
class HeaderStatePool
{
    /**
     * @param array<string, array{handle?: string, block?: string, target_id?: string, sort_order?: int|string}> $fragments
     */
    public function __construct(
        private readonly array $fragments = []
    ) {
    }

    /**
     * Registered fragments in render order.
     *
     * @return array<int, array{handle: string, block: string, target_id: string}>
     */
    public function getFragments(): array
    {
        $fragments = array_filter(
            $this->fragments,
            static fn (array $fragment): bool => !empty($fragment['handle']) && !empty($fragment['block'])
        );
        uasort(
            $fragments,
            static fn (array $a, array $b): int => (int) ($a['sort_order'] ?? 0) <=> (int) ($b['sort_order'] ?? 0)
        );

        return array_values(array_map(
            static fn (array $fragment): array => [
                'handle' => (string) $fragment['handle'],
                'block' => (string) $fragment['block'],
                'target_id' => (string) ($fragment['target_id'] ?? ''),
            ],
            $fragments
        ));
    }
}

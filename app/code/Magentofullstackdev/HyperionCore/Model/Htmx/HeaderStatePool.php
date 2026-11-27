<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Htmx;

use Psr\Log\LoggerInterface;

/**
 * Session-bound header fragments (account menu, wish list and compare
 * counters, mini-cart badge) that the storefront fetches with ONE request
 * per page view: `hyperion/header/state`.
 *
 * Modules register their fragment in etc/frontend/di.xml (the only scope
 * the pool is declared in: an argument of the same name in another scope
 * would replace this list):
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
 * Item shape: `handle` (required, a fragment-only layout handle), `block`
 * (required, the block name in that handle), `target_id` (optional),
 * `sort_order` (optional, ascending). The block is rendered with
 * `oob => true`, so its template must carry the id of the header placeholder
 * and `hx-swap-oob`. A fragment whose markup is only the INNER html of its
 * placeholder sets `target_id` instead and gets wrapped in an
 * `hx-swap-oob="innerHTML"` element. An item without `handle` or `block` is
 * skipped with one warning in the log.
 *
 * @api
 * @since 0.9.0
 */
class HeaderStatePool
{
    /** @var array<int, array{handle: string, block: string, target_id: string}>|null */
    private ?array $resolved = null;

    /**
     * @param LoggerInterface $logger
     * @param array<string, mixed> $fragments
     */
    public function __construct(
        private readonly LoggerInterface $logger,
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
        if ($this->resolved !== null) {
            return $this->resolved;
        }

        $fragments = [];
        foreach ($this->fragments as $name => $fragment) {
            if (!is_array($fragment) || empty($fragment['handle']) || empty($fragment['block'])) {
                $this->logger->warning(sprintf(
                    'Hyperion HeaderStatePool: fragment "%s" is skipped, it needs a "handle" and a "block".',
                    (string) $name
                ));
                continue;
            }
            $fragments[$name] = $fragment;
        }
        uasort(
            $fragments,
            static fn (array $a, array $b): int => (int) ($a['sort_order'] ?? 0) <=> (int) ($b['sort_order'] ?? 0)
        );

        return $this->resolved = array_values(array_map(
            static fn (array $fragment): array => [
                'handle' => (string) $fragment['handle'],
                'block' => (string) $fragment['block'],
                'target_id' => (string) ($fragment['target_id'] ?? ''),
            ],
            $fragments
        ));
    }
}

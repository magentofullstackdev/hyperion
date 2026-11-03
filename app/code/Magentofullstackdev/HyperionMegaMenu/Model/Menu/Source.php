<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

use Magento\Customer\Model\Context as CustomerContext;
use Magento\Customer\Model\Group as CustomerGroup;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface;
use Psr\Log\LoggerInterface;

/**
 * The mega menu as a navigation source: applies when an active group
 * matches the website and the device AND has items to show; the tree is
 * built once per device and request. The customer group and the login
 * state come from the HTTP context (page cache key state), never from the
 * session.
 */
class Source implements SourceInterface
{
    /** @var array<string, Tree|null> */
    private array $trees = [];

    public function __construct(
        private readonly GroupResolver $groupResolver,
        private readonly TreeBuilder $treeBuilder,
        private readonly Renderer $renderer,
        private readonly StoreManagerInterface $storeManager,
        private readonly HttpContext $httpContext,
        private readonly LoggerInterface $logger
    ) {
    }

    public function isApplicable(string $device): bool
    {
        $tree = $this->getTree($device);

        return $tree !== null && !$tree->isEmpty();
    }

    public function getHtml(string $device): string
    {
        $tree = $this->getTree($device);

        return $tree === null ? '' : $this->renderer->render($tree, $device);
    }

    public function getIdentities(string $device): array
    {
        $tree = $this->getTree($device);

        // Without a group the menu still depends on the groups: saving the
        // first one must purge the category menus cached meanwhile.
        return $tree === null ? [Group::CACHE_TAG] : $tree->identities;
    }

    public function getCacheKeyInfo(string $device): array
    {
        $tree = $this->getTree($device);

        return $tree === null ? [] : ['megamenu_' . (int) $tree->group->getId(), 'auth_' . ($this->isLoggedIn() ? '1' : '0')];
    }

    /**
     * The tree of a group for the current store (the widget / block path).
     */
    public function buildForGroup(Group $group, string $device): Tree
    {
        $storeId = 0;
        try {
            $storeId = (int) $this->storeManager->getStore()->getId();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: no current store: ' . $e->getMessage());
        }

        return $this->treeBuilder->build($group, $storeId, $this->getCustomerGroupId(), $device, $this->isLoggedIn());
    }

    private function getTree(string $device): ?Tree
    {
        if (!array_key_exists($device, $this->trees)) {
            $group = $this->groupResolver->resolve($device);
            $this->trees[$device] = $group === null ? null : $this->buildForGroup($group, $device);
        }

        return $this->trees[$device];
    }

    private function getCustomerGroupId(): int
    {
        return (int) $this->httpContext->getValue(CustomerContext::CONTEXT_GROUP) ?: CustomerGroup::NOT_LOGGED_IN_ID;
    }

    private function isLoggedIn(): bool
    {
        return (bool) $this->httpContext->getValue(CustomerContext::CONTEXT_AUTH);
    }
}

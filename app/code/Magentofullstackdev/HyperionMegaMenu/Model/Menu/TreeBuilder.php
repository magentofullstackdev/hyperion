<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

use Magento\Framework\UrlInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface;
use Psr\Log\LoggerInterface;

/**
 * Builds the nested tree of a group for one store view, customer group
 * and device in O(N): the loader's rows (one query), the targets resolved
 * in batch, then a parent map walked once. Items whose target no longer
 * exists (deleted category, disabled block) disappear with their subtree,
 * as do items hidden for the store, the customer group or the device.
 */
class TreeBuilder
{
    public function __construct(
        private readonly TreeLoader $loader,
        private readonly TargetResolver $targets,
        private readonly UrlInterface $urlBuilder,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    public function build(Group $group, int $storeId, int $customerGroupId, string $device, bool $loggedIn = false): Tree
    {
        try {
            $rows = $this->visibleRows($this->loader->load((int) $group->getId(), $storeId), $storeId, $customerGroupId, $device, $loggedIn);
            $targets = $this->targets->resolve($rows, $storeId);
            $store = $this->storeManager->getStore($storeId);
            $baseUrl = $store instanceof Store ? (string) $store->getBaseUrl() : '';
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: tree of group ' . (int) $group->getId() . ' failed: ' . $e->getMessage());
            return new Tree($group, [], $group->getIdentities());
        }

        $nodes = [];
        $byParent = [];
        foreach ($rows as $row) {
            $node = $this->node($row, $targets, $baseUrl);
            if ($node === null) {
                continue;
            }
            $nodes[(int) $row['item_id']] = $node;
            $byParent[(int) $row['parent_id']][] = (int) $row['item_id'];
        }

        return new Tree(
            $group,
            $this->assemble(0, $nodes, $byParent, $targets, 0),
            array_values(array_unique(array_merge($group->getIdentities(), $targets->identities)))
        );
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function visibleRows(array $rows, int $storeId, int $customerGroupId, string $device, bool $loggedIn): array
    {
        $visible = [];
        foreach ($rows as $id => $row) {
            if (!(int) $row['is_active']) {
                continue;
            }
            $storeIds = Item::idList($row['store_ids'] ?? null);
            if ($storeIds !== [] && !in_array($storeId, $storeIds, true)) {
                continue;
            }
            $groupIds = Item::idList($row['customer_group_ids'] ?? null);
            if ($groupIds !== [] && !in_array($customerGroupId, $groupIds, true)) {
                continue;
            }
            $type = (string) $row['item_type'];
            if ($device === SourceInterface::DEVICE_MOBILE && $type === Item::TYPE_CMS_BLOCK) {
                continue;
            }
            if ($loggedIn && in_array($type, [Item::TYPE_LOGIN, Item::TYPE_REGISTER], true)) {
                continue;
            }
            $visible[$id] = $row;
        }

        return $visible;
    }

    /**
     * Attaches the children of a parent recursively (each node is visited once).
     *
     * @param array<int, array<string, mixed>> $nodes
     * @param array<int, int[]> $byParent
     * @return array<int, array<string, mixed>>
     */
    private function assemble(int $parentId, array &$nodes, array $byParent, Targets $targets, int $level): array
    {
        $result = [];
        foreach ($byParent[$parentId] ?? [] as $id) {
            $node = $nodes[$id];
            $node['level'] = $level;
            $children = $this->assemble($id, $nodes, $byParent, $targets, $level + 1);
            if ($node['type'] === Item::TYPE_CATEGORY && $node['children_depth'] > 0) {
                $children = $this->mergeLive($children, $this->liveChildren((int) $node['target'], $targets, $level + 1, $node['children_depth']));
            }
            $node['children'] = $children;
            $result[] = $node;
        }

        return $result;
    }

    /**
     * The live subcategories after the manual children. A live subcategory
     * whose category a manual child already targets is folded into that
     * child (its own live subcategories merged the same way), so a category
     * is never listed twice at one level: the manual item keeps its title,
     * badge and width, and still gains the live levels below it.
     *
     * @param array<int, array<string, mixed>> $manual
     * @param array<int, array<string, mixed>> $live
     * @return array<int, array<string, mixed>>
     */
    private function mergeLive(array $manual, array $live): array
    {
        foreach ($live as $liveNode) {
            $merged = false;
            foreach ($manual as $index => $manualNode) {
                if ($manualNode['type'] === Item::TYPE_CATEGORY && $manualNode['target'] === $liveNode['target']) {
                    $manual[$index]['children'] = $this->mergeLive($manualNode['children'], $liveNode['children']);
                    $merged = true;
                    break;
                }
            }
            if (!$merged) {
                $manual[] = $liveNode;
            }
        }

        return $manual;
    }

    /**
     * The live subcategories of a category item as nodes.
     *
     * @return array<int, array<string, mixed>>
     */
    private function liveChildren(int $categoryId, Targets $targets, int $level, int $depth): array
    {
        if ($depth <= 0 || !isset($targets->categories[$categoryId])) {
            return [];
        }
        $result = [];
        foreach ($targets->categories[$categoryId]['children'] as $childId) {
            $category = $targets->categories[$childId] ?? null;
            if ($category === null) {
                continue;
            }
            $result[] = [
                'id' => 'c' . $childId,
                'title' => $category['name'],
                'url' => $category['url'],
                'target' => $childId,
                'type' => Item::TYPE_CATEGORY,
                'link_target' => '_self',
                'nofollow' => false,
                'class' => '',
                'badge' => null,
                'width' => 0,
                'container' => true,
                'html' => '',
                'level' => $level,
                'children_depth' => 0,
                'children' => $this->liveChildren($childId, $targets, $level + 1, $depth - 1),
            ];
        }

        return $result;
    }

    /**
     * A loader row as a node, or null when its target cannot be resolved.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>|null
     */
    private function node(array $row, Targets $targets, string $baseUrl): ?array
    {
        $type = (string) $row['item_type'];
        $value = trim((string) ($row['item_target_value'] ?? ''));
        $url = null;
        $html = '';
        $title = (string) $row['title'];
        switch ($type) {
            case Item::TYPE_CATEGORY:
                $category = $targets->categories[(int) $value] ?? null;
                if ($category === null) {
                    return null;
                }
                $url = $category['url'];
                if ($title === '') {
                    $title = $category['name'];
                }
                break;
            case Item::TYPE_PRODUCT:
                $url = $targets->products[$value] ?? null;
                if ($url === null) {
                    return null;
                }
                break;
            case Item::TYPE_CMS_PAGE:
                $url = $targets->pages[$value] ?? null;
                if ($url === null) {
                    return null;
                }
                break;
            case Item::TYPE_CMS_BLOCK:
                $html = $targets->blocks[$value] ?? '';
                if ($html === '') {
                    return null;
                }
                break;
            case Item::TYPE_CUSTOM:
                $url = $this->customUrl($value, $baseUrl);
                if ($url === null) {
                    return null;
                }
                break;
            case Item::TYPE_HOME:
                $url = $baseUrl;
                break;
            case Item::TYPE_EMPTY:
                $url = null;
                break;
            default:
                $route = Item::SYSTEM_ROUTES[$type] ?? null;
                if ($route === null) {
                    return null;
                }
                $url = $this->urlBuilder->getUrl($route);
                break;
        }
        $badgeText = trim((string) ($row['badge_text'] ?? ''));
        $badgeColor = (string) ($row['badge_color'] ?? '');

        return [
            'id' => 'i' . (int) $row['item_id'],
            'title' => $title,
            'url' => $url,
            'target' => $type === Item::TYPE_CATEGORY ? (int) $value : $value,
            'type' => $type,
            'link_target' => (string) $row['url_target'] === '_blank' ? '_blank' : '_self',
            'nofollow' => (bool) $row['nofollow'],
            'class' => trim((string) ($row['custom_class'] ?? '')),
            'badge' => $badgeText === '' ? null : ['text' => $badgeText, 'color' => in_array($badgeColor, Item::BADGE_COLORS, true) ? $badgeColor : 'primary'],
            'width' => max(0, min(12, (int) $row['dropdown_width'])),
            'container' => (bool) $row['is_container'],
            'html' => $html,
            'level' => (int) $row['level'],
            'children_depth' => max(0, min(Item::MAX_CHILDREN_DEPTH, (int) ($row['children_depth'] ?? 0))),
            'children' => [],
        ];
    }

    /**
     * `{storeurl}path`, `/path` and `path` resolve against the store's base URL; absolute URLs stay.
     */
    private function customUrl(string $value, string $baseUrl): ?string
    {
        if ($value === '') {
            return null;
        }
        if (preg_match('/^(javascript|data|vbscript):/i', $value)) {
            return null;
        }
        if (str_contains($value, '{storeurl}')) {
            return rtrim($baseUrl, '/') . '/' . ltrim(str_replace('{storeurl}', '', $value), '/');
        }
        if (preg_match('#^(https?:)?//#i', $value) || str_starts_with($value, '#') || str_starts_with($value, 'mailto:') || str_starts_with($value, 'tel:')) {
            return $value;
        }

        return rtrim($baseUrl, '/') . '/' . ltrim($value, '/');
    }
}

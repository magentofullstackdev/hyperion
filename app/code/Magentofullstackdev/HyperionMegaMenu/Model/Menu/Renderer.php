<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

use Magento\Framework\Escaper;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface;

/**
 * Markup of a built tree, with the same contract as the category
 * navigation (`[data-hyperion-topmenu]` root, `[data-hyperion-submenu]`
 * flyouts / accordion lists, the mobile toggle button handled by entry.js,
 * the hover rules of _topmenu.css). A root item with a dropdown width of
 * two or more on a `mega-horizontal` group opens a full width panel
 * (`[data-hyperion-mega-panel]`, a 12 column grid whose columns are its
 * children, a CMS block child printing its content); every other dropdown
 * is the usual flyout. Tailwind classes only: the config scans this file.
 */
class Renderer
{
    private const BADGE_CLASSES = [
        'primary' => 'bg-primary text-on-primary',
        'danger' => 'bg-error text-on-error',
        'success' => 'bg-success text-on-success',
        'warning' => 'bg-warning text-on-warning',
        'neutral' => 'bg-surface-raised text-secondary border border-subtle',
    ];

    private const COLUMN_SPAN = [
        1 => 'col-span-1', 2 => 'col-span-2', 3 => 'col-span-3', 4 => 'col-span-4', 5 => 'col-span-5', 6 => 'col-span-6',
        7 => 'col-span-7', 8 => 'col-span-8', 9 => 'col-span-9', 10 => 'col-span-10', 11 => 'col-span-11', 12 => 'col-span-12',
    ];

    public function __construct(
        private readonly Escaper $escaper
    ) {
    }

    public function render(Tree $tree, string $device): string
    {
        if ($tree->isEmpty()) {
            return '';
        }
        if ($device === SourceInterface::DEVICE_MOBILE) {
            return $this->renderMobile($tree);
        }

        return $this->renderDesktop($tree);
    }

    /**
     * The desktop menubar (horizontal from md; a `v-list` group stacks).
     */
    public function renderDesktop(Tree $tree): string
    {
        $group = $tree->group;
        $vertical = $group->getMenuType() === Group::TYPE_V_LIST;
        $mega = $group->getMenuType() === Group::TYPE_MEGA_HORIZONTAL;
        $html = '<ul class="flex flex-col ' . ($vertical ? 'lg:items-stretch' : 'lg:flex-row lg:items-center') . ' gap-0"'
            . ' data-hyperion-topmenu data-hyperion-megamenu="' . $this->escaper->escapeHtmlAttr($group->getIdentifier()) . '">';
        foreach ($tree->nodes as $node) {
            $html .= $this->renderRootItem($node, $mega && $node['width'] >= 2 && $node['children'] !== []);
        }

        return $html . '</ul>';
    }

    /**
     * The drawer accordion: every level a nested list behind the toggle button.
     */
    public function renderMobile(Tree $tree): string
    {
        $html = '<ul class="flex flex-col gap-0" data-hyperion-topmenu'
            . ' data-hyperion-megamenu="' . $this->escaper->escapeHtmlAttr($tree->group->getIdentifier()) . '">';
        foreach ($tree->nodes as $node) {
            $html .= $this->renderMobileItem($node, 1);
        }

        return $html . '</ul>';
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderRootItem(array $node, bool $megaPanel): string
    {
        $hasChildren = $node['children'] !== [];
        $html = '<li class="' . $this->classes('border-b border-subtle lg:border-0', $node['class']) . '"'
            . ($megaPanel ? ' data-hyperion-mega-item' : '') . '>';
        $html .= '<div class="flex items-center justify-between">';
        $html .= $this->renderLink($node, 'flex-1 inline-flex items-center gap-1.5 px-4 py-3 lg:py-2 text-primary font-medium hover:text-accent focus:outline-none focus:ring-2 focus:ring-primary rounded');
        if ($hasChildren) {
            $html .= $this->renderToggle($node);
        }
        $html .= '</div>';
        if ($hasChildren) {
            $html .= $megaPanel ? $this->renderMegaPanel($node) : $this->renderFlyout($node['children']);
        }

        return $html . '</li>';
    }

    /**
     * A full width panel: the children are the grid columns (a CMS block prints its content).
     *
     * @param array<string, mixed> $node
     */
    private function renderMegaPanel(array $node): string
    {
        $inner = $node['container'] ? 'container mx-auto px-4' : 'px-6';
        $html = '<div class="hidden" data-hyperion-submenu data-hyperion-mega-panel>'
            . '<div class="' . $inner . ' py-6 grid grid-cols-12 gap-6">';
        foreach ($node['children'] as $column) {
            $span = self::COLUMN_SPAN[$column['width'] > 0 ? $column['width'] : 3];
            if ($column['type'] === Item::TYPE_CMS_BLOCK) {
                $html .= '<div class="' . $this->classes($span . ' min-w-0', $column['class']) . '" data-hyperion-mega-column data-hyperion-mega-block>'
                    . $column['html'] . '</div>';
                continue;
            }
            $html .= '<div class="' . $this->classes($span . ' min-w-0', $column['class']) . '" data-hyperion-mega-column>';
            $html .= $this->renderLink($column, 'inline-flex items-center gap-1.5 font-semibold text-secondary hover:text-primary');
            if ($column['children'] !== []) {
                $html .= $this->renderColumnList($column['children'], 'mt-2 space-y-1');
            }
            $html .= '</div>';
        }

        return $html . '</div></div>';
    }

    /**
     * Plain nested lists inside a mega column (no flyout hooks: the panel is already open).
     *
     * @param array<int, array<string, mixed>> $nodes
     */
    private function renderColumnList(array $nodes, string $listClass): string
    {
        $html = '<ul class="' . $listClass . '">';
        foreach ($nodes as $node) {
            if ($node['type'] === Item::TYPE_CMS_BLOCK) {
                $html .= '<li class="' . $this->classes('py-1', $node['class']) . '" data-hyperion-mega-block>' . $node['html'] . '</li>';
                continue;
            }
            $html .= '<li class="' . $this->classes('', $node['class']) . '">';
            $html .= $this->renderLink($node, 'inline-flex items-center gap-1.5 py-0.5 text-sm text-secondary hover:text-primary');
            if ($node['children'] !== []) {
                $html .= $this->renderColumnList($node['children'], 'ml-3 mt-1 space-y-0.5');
            }
            $html .= '</li>';
        }

        return $html . '</ul>';
    }

    /**
     * The usual flyout (`_topmenu.css`): nested lists that open on hover / focus.
     *
     * @param array<int, array<string, mixed>> $nodes
     */
    private function renderFlyout(array $nodes): string
    {
        $html = '<ul class="hidden" data-hyperion-submenu>';
        foreach ($nodes as $node) {
            if ($node['type'] === Item::TYPE_CMS_BLOCK) {
                $html .= '<li class="' . $this->classes('px-4 py-2', $node['class']) . '" data-hyperion-mega-block>' . $node['html'] . '</li>';
                continue;
            }
            $hasChildren = $node['children'] !== [];
            $html .= '<li class="' . $this->classes('', $node['class']) . '">';
            $html .= '<div class="flex items-center justify-between">';
            $html .= $this->renderLink($node, 'flex-1 inline-flex items-center gap-1.5 px-4 py-3 lg:py-2 text-secondary hover:text-primary hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary rounded whitespace-nowrap');
            if ($hasChildren) {
                $html .= $this->renderToggle($node);
            }
            $html .= '</div>';
            if ($hasChildren) {
                $html .= $this->renderFlyout($node['children']);
            }
            $html .= '</li>';
        }

        return $html . '</ul>';
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderMobileItem(array $node, int $depth): string
    {
        $hasChildren = $node['children'] !== [];
        $html = '<li class="' . $this->classes($depth === 1 ? 'border-b border-subtle' : '', $node['class']) . '">';
        $html .= '<div class="flex items-center justify-between">';
        $html .= $this->renderLink(
            $node,
            $depth === 1
                ? 'flex-1 inline-flex items-center gap-1.5 px-4 py-3 text-primary font-medium focus:outline-none focus:ring-2 focus:ring-primary rounded'
                : 'flex-1 inline-flex items-center gap-1.5 px-4 py-3 text-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary rounded'
        );
        if ($hasChildren) {
            $html .= $this->renderToggle($node);
        }
        $html .= '</div>';
        if ($hasChildren) {
            $html .= '<ul class="hidden pl-4" data-hyperion-submenu>';
            foreach ($node['children'] as $child) {
                $html .= $this->renderMobileItem($child, $depth + 1);
            }
            $html .= '</ul>';
        }

        return $html . '</li>';
    }

    /**
     * The anchor of a node (a `span` for an `empty` item), with its badge.
     *
     * @param array<string, mixed> $node
     */
    private function renderLink(array $node, string $class): string
    {
        $label = $this->escaper->escapeHtml((string) $node['title']) . $this->renderBadge($node['badge']);
        if ($node['url'] === null) {
            return '<span class="' . $class . '" data-hyperion-menu-label>' . $label . '</span>';
        }
        $attributes = ' href="' . $this->escaper->escapeUrl((string) $node['url']) . '" class="' . $class . '"';
        if ($node['link_target'] === '_blank') {
            $attributes .= ' target="_blank" rel="noopener' . ($node['nofollow'] ? ' nofollow' : '') . '"';
        } elseif ($node['nofollow']) {
            $attributes .= ' rel="nofollow"';
        }

        return '<a' . $attributes . '>' . $label . '</a>';
    }

    /**
     * @param array{text: string, color: string}|null $badge
     */
    private function renderBadge(?array $badge): string
    {
        if ($badge === null) {
            return '';
        }
        $classes = self::BADGE_CLASSES[$badge['color']] ?? self::BADGE_CLASSES['primary'];

        return '<span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none ' . $classes . '"'
            . ' data-hyperion-badge>' . $this->escaper->escapeHtml($badge['text']) . '</span>';
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderToggle(array $node): string
    {
        return '<button type="button" class="lg:hidden p-3 text-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary rounded"'
            . ' aria-label="' . $this->escaper->escapeHtmlAttr((string) __('Toggle submenu for %1', (string) $node['title'])) . '"'
            . ' aria-expanded="false" data-hyperion-submenu-toggle>'
            . '<svg class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">'
            . '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></button>';
    }

    private function classes(string $base, string $custom): string
    {
        $custom = $this->escaper->escapeHtmlAttr(trim($custom));

        return trim($base . ($custom !== '' ? ' ' . $custom : ''));
    }
}

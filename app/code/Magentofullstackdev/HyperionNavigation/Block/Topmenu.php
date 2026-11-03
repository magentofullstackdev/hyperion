<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Block;

use Magento\Customer\Model\Context as CustomerContext;
use Magento\Customer\Model\Group as CustomerGroup;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Data\Tree\Node;
use Magento\Framework\Data\Tree\Node\Collection as NodeCollection;
use Magento\Framework\Data\Tree\NodeFactory;
use Magento\Framework\Data\TreeFactory;
use Magento\Theme\Block\Html\Topmenu as BaseTopmenu;
use Magento\Framework\View\Element\Template\Context;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourcePool;
use Psr\Log\LoggerInterface;

/**
 * The top navigation. Out of the box the category tree; a navigation
 * source (Model\Menu\SourcePool, the mega menu module) that applies to the
 * store and the device (`device` block argument: `desktop` by default,
 * `mobile` for the drawer tree) renders instead, with its own identities
 * and cache key parts.
 */
class Topmenu extends BaseTopmenu
{
    private ?Node $menuCache = null;
    private ?SourceInterface $source = null;
    private bool $sourceResolved = false;

    /**
     * @param Context $context
     * @param NodeFactory $nodeFactory
     * @param TreeFactory $treeFactory
     * @param HttpContext $httpContext
     * @param LoggerInterface $logger
     * @param SourcePool $sourcePool
     * @param array $data
     */
    public function __construct(
        Context $context,
        NodeFactory $nodeFactory,
        TreeFactory $treeFactory,
        private readonly HttpContext $httpContext,
        private readonly LoggerInterface $logger,
        private readonly SourcePool $sourcePool,
        array $data = []
    ) {
        parent::__construct($context, $nodeFactory, $treeFactory, $data);
    }

    /**
     * `desktop` (default) or `mobile`: the drawer tree is a separate render.
     */
    public function getDevice(): string
    {
        return (string) $this->getData('device') === SourceInterface::DEVICE_MOBILE
            ? SourceInterface::DEVICE_MOBILE
            : SourceInterface::DEVICE_DESKTOP;
    }

    /**
     * @param int $limit
     * @return string
     */
    public function getMenuHtml(int $limit = 0): string
    {
        try {
            $source = $this->getSource();
            if ($source !== null) {
                return $source->getHtml($this->getDevice());
            }
            // Categories are injected into $this->getMenu() by the Magento core
            // plugin Magento\Catalog\Plugin\Block\Topmenu::beforeGetHtml, which
            // only runs when getHtml() is invoked via the Magento Interceptor --
            // NOT via parent::getHtml() which bypasses the plugin chain. We
            // dispatch on $this so the Interceptor routes through every
            // beforeGetHtml plugin (populating the tree) and every
            // page_block_html_topmenu_gethtml_{before,after} event used by
            // third-party extensions. The returned HTML is discarded; we render
            // our own semantic Tailwind + HTMX markup from the populated tree.
            $this->getHtml();

            $root = $this->getMenuTree();
            $children = $root->getChildren();

            if ($children->count() === 0) {
                return '';
            }

            return $this->renderMenuBar($children, $limit);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Topmenu: failed to render menu HTML: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return array
     */
    public function getCacheKeyInfo(): array
    {
        $storeId = 'default';
        try {
            $storeId = (string) $this->_storeManager->getStore()->getId();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Topmenu: failed to get store ID for cache key: ' . $e->getMessage());
        }

        $info = array_merge(
            parent::getCacheKeyInfo(),
            [
                'store_' . $storeId,
                'group_' . $this->getCustomerGroupId(),
                'device_' . $this->getDevice(),
            ]
        );
        $source = $this->getSource();
        if ($source !== null) {
            $info = array_merge($info, $source->getCacheKeyInfo($this->getDevice()));
        }

        return $info;
    }

    /**
     * The category identities of the core block plus those of every
     * navigation source (an inactive source still names the tags that
     * would activate it, so this cached menu is purged when it does).
     *
     * @return string[]
     */
    public function getIdentities()
    {
        return array_values(array_unique(array_merge(
            (array) parent::getIdentities(),
            $this->sourcePool->getIdentities($this->getDevice())
        )));
    }

    private function getSource(): ?SourceInterface
    {
        if (!$this->sourceResolved) {
            $this->sourceResolved = true;
            $this->source = $this->sourcePool->resolve($this->getDevice());
        }

        return $this->source;
    }

    /**
     * The customer group from the HTTP context (cache-key state, the same
     * value the page cache varies on), never from the session: the
     * depersonalize plugins clear the session before a cached page renders.
     * A visitor without a context value is NOT LOGGED IN (group 0).
     */
    private function getCustomerGroupId(): int
    {
        $group = $this->httpContext->getValue(CustomerContext::CONTEXT_GROUP);

        return $group === null ? CustomerGroup::NOT_LOGGED_IN_ID : (int) $group;
    }

    /**
     * @return \Magento\Framework\Data\Tree\Node
     */
    private function getMenuTree(): Node
    {
        if ($this->menuCache === null) {
            $this->menuCache = $this->getMenu();
        }

        return $this->menuCache;
    }

    /**
     * Root list -- horizontal on md+, stacked column on mobile (when
     * hosted inside the hyperion-dropdown drawer). A plain list with
     * disclosure buttons (the APG disclosure navigation pattern): no ARIA
     * menu roles, which would promise an arrow key model the menu does
     * not have.
     */
    private function renderMenuBar(NodeCollection $children, int $limit): string
    {
        $html = '<ul class="flex flex-col lg:flex-row lg:items-center gap-0" data-hyperion-topmenu>';

        $counter = 0;
        foreach ($children as $child) {
            if ($limit > 0 && $counter >= $limit) {
                break;
            }

            $html .= $this->renderItem($child, 1);
            $counter++;
        }

        $html .= '</ul>';

        return $html;
    }

    /**
     * Recursively render a menu node at the given depth.
     * Depth 1 items sit in the horizontal root list on desktop; depth 2+ are
     * flyout panels (desktop) or nested accordion rows (mobile).
     */
    private function renderItem(Node $item, int $depth): string
    {
        $hasChildren = $item->hasChildren();
        $liClass = $this->liClass($depth, $hasChildren);

        $html = '<li class="' . $liClass . '">';
        $html .= '<div class="' . $this->rowClass($depth) . '">';
        $html .= $this->renderLink($item, $depth);

        if ($hasChildren) {
            $html .= $this->renderToggleButton($item, $depth);
        }

        $html .= '</div>';

        if ($hasChildren) {
            $html .= $this->renderSubMenu($item->getChildren(), $depth + 1);
        }

        $html .= '</li>';

        return $html;
    }

    /**
     * Render a submenu at the given depth (>= 2). Recurses via renderItem().
     */
    private function renderSubMenu(NodeCollection $children, int $depth): string
    {
        $ulClass = $this->subMenuClass($depth);
        $html = '<ul class="' . $ulClass . '" data-hyperion-submenu>';

        foreach ($children as $child) {
            $html .= $this->renderItem($child, $depth);
        }

        $html .= '</ul>';

        return $html;
    }

    /**
     * Tailwind classes for each <li>.
     *
     * Dropdown positioning + hover-reveal behavior is handled entirely by
     * _topmenu.css (which targets the `data-hyperion-topmenu` and
     * `data-hyperion-submenu` hooks) so the block emits only visual
     * styling tokens here.
     */
    private function liClass(int $depth, bool $hasChildren): string
    {
        if ($depth === 1) {
            return 'border-b border-subtle lg:border-0';
        }
        return '';
    }

    /**
     * Wrapper row that holds the link + the mobile-only toggle button.
     */
    private function rowClass(int $depth): string
    {
        return 'flex items-center justify-between';
    }

    /**
     * Baseline submenu classes. The `hidden` modifier is flipped by the
     * mobile toggle handler in web/js/entry.js; desktop flyouts are driven
     * by :hover / :focus-within rules in _topmenu.css.
     */
    private function subMenuClass(int $depth): string
    {
        return 'hidden';
    }

    /**
     * Build the anchor. Depth 1 uses a bolder link; depth 2+ becomes a
     * hoverable flyout entry.
     */
    private function renderLink(Node $item, int $depth): string
    {
        $classes = $this->linkClass($depth);
        $url = $this->escapeUrl((string) $item->getData('url'));
        $name = $this->escapeHtml((string) $item->getName());
        $ariaLabel = $this->escapeHtmlAttr((string) __($item->getName()));

        // Plain navigation anchor -- no hx-* attributes. The previous
        // version emitted hx-get/hx-target="#page-main" which threw
        // htmx:targetError because Magento's main container has no such
        // id; rewriting category navigation as an HTMX swap is also
        // architecturally wrong (full PLPs need fresh layered nav,
        // toolbar, breadcrumbs -- all of which live OUTSIDE the grid).
        // Native links give the user the correct full-page navigation.
        return sprintf(
            '<a href="%s" class="%s" aria-label="%s">%s</a>',
            $url,
            $classes,
            $ariaLabel,
            $name
        );
    }

    /**
     * Anchor classes per depth.
     */
    private function linkClass(int $depth): string
    {
        if ($depth === 1) {
            return 'flex-1 px-4 py-3 lg:py-2 text-primary font-medium hover:text-accent focus:outline-none focus:ring-2 focus:ring-primary rounded';
        }

        return 'flex-1 block px-4 py-3 lg:py-2 text-secondary hover:text-primary hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary rounded whitespace-nowrap';
    }

    /**
     * Mobile-only toggle button for expanding/collapsing a submenu.
     * On desktop (lg:+) the flyout is driven by CSS :hover and this button
     * becomes decorative (lg:hidden).
     */
    private function renderToggleButton(Node $item, int $depth): string
    {
        $ariaLabel = $this->escapeHtmlAttr((string) __('Toggle submenu for %1', (string) $item->getName()));

        return sprintf(
            '<button type="button" class="lg:hidden p-3 text-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary rounded"'
            . ' aria-label="%s" aria-expanded="false" data-hyperion-submenu-toggle>'
            . '<svg class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">'
            . '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>'
            . '</svg>'
            . '</button>',
            $ariaLabel
        );
    }
}

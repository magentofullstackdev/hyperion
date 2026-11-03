<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Block;

use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Widget\Block\BlockInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\GroupResolver;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\Renderer;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\Source;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\Tree;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface;
use Psr\Log\LoggerInterface;

/**
 * A menu group placed anywhere: the "Hyperion Mega Menu" widget (CMS
 * pages, blocks, PageBuilder) or a layout block with a `group_identifier`
 * argument (the footer). Cached per store, group and vary context with the
 * tree's identities; `device` defaults to desktop (`mobile` for an
 * accordion).
 */
class Menu extends Template implements BlockInterface, IdentityInterface
{
    private ?Tree $tree = null;
    private bool $treeBuilt = false;

    /**
     * @param array<string, mixed> $data
     */
    public function __construct(
        Context $context,
        private readonly GroupResolver $groupResolver,
        private readonly Source $source,
        private readonly Renderer $renderer,
        private readonly HttpContext $httpContext,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
        if (!$this->hasData('cache_lifetime')) {
            $this->setData('cache_lifetime', 3600);
        }
        if (!$this->getTemplate()) {
            $this->setTemplate('Magentofullstackdev_HyperionMegaMenu::menu.phtml');
        }
    }

    public function getGroupIdentifier(): string
    {
        return trim((string) $this->getData('group_identifier'));
    }

    public function getDevice(): string
    {
        return (string) $this->getData('device') === SourceInterface::DEVICE_MOBILE
            ? SourceInterface::DEVICE_MOBILE
            : SourceInterface::DEVICE_DESKTOP;
    }

    public function getMenuHtml(): string
    {
        $tree = $this->getTree();

        return $tree === null ? '' : $this->renderer->render($tree, $this->getDevice());
    }

    /**
     * @return string[]
     */
    public function getIdentities()
    {
        $tree = $this->getTree();

        return $tree === null ? [Group::CACHE_TAG] : $tree->identities;
    }

    /**
     * @return array<int, string>
     */
    public function getCacheKeyInfo()
    {
        $storeId = 'default';
        try {
            $storeId = (string) $this->_storeManager->getStore()->getId();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu block: no store: ' . $e->getMessage());
        }

        return array_merge(parent::getCacheKeyInfo(), [
            'hyperion_megamenu',
            $this->getGroupIdentifier(),
            $this->getDevice(),
            'store_' . $storeId,
            (string) $this->httpContext->getVaryString(),
        ]);
    }

    private function getTree(): ?Tree
    {
        if (!$this->treeBuilt) {
            $this->treeBuilt = true;
            try {
                $websiteId = (int) $this->_storeManager->getStore()->getWebsiteId();
                $group = $this->groupResolver->getByIdentifier($this->getGroupIdentifier(), $websiteId);
                $this->tree = $group === null ? null : $this->source->buildForGroup($group, $this->getDevice());
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion mega menu block: ' . $e->getMessage());
            }
        }

        return $this->tree;
    }
}

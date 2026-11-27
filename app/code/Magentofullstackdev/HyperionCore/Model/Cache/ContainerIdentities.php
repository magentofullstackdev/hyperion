<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Cache;

use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Psr\Log\LoggerInterface;

/**
 * Cache identities of the blocks that third parties place inside the
 * extension containers of a block cached block (the product page view, the
 * product lists).
 *
 * A block cached parent stores the HTML of its children with ITS tags: a
 * child that shows a CMS block or another product would stay stale until the
 * parent's cache lifetime ends. The `containers` argument (etc/frontend/di.xml)
 * names, per parent block (its name in the layout), the children to inspect:
 * the alias of a direct child, or the element name of any element nested
 * under the parent (a container inside a child block). Every block found
 * under those children, at any depth, that implements IdentityInterface adds
 * its identities to the parent's.
 *
 *   <type name="Magentofullstackdev\HyperionCore\Model\Cache\ContainerIdentities">
 *       <arguments><argument name="containers" xsi:type="array">
 *           <item name="hyperion.product.view" xsi:type="array">
 *               <item name="info_extra" xsi:type="string">info_extra</item>
 *           </item>
 *       </argument></arguments>
 *   </type>
 *
 * Empty containers add nothing, so a store without extensions keeps the
 * parent's identities as they were. A child that fails to answer is logged
 * and skipped.
 *
 * @api
 * @since 0.9.0
 */
class ContainerIdentities
{
    /** Deepest nesting below a registered child that is inspected. */
    private const MAX_DEPTH = 8;

    /**
     * @param LoggerInterface $logger
     * @param array<string, mixed> $containers parent block name => [key => child alias or element name]
     */
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly array $containers = []
    ) {
    }

    /**
     * Whether the block has registered containers at all (a cheap check before collect()).
     *
     * @param AbstractBlock $block
     * @return bool
     */
    public function isRegistered(AbstractBlock $block): bool
    {
        $name = (string) $block->getNameInLayout();

        return $name !== '' && !empty($this->containers[$name]) && is_array($this->containers[$name]);
    }

    /**
     * The identities of the blocks inside the registered children of the block.
     *
     * @param AbstractBlock $block
     * @return string[]
     */
    public function collect(AbstractBlock $block): array
    {
        if (!$this->isRegistered($block)) {
            return [];
        }
        $parent = (string) $block->getNameInLayout();
        try {
            $layout = $block->getLayout();
            $children = $layout->getChildNames($parent);
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion ContainerIdentities: the children of "%s" could not be read: %s',
                $parent,
                $e->getMessage()
            ));
            return [];
        }

        $identities = [];
        $visited = [$parent => true];
        foreach ($this->containers[$parent] as $reference) {
            if (!is_string($reference) || $reference === '') {
                continue;
            }
            $element = $layout->getChildName($parent, $reference);
            if (!is_string($element) || $element === '') {
                $element = in_array($reference, $children, true) || $this->isDescendant($layout, $reference, $parent)
                    ? $reference
                    : null;
            }
            if ($element !== null) {
                $this->walk($layout, $element, 0, $visited, $identities);
            }
        }

        return array_values(array_unique($identities));
    }

    /**
     * Whether the element sits under the parent, at most MAX_DEPTH levels down.
     *
     * @param LayoutInterface $layout
     * @param string $name
     * @param string $parent
     * @return bool
     */
    private function isDescendant(LayoutInterface $layout, string $name, string $parent): bool
    {
        if (!$layout->hasElement($name)) {
            return false;
        }
        $current = $name;
        for ($depth = 0; $depth <= self::MAX_DEPTH; $depth++) {
            $current = $layout->getParentName($current);
            if (!is_string($current) || $current === '') {
                return false;
            }
            if ($current === $parent) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param LayoutInterface $layout
     * @param string $name
     * @param int $depth
     * @param array<string, bool> $visited
     * @param string[] $identities
     * @return void
     */
    private function walk(LayoutInterface $layout, string $name, int $depth, array &$visited, array &$identities): void
    {
        if ($depth > self::MAX_DEPTH || isset($visited[$name])) {
            return;
        }
        $visited[$name] = true;

        try {
            $block = $layout->isBlock($name) ? $layout->getBlock($name) : null;
            if ($block instanceof IdentityInterface) {
                foreach ((array) $block->getIdentities() as $identity) {
                    if (is_string($identity) && $identity !== '') {
                        $identities[] = $identity;
                    }
                }
            }
            $childNames = $layout->getChildNames($name);
        } catch (\Throwable $e) {
            $this->logger->error(sprintf(
                'Hyperion ContainerIdentities: the identities of "%s" could not be read: %s',
                $name,
                $e->getMessage()
            ));
            return;
        }

        foreach ($childNames as $childName) {
            $this->walk($layout, (string) $childName, $depth + 1, $visited, $identities);
        }
    }
}

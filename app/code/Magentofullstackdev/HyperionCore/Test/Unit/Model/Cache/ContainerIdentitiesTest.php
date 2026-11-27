<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Cache;

use Magento\Cms\Block\Block as CmsBlock;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\LayoutInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\ContainerIdentities;
use Magentofullstackdev\HyperionCore\Plugin\Catalog\Block\Product\ContainerIdentitiesPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The identities of the blocks inside the registered extension containers of
 * a block cached parent, merged into the parent's identities without changing
 * them when the containers are empty.
 *
 * @covers \Magentofullstackdev\HyperionCore\Model\Cache\ContainerIdentities
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Catalog\Block\Product\ContainerIdentitiesPlugin
 */
class ContainerIdentitiesTest extends TestCase
{
    private const PARENT = 'hyperion.product.view';

    private const CONTAINERS = [
        self::PARENT => [
            'info_extra' => 'info_extra',
            'tabs' => 'tabs',
            'missing' => 'not_on_this_page',
            'nested' => 'product.info.bundle.options.top',
        ],
    ];

    /**
     * Element tree of the fake layout: name => [alias, parent, children, block].
     *
     * @var array<string, array{alias: string, parent: string, children: string[], block: mixed}>
     */
    private array $tree = [];

    protected function setUp(): void
    {
        $this->tree = [];
        $this->element(self::PARENT, '', '', null);
        $this->element('hyperion.product.info.extra', 'info_extra', self::PARENT, null);
        $this->element('hyperion.product.tabs', 'tabs', self::PARENT, null);
        $this->element('hyperion.catalog.product.related', 'catalog.product.related', self::PARENT, $this->identityBlock(['cat_p_99']));
        $this->element('hyperion.product.bundle.options', 'type_bundle_options', self::PARENT, $this->createStub(Template::class));
        $this->element('product.info.bundle.options.top', 'product_info_bundle_options_top', 'hyperion.product.bundle.options', null);
    }

    public function testEmptyContainersAddNothingAndTheParentIdentitiesStayAsTheyWere(): void
    {
        $parent = $this->parentBlock();
        $identities = new ContainerIdentities($this->createStub(LoggerInterface::class), self::CONTAINERS);
        $parentIdentities = ['cat_p_1', 'cat_c_p_3'];

        self::assertSame([], $identities->collect($parent));
        self::assertSame($parentIdentities, (new ContainerIdentitiesPlugin($identities))->afterGetIdentities($parent, $parentIdentities));
    }

    public function testBlocksAtAnyDepthOfARegisteredContainerAddTheirIdentities(): void
    {
        $this->element('vendor.badge', 'badge', 'hyperion.product.info.extra', $this->identityBlock(['cms_b_7']));
        $this->element('vendor.wrapper', 'wrapper', 'hyperion.product.tabs', $this->createStub(Template::class));
        $this->element('vendor.tab.cms', 'cms', 'vendor.wrapper', $this->identityBlock(['cms_b_8', 'cms_b_7']));
        $this->element('vendor.bundle.note', 'note', 'product.info.bundle.options.top', $this->identityBlock(['cms_b_9']));
        $parent = $this->parentBlock();
        $identities = new ContainerIdentities($this->createStub(LoggerInterface::class), self::CONTAINERS);

        self::assertSame(['cms_b_7', 'cms_b_8', 'cms_b_9'], $identities->collect($parent));
        self::assertSame(
            ['cat_p_1', 'cms_b_7', 'cms_b_8', 'cms_b_9'],
            (new ContainerIdentitiesPlugin($identities))->afterGetIdentities($parent, ['cat_p_1', 'cms_b_7'])
        );
    }

    public function testChildrenOutsideTheRegisteredContainersAreNotRead(): void
    {
        $identities = new ContainerIdentities($this->createStub(LoggerInterface::class), self::CONTAINERS);

        self::assertNotContains('cat_p_99', $identities->collect($this->parentBlock()));
    }

    public function testAnUnregisteredBlockIsLeftAlone(): void
    {
        $block = $this->createMock(AbstractBlock::class);
        $block->method('getNameInLayout')->willReturn('category.products.list');
        $block->expects(self::never())->method('getLayout');
        $identities = new ContainerIdentities($this->createStub(LoggerInterface::class), self::CONTAINERS);

        self::assertSame(['cat_c_3'], (new ContainerIdentitiesPlugin($identities))->afterGetIdentities($block, ['cat_c_3']));
    }

    public function testAChildThatFailsIsLoggedAndSkipped(): void
    {
        $broken = $this->createStub(CmsBlock::class);
        $broken->method('getIdentities')->willThrowException(new \RuntimeException('cms block gone'));
        $this->element('vendor.broken', 'broken', 'hyperion.product.info.extra', $broken);
        $this->element('vendor.badge', 'badge', 'hyperion.product.tabs', $this->identityBlock(['cms_b_7']));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('cms block gone'));

        self::assertSame(['cms_b_7'], (new ContainerIdentities($logger, self::CONTAINERS))->collect($this->parentBlock()));
    }

    private function element(string $name, string $alias, string $parent, mixed $block): void
    {
        $this->tree[$name] = ['alias' => $alias, 'parent' => $parent, 'children' => [], 'block' => $block];
        if ($parent !== '') {
            $this->tree[$parent]['children'][] = $name;
        }
    }

    /**
     * @param string[] $identities
     */
    private function identityBlock(array $identities): CmsBlock
    {
        $block = $this->createStub(CmsBlock::class);
        $block->method('getIdentities')->willReturn($identities);

        return $block;
    }

    private function parentBlock(): AbstractBlock
    {
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getChildNames')->willReturnCallback(fn (string $name): array => $this->tree[$name]['children'] ?? []);
        $layout->method('getChildName')->willReturnCallback(function (string $parent, string $alias) {
            foreach ($this->tree[$parent]['children'] ?? [] as $child) {
                if ($this->tree[$child]['alias'] === $alias) {
                    return $child;
                }
            }
            return false;
        });
        $layout->method('hasElement')->willReturnCallback(fn (string $name): bool => isset($this->tree[$name]));
        $layout->method('getParentName')->willReturnCallback(fn (string $name) => ($this->tree[$name]['parent'] ?? '') ?: false);
        $layout->method('isBlock')->willReturnCallback(fn (string $name): bool => ($this->tree[$name]['block'] ?? null) !== null);
        $layout->method('getBlock')->willReturnCallback(fn (string $name) => $this->tree[$name]['block'] ?? false);

        $parent = $this->createStub(AbstractBlock::class);
        $parent->method('getNameInLayout')->willReturn(self::PARENT);
        $parent->method('getLayout')->willReturn($layout);

        return $parent;
    }
}


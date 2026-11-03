<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Test\Unit\Model\Menu;

use Magento\Framework\UrlInterface;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\TargetResolver;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\Targets;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\TreeBuilder;
use Magentofullstackdev\HyperionMegaMenu\Model\Menu\TreeLoader;
use Magentofullstackdev\HyperionNavigation\Model\Menu\SourceInterface;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionMegaMenu\Model\Menu\TreeBuilder
 */
class TreeBuilderTest extends TestCase
{
    /** @var TreeLoader&Stub */
    private TreeLoader $loader;

    /** @var TargetResolver&Stub */
    private TargetResolver $resolver;

    /** @var Group&Stub */
    private Group $group;

    protected function setUp(): void
    {
        $this->loader = $this->createStub(TreeLoader::class);
        $this->resolver = $this->createStub(TargetResolver::class);
        $this->group = $this->createStub(Group::class);
        $this->group->method('getId')->willReturn(7);
        $this->group->method('getIdentities')->willReturn(['hyperion_megamenu', 'hyperion_megamenu_g_7']);
    }

    public function testBuildsTheNestedTreeFromFlatRowsAndBatchTargets(): void
    {
        $this->loader->method('load')->willReturn([
            10 => $this->row(10, 0, 'category', '20', ['title' => '']),
            11 => $this->row(11, 10, 'category', '21', ['dropdown_width' => 3]),
            12 => $this->row(12, 10, 'cms_block', 'promo', ['dropdown_width' => 6]),
            13 => $this->row(13, 0, 'custom', '{storeurl}sale', ['badge_text' => 'SALE', 'badge_color' => 'danger']),
            14 => $this->row(14, 0, 'product', 'MISSING'),
            15 => $this->row(15, 14, 'custom', '/orphan'),
            16 => $this->row(16, 0, 'empty', ''),
            17 => $this->row(17, 16, 'wishlist', ''),
            18 => $this->row(18, 0, 'cms_page', 'about-us'),
            19 => $this->row(19, 0, 'custom', 'javascript:alert(1)'),
        ]);
        $this->resolver->method('resolve')->willReturn(new Targets(
            [20 => $this->category(20, 'Women', '/women.html', 2, 1), 21 => $this->category(21, 'Tops', '/women/tops.html', 3, 20)],
            [],
            ['about-us' => 'https://shop.test/about-us'],
            ['promo' => '<p>Promo</p>'],
            ['cat_c_20', 'cat_c_21', 'cms_b_3', 'cms_p_5']
        ));
        $tree = $this->builder()->build($this->group, 1, 0, SourceInterface::DEVICE_DESKTOP);

        self::assertSame(['i10', 'i13', 'i16', 'i18'], array_column($tree->nodes, 'id'), 'the missing product and the javascript URL go, with the orphan');
        $women = $tree->nodes[0];
        self::assertSame('Women', $women['title'], 'an empty title falls back to the category name');
        self::assertSame('/women.html', $women['url']);
        self::assertSame(['i11', 'i12'], array_column($women['children'], 'id'));
        self::assertSame(1, $women['children'][0]['level']);
        self::assertSame('<p>Promo</p>', $women['children'][1]['html']);
        self::assertSame(6, $women['children'][1]['width']);
        self::assertSame('https://shop.test/sale', $tree->nodes[1]['url']);
        self::assertSame(['text' => 'SALE', 'color' => 'danger'], $tree->nodes[1]['badge']);
        self::assertNull($tree->nodes[2]['url'], 'an empty item is a label');
        self::assertSame('https://shop.test/wishlist/', $tree->nodes[2]['children'][0]['url']);
        self::assertSame('https://shop.test/about-us', $tree->nodes[3]['url']);
        self::assertSame(['hyperion_megamenu', 'hyperion_megamenu_g_7', 'cat_c_20', 'cat_c_21', 'cms_b_3', 'cms_p_5'], $tree->identities);
    }

    public function testStoreCustomerGroupDeviceAndLoginVisibility(): void
    {
        $this->loader->method('load')->willReturn([
            1 => $this->row(1, 0, 'custom', '/a', ['store_ids' => '2,3']),
            2 => $this->row(2, 0, 'custom', '/b', ['customer_group_ids' => '1']),
            3 => $this->row(3, 0, 'cms_block', 'promo'),
            4 => $this->row(4, 0, 'login', ''),
            5 => $this->row(5, 0, 'custom', '/e', ['is_active' => 0]),
            6 => $this->row(6, 0, 'custom', '/f'),
        ]);
        $this->resolver->method('resolve')->willReturn(new Targets([], [], [], ['promo' => '<b>x</b>'], []));
        $builder = $this->builder();

        $guestDesktop = $builder->build($this->group, 1, 0, SourceInterface::DEVICE_DESKTOP, false);
        self::assertSame(['i3', 'i4', 'i6'], array_column($guestDesktop->nodes, 'id'));

        $memberMobile = $builder->build($this->group, 2, 1, SourceInterface::DEVICE_MOBILE, true);
        self::assertSame(['i1', 'i2', 'i6'], array_column($memberMobile->nodes, 'id'), 'store 2, group 1, no block on mobile, no login when logged in');
    }

    public function testLiveSubcategoriesFollowTheChildrenDepth(): void
    {
        $this->loader->method('load')->willReturn([
            1 => $this->row(1, 0, 'category', '20', ['children_depth' => 1]),
            2 => $this->row(2, 1, 'custom', '/manual'),
        ]);
        $this->resolver->method('resolve')->willReturn(new Targets([
            20 => $this->category(20, 'Women', '/women.html', 2, 1, [21, 22]),
            21 => $this->category(21, 'Tops', '/tops.html', 3, 20, [23]),
            22 => $this->category(22, 'Bottoms', '/bottoms.html', 3, 20),
            23 => $this->category(23, 'Jackets', '/jackets.html', 4, 21),
        ]));
        $tree = $this->builder()->build($this->group, 1, 0, SourceInterface::DEVICE_DESKTOP);
        $children = $tree->nodes[0]['children'];

        self::assertSame(['i2', 'c21', 'c22'], array_column($children, 'id'), 'manual children first, then the live ones');
        self::assertSame([], $children[1]['children'], 'depth 1 stops before the grandchildren');
        self::assertSame(1, $children[1]['level']);
    }

    public function testLiveSubcategoriesAlreadyAddedByHandAreNotRepeated(): void
    {
        $this->loader->method('load')->willReturn([
            1 => $this->row(1, 0, 'category', '20', ['children_depth' => 2]),
            2 => $this->row(2, 1, 'category', '21', ['title' => 'Tops by hand', 'dropdown_width' => 6]),
            3 => $this->row(3, 2, 'category', '23', ['title' => 'Jackets by hand']),
        ]);
        $this->resolver->method('resolve')->willReturn(new Targets([
            20 => $this->category(20, 'Women', '/women.html', 2, 1, [21, 22]),
            21 => $this->category(21, 'Tops', '/tops.html', 3, 20, [23, 24]),
            22 => $this->category(22, 'Bottoms', '/bottoms.html', 3, 20),
            23 => $this->category(23, 'Jackets', '/jackets.html', 4, 21),
            24 => $this->category(24, 'Tees', '/tees.html', 4, 21),
        ]));
        $tree = $this->builder()->build($this->group, 1, 0, SourceInterface::DEVICE_DESKTOP);
        $children = $tree->nodes[0]['children'];

        self::assertSame(['i2', 'c22'], array_column($children, 'id'), 'the live Tops folds into the manual one');
        self::assertSame('Tops by hand', $children[0]['title']);
        self::assertSame(6, $children[0]['width'], 'the manual item keeps its settings');
        self::assertSame(['i3', 'c24'], array_column($children[0]['children'], 'id'), 'the live Jackets folds into the manual one, Tees is added');
        self::assertSame(2, $children[0]['children'][1]['level']);
    }

    public function testALoaderFailureYieldsAnEmptyTreeWithTheGroupTags(): void
    {
        $this->loader->method('load')->willThrowException(new \RuntimeException('db down'));
        $tree = $this->builder()->build($this->group, 1, 0, SourceInterface::DEVICE_DESKTOP);

        self::assertTrue($tree->isEmpty());
        self::assertSame(['hyperion_megamenu', 'hyperion_megamenu_g_7'], $tree->identities);
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    private function row(int $id, int $parentId, string $type, string $value, array $extra = []): array
    {
        return array_merge([
            'item_id' => $id, 'group_id' => 7, 'parent_id' => $parentId, 'level' => 0, 'item_type' => $type,
            'url_target' => '_self', 'dropdown_width' => 0, 'is_container' => 1, 'custom_class' => '', 'nofollow' => 0,
            'customer_group_ids' => null, 'store_ids' => null, 'children_depth' => 0, 'title' => 'Item ' . $id,
            'badge_text' => null, 'badge_color' => null, 'item_target_value' => $value, 'is_active' => 1, 'position' => $id,
        ], $extra);
    }

    /**
     * @param int[] $children
     * @return array{id: int, name: string, url: string, level: int, parent_id: int, children: int[]}
     */
    private function category(int $id, string $name, string $url, int $level, int $parentId, array $children = []): array
    {
        return ['id' => $id, 'name' => $name, 'url' => $url, 'level' => $level, 'parent_id' => $parentId, 'children' => $children];
    }

    private function builder(): TreeBuilder
    {
        $url = $this->createStub(UrlInterface::class);
        $url->method('getUrl')->willReturnCallback(static fn (string $route): string => 'https://shop.test/' . $route . '/');
        $store = $this->createStub(Store::class);
        $store->method('getBaseUrl')->willReturn('https://shop.test/');
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        return new TreeBuilder($this->loader, $this->resolver, $url, $storeManager, $this->createStub(LoggerInterface::class));
    }
}

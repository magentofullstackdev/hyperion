<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Test\Unit\Model\Admin;

use Magento\Framework\Exception\LocalizedException;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\ItemSaver;
use Magentofullstackdev\HyperionMegaMenu\Model\Cache\Flusher;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionMegaMenu\Model\ItemFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item as ItemResource;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\ItemStore;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionMegaMenu\Model\Admin\ItemSaver
 */
class ItemSaverTest extends TestCase
{
    private const GROUP_ID = 5;

    /** @var array<int, array<string, mixed>> the stored items, keyed by id */
    private array $rows = [];

    /** @var array<int, array<string, mixed>> the data of every item handed to the item resource */
    private array $savedItems = [];

    /** @var array<int, array{0: int, 1: int, 2: array<string, mixed>}> every ItemStore::saveValues() call */
    private array $storeWrites = [];

    public function testANewItemInAStoreViewIsSavedOnceAsAnItemOfThatStoreView(): void
    {
        $item = $this->saver()->save(
            ['item_id' => 0, 'group_id' => self::GROUP_ID, 'title' => 'Outlet', 'item_type' => 'custom', 'target_custom' => '/outlet'],
            2
        );

        self::assertCount(1, $this->savedItems, 'one write through the item resource');
        self::assertSame([2], $this->savedItems[0]['store_ids']);
        self::assertSame('/outlet', $this->savedItems[0]['item_target_value']);
        self::assertSame([2], $item->getStoreIds());
        self::assertSame([], $this->storeWrites, 'no store value row for an item the store view owns');
    }

    public function testAStoreViewOverridesTheTargetOfASharedItemWhenUseDefaultIsNotPosted(): void
    {
        $this->rows[9] = $this->row(['item_target_value' => '/default']);

        $this->saver()->save(
            [
                'item_id' => 9,
                'group_id' => self::GROUP_ID,
                'target_custom' => '/store-two',
                'use_default' => ['title' => '1', 'badge_text' => '1', 'badge_color' => '1', 'is_active' => '1'],
            ],
            2
        );

        self::assertSame([], $this->savedItems, 'the shared item itself is not written from a store view');
        self::assertCount(1, $this->storeWrites);
        [$itemId, $storeId, $values] = $this->storeWrites[0];
        self::assertSame(9, $itemId);
        self::assertSame(2, $storeId);
        self::assertSame('/store-two', $values['item_target_value']);
        self::assertNull($values['title']);
        self::assertNull($values['is_active']);
    }

    public function testAStoreViewFallsBackToTheDefaultTargetWhenUseDefaultIsPosted(): void
    {
        $this->rows[9] = $this->row(['item_target_value' => '/default']);

        $this->saver()->save(
            [
                'item_id' => 9,
                'group_id' => self::GROUP_ID,
                'title' => 'Saldi',
                'use_default' => ['item_target_value' => '1'],
            ],
            2
        );

        self::assertCount(1, $this->storeWrites);
        $values = $this->storeWrites[0][2];
        self::assertNull($values['item_target_value']);
        self::assertSame('Saldi', $values['title']);
    }

    public function testAnItemFormPostWithoutCustomerGroupsClearsTheRestriction(): void
    {
        $this->rows[9] = $this->row(['customer_group_ids' => '1,2', 'store_ids' => '3,4']);

        $this->saver()->save(
            ['item_id' => 9, 'group_id' => self::GROUP_ID, 'title' => 'Sale', 'item_type' => 'custom', 'store_ids' => ['3', '4']],
            0
        );

        self::assertCount(1, $this->savedItems);
        self::assertSame([], $this->savedItems[0]['customer_group_ids']);
        self::assertSame(['3', '4'], $this->savedItems[0]['store_ids']);
    }

    public function testADefaultScopePostWithoutStoreViewsClearsTheStoreRestriction(): void
    {
        $this->rows[9] = $this->row(['store_ids' => '3,4']);

        $this->saver()->save(
            ['item_id' => 9, 'group_id' => self::GROUP_ID, 'title' => 'Sale', 'item_type' => 'custom'],
            0
        );

        self::assertCount(1, $this->savedItems);
        self::assertSame([], $this->savedItems[0]['store_ids']);
    }

    public function testAStoreViewSaveOfItsOwnItemKeepsTheOwnership(): void
    {
        $this->rows[9] = $this->row(['store_ids' => '2', 'customer_group_ids' => '1']);

        $this->saver()->save(
            ['item_id' => 9, 'group_id' => self::GROUP_ID, 'title' => 'Outlet', 'item_type' => 'custom'],
            2
        );

        self::assertCount(1, $this->savedItems);
        self::assertSame([2], $this->savedItems[0]['store_ids']);
        self::assertSame([], $this->savedItems[0]['customer_group_ids']);
        self::assertSame([], $this->storeWrites);
    }

    public function testAPostWithoutTheTitleLeavesTheRestrictionsAlone(): void
    {
        $this->rows[9] = $this->row(['store_ids' => '3,4', 'customer_group_ids' => '1,2']);

        $this->saver()->save(['item_id' => 9, 'group_id' => self::GROUP_ID, 'badge_text' => 'NEW'], 0);

        self::assertCount(1, $this->savedItems);
        self::assertSame('3,4', $this->savedItems[0]['store_ids']);
        self::assertSame('1,2', $this->savedItems[0]['customer_group_ids']);
    }

    public function testAnItemOfAnotherMenuIsRefused(): void
    {
        $this->rows[9] = $this->row(['group_id' => 6]);
        $saver = $this->saver();

        try {
            $saver->save(['item_id' => 9, 'group_id' => self::GROUP_ID, 'title' => 'Hijacked', 'item_type' => 'custom'], 0);
            self::fail('The save of an item of another menu must throw.');
        } catch (LocalizedException $e) {
            self::assertSame('The item does not belong to this menu.', $e->getMessage());
        }

        self::assertSame([], $this->savedItems);
        self::assertSame([], $this->storeWrites);
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function row(array $overrides = []): array
    {
        return $overrides + [
            'group_id' => self::GROUP_ID,
            'parent_id' => 0,
            'level' => 0,
            'position' => 0,
            'title' => 'Sale',
            'is_active' => 1,
            'item_type' => 'custom',
            'item_target_value' => '/sale',
            'customer_group_ids' => null,
            'store_ids' => null,
        ];
    }

    private function saver(): ItemSaver
    {
        $factory = $this->createStub(ItemFactory::class);
        $factory->method('create')->willReturnCallback(static fn (): Item => new class extends Item {
            public function __construct()
            {
            }
        });

        $resource = $this->createStub(ItemResource::class);
        $resource->method('load')->willReturnCallback(function (Item $item, $id) use ($resource) {
            if (isset($this->rows[(int) $id])) {
                $item->setData($this->rows[(int) $id] + ['id' => (int) $id]);
            }

            return $resource;
        });
        $resource->method('getNextPosition')->willReturn(0);
        $resource->method('save')->willReturnCallback(function (Item $item) use ($resource) {
            $this->savedItems[] = $item->getData();

            return $resource;
        });

        $itemStore = $this->createStub(ItemStore::class);
        $itemStore->method('saveValues')->willReturnCallback(function (int $itemId, int $storeId, array $values): void {
            $this->storeWrites[] = [$itemId, $storeId, $values];
        });

        return new ItemSaver($factory, $resource, $itemStore, $this->createStub(Flusher::class));
    }
}

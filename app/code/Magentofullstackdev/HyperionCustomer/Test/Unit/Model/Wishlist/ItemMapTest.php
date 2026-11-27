<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Test\Unit\Model\Wishlist;

use Magento\Catalog\Model\Indexer\Category\Product\TableMaintainer;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Framework\DB\Adapter\AdapterInterface;
use Magento\Framework\DB\Select;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Wishlist\Model\ResourceModel\Item as ItemResource;
use Magentofullstackdev\HyperionCustomer\Model\Wishlist\ItemMap;
use PHPUnit\Framework\TestCase;

class ItemMapTest extends TestCase
{
    /** @var array<int, array<int, mixed>> */
    private array $whereCalls = [];

    public function testMapsProductIdsToItemIdsAsIntegers(): void
    {
        $connection = $this->connection(['14' => '7', '22' => '31']);
        $itemMap = $this->itemMap($connection);

        $map = $itemMap->get(5, [1, '2']);

        $this->assertSame([14 => 7, 22 => 31], $map);
        $this->assertSame(
            [['item.wishlist_id = ?', 5], ['item.store_id IN (?)', [1, 2]]],
            $this->whereCalls
        );
    }

    public function testEmptyWishlistGivesAnEmptyObjectShape(): void
    {
        $itemMap = $this->itemMap($this->connection([]));

        $this->assertSame([], $itemMap->get(5, [1]));
    }

    public function testNoQueryWithoutWishlistOrStores(): void
    {
        $connection = $this->createMock(AdapterInterface::class);
        $connection->expects($this->never())->method('select');
        $itemMap = $this->itemMap($connection);

        $this->assertSame([], $itemMap->get(0, [1]));
        $this->assertSame([], $itemMap->get(5, []));
    }

    /**
     * @param array<int|string, string> $rows
     */
    private function connection(array $rows): AdapterInterface
    {
        $select = $this->createStub(Select::class);
        $select->method('from')->willReturnSelf();
        $select->method('join')->willReturnSelf();
        $select->method('order')->willReturnSelf();
        $select->method('where')->willReturnCallback(function (...$args) use ($select) {
            $this->whereCalls[] = array_slice($args, 0, 2);
            return $select;
        });

        $connection = $this->createStub(AdapterInterface::class);
        $connection->method('select')->willReturn($select);
        $connection->method('quoteInto')->willReturn('1 = 1');
        $connection->method('fetchPairs')->willReturn($rows);
        return $connection;
    }

    private function itemMap(AdapterInterface $connection): ItemMap
    {
        $resource = $this->createStub(ItemResource::class);
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getMainTable')->willReturn('wishlist_item');

        $tableMaintainer = $this->createStub(TableMaintainer::class);
        $tableMaintainer->method('getMainTable')->willReturn('catalog_category_product_index_store1');

        $visibility = $this->createStub(Visibility::class);
        $visibility->method('getVisibleInSiteIds')->willReturn([2, 4]);

        $store = $this->createStub(Store::class);
        $store->method('getId')->willReturn(1);
        $store->method('getRootCategoryId')->willReturn(2);

        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        return new ItemMap($resource, $tableMaintainer, $visibility, $storeManager);
    }
}

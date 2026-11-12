<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Test\Unit\Setup\Patch\Data;

use Magento\Cms\Api\BlockRepositoryInterface;
use Magento\Cms\Model\Block;
use Magento\Cms\Model\BlockFactory;
use Magento\Cms\Model\ResourceModel\Block\Collection;
use Magento\Cms\Model\ResourceModel\Block\CollectionFactory;
use Magentofullstackdev\HyperionSampleData\Setup\Patch\Data\CreateFooterAboutBlock;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class CreateFooterAboutBlockTest extends TestCase
{
    private function collectionFactory(int $existing): CollectionFactory
    {
        $collection = $this->createStub(Collection::class);
        $collection->method('addFieldToFilter')->willReturnSelf();
        $collection->method('getSize')->willReturn($existing);
        $factory = $this->createStub(CollectionFactory::class);
        $factory->method('create')->willReturn($collection);

        return $factory;
    }

    public function testTheBlockIsCreatedForEveryStoreViewWithTheTranslatableSentence(): void
    {
        $saved = null;
        $block = $this->createStub(Block::class);
        $block->method('setData')->willReturnCallback(static function ($data) use (&$saved, $block) {
            $saved = $data;
            return $block;
        });
        $blockFactory = $this->createStub(BlockFactory::class);
        $blockFactory->method('create')->willReturn($block);
        $repository = $this->createMock(BlockRepositoryInterface::class);
        $repository->expects(self::once())->method('save')->with($block);

        (new CreateFooterAboutBlock(
            $this->collectionFactory(0),
            $blockFactory,
            $repository,
            $this->createStub(LoggerInterface::class)
        ))->apply();

        self::assertSame('hyperion-footer-about', $saved['identifier']);
        self::assertSame([0], $saved['stores']);
        self::assertSame(1, $saved['is_active']);
        self::assertSame(
            '<p>{{trans "Stateless, edge-cacheable commerce -- built for speed on Magento."}}</p>',
            $saved['content']
        );
    }

    public function testAnExistingBlockIsLeftAsItIs(): void
    {
        $repository = $this->createMock(BlockRepositoryInterface::class);
        $repository->expects(self::never())->method('save');

        (new CreateFooterAboutBlock(
            $this->collectionFactory(1),
            $this->createStub(BlockFactory::class),
            $repository,
            $this->createStub(LoggerInterface::class)
        ))->apply();
    }

    public function testAFailureIsLoggedAndDoesNotStopTheSetup(): void
    {
        $factory = $this->createStub(CollectionFactory::class);
        $factory->method('create')->willThrowException(new \RuntimeException('no table'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $patch = new CreateFooterAboutBlock(
            $factory,
            $this->createStub(BlockFactory::class),
            $this->createStub(BlockRepositoryInterface::class),
            $logger
        );

        self::assertSame($patch, $patch->apply());
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Test\Unit\Model;

use Magento\Framework\DB\Adapter\AdapterInterface;
use Magento\Framework\DB\Select;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\Setup\ModuleDataSetupInterface;
use Magentofullstackdev\HyperionSampleData\Model\WidgetThemeRebinder;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSampleData\Model\WidgetThemeRebinder
 */
class WidgetThemeRebinderTest extends TestCase
{
    private const LUMA_ID = 3;
    private const HYPERION_ID = 4;

    /** @var array<int, array{0: string, 1: array<string, mixed>, 2: array<string, mixed>}> every update() call */
    private array $updates = [];

    /** @var array<int, array{0: string, 1: mixed}> every where() condition of the selects */
    private array $conditions = [];

    private int $queries = 0;

    public function testNothingIsReadOrWrittenWithoutTheWidgetSampleDataModule(): void
    {
        $result = $this->rebinder(false)->rebind($this->dataSetup([11 => 'Home Page'], [21]));

        self::assertSame(['widget_instance' => 0, 'layout_link' => 0], $result);
        self::assertSame(0, $this->queries);
        self::assertSame([], $this->updates);
    }

    public function testOnlyTheSampleWidgetsAndTheirLayoutLinksMoveToHyperion(): void
    {
        $result = $this->rebinder(true)->rebind($this->dataSetup([11 => 'Home Page', 12 => 'Login Info'], ['21', '22', '21']));

        self::assertSame(['widget_instance' => 2, 'layout_link' => 2], $result);
        self::assertSame([
            [
                'widget_instance',
                ['theme_id' => self::HYPERION_ID],
                ['theme_id = ?' => self::LUMA_ID, 'instance_id IN (?)' => [11, 12]],
            ],
            [
                'layout_link',
                ['theme_id' => self::HYPERION_ID],
                ['theme_id = ?' => self::LUMA_ID, 'layout_update_id IN (?)' => [21, 22]],
            ],
        ], $this->updates);
        self::assertContains(['title IN (?)', WidgetThemeRebinder::SAMPLE_WIDGET_TITLES], $this->conditions);
        self::assertContains(['instance_type = ?', 'Magento\Cms\Block\Widget\Block'], $this->conditions);
        self::assertContains(['wip.instance_id IN (?)', [11, 12]], $this->conditions);
    }

    public function testAStoreWithoutSampleWidgetsOnLumaIsNotWritten(): void
    {
        $result = $this->rebinder(true)->rebind($this->dataSetup([], []));

        self::assertSame(['widget_instance' => 0, 'layout_link' => 0], $result);
        self::assertSame([], $this->updates);
    }

    public function testTheFixtureTitlesAreComplete(): void
    {
        self::assertCount(17, WidgetThemeRebinder::SAMPLE_WIDGET_TITLES);
        self::assertSame(
            WidgetThemeRebinder::SAMPLE_WIDGET_TITLES,
            array_values(array_unique(WidgetThemeRebinder::SAMPLE_WIDGET_TITLES))
        );
    }

    private function rebinder(bool $sampleDataEnabled): WidgetThemeRebinder
    {
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')
            ->willReturnMap([['Magento_WidgetSampleData', $sampleDataEnabled]]);

        return new WidgetThemeRebinder($this->createStub(LoggerInterface::class), $moduleManager);
    }

    /**
     * @param array<int, string> $sampleInstances title by instance id, as the instance query answers
     * @param array<int, int|string> $layoutUpdateIds as the layout update query answers
     */
    private function dataSetup(array $sampleInstances, array $layoutUpdateIds): ModuleDataSetupInterface
    {
        $select = $this->createStub(Select::class);
        $select->method('from')->willReturnSelf();
        $select->method('join')->willReturnSelf();
        $select->method('limit')->willReturnSelf();
        $select->method('where')->willReturnCallback(function ($condition, $value = null) use ($select) {
            $this->conditions[] = [$condition, $value];

            return $select;
        });

        $connection = $this->createStub(AdapterInterface::class);
        $connection->method('isTableExists')->willReturn(true);
        $connection->method('select')->willReturnCallback(function () use ($select) {
            $this->queries++;

            return $select;
        });
        $connection->method('fetchOne')
            ->willReturnOnConsecutiveCalls((string) self::LUMA_ID, (string) self::HYPERION_ID);
        $connection->method('fetchPairs')->willReturn($sampleInstances);
        $connection->method('fetchCol')->willReturn($layoutUpdateIds);
        $connection->method('update')->willReturnCallback(function ($table, array $bind, $where): int {
            $this->updates[] = [$table, $bind, $where];

            return 2;
        });

        $setup = $this->createStub(ModuleDataSetupInterface::class);
        $setup->method('getConnection')->willReturn($connection);
        $setup->method('getTable')->willReturnArgument(0);

        return $setup;
    }
}

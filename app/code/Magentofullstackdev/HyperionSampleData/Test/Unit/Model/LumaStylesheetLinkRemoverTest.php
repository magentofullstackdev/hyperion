<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Test\Unit\Model;

use Magento\Framework\App\Config\Storage\WriterInterface;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\DB\Adapter\AdapterInterface;
use Magento\Framework\DB\Select;
use Magento\Framework\View\Design\Theme\ThemeProviderInterface;
use Magento\Framework\View\Design\ThemeInterface;
use Magento\Framework\View\DesignInterface;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionSampleData\Model\LumaStylesheetLinkRemover;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class LumaStylesheetLinkRemoverTest extends TestCase
{
    private const LUMA_LINK = '<link  rel="stylesheet" type="text/css"  media="all" href="{{MEDIA_URL}}styles.css" />';
    private const SCRIPT = '<script type="text/javascript">window.x=1</script>';

    private const THEME_LUMA = 3;
    private const THEME_HYPERION = 4;
    private const THEME_HYPERION_CHILD = 5;
    private const THEME_BROKEN = 9;

    /** @var array<int, array{0: string, 1: string, 2: string, 3: int}> every config write */
    private array $saved = [];

    public function testTheLinkIsRemovedInPlaceWhenEveryStoreViewRunsHyperion(): void
    {
        $remover = $this->remover(
            [
                ['scope' => 'default', 'scope_id' => '0', 'value' => self::LUMA_LINK],
                ['scope' => 'stores', 'scope_id' => '2', 'value' => self::SCRIPT . "\n" . self::LUMA_LINK],
                ['scope' => 'websites', 'scope_id' => '1', 'value' => '<meta name="robots" content="index">'],
            ],
            [1 => [1, self::THEME_HYPERION], 2 => [1, self::THEME_HYPERION_CHILD]]
        );

        self::assertSame(2, $remover->remove());
        self::assertSame([
            ['design/head/includes', '', 'default', 0],
            ['design/head/includes', self::SCRIPT, 'stores', 2],
        ], $this->saved, 'the link goes, the other includes of the scope stay');
    }

    public function testNothingIsWrittenWhenNoRowCarriesTheLink(): void
    {
        $remover = $this->remover(
            [['scope' => 'default', 'scope_id' => '0', 'value' => '']],
            [1 => [1, self::THEME_HYPERION]]
        );

        self::assertSame(0, $remover->remove());
        self::assertSame([], $this->saved);
    }

    public function testALumaStoreViewKeepsItsOwnRow(): void
    {
        $remover = $this->remover(
            [
                ['scope' => 'stores', 'scope_id' => '1', 'value' => self::LUMA_LINK],
                ['scope' => 'stores', 'scope_id' => '2', 'value' => self::LUMA_LINK],
            ],
            [1 => [1, self::THEME_LUMA], 2 => [1, self::THEME_HYPERION]]
        );

        self::assertSame(1, $remover->remove());
        self::assertSame([['design/head/includes', '', 'stores', 2]], $this->saved);
    }

    public function testADefaultRowSharedWithALumaStoreViewStaysAndTheHyperionStoreViewsGetTheCleanedValue(): void
    {
        $remover = $this->remover(
            [['scope' => 'default', 'scope_id' => '0', 'value' => self::SCRIPT . self::LUMA_LINK]],
            [1 => [1, self::THEME_LUMA], 2 => [1, self::THEME_HYPERION], 3 => [2, self::THEME_HYPERION_CHILD]]
        );

        self::assertSame(2, $remover->remove());
        self::assertSame([
            ['design/head/includes', self::SCRIPT, 'stores', 2],
            ['design/head/includes', self::SCRIPT, 'stores', 3],
        ], $this->saved, 'the default row still serves the Luma store view');
    }

    public function testAWebsiteRowIsRewrittenOnlyWhenTheWholeWebsiteRunsHyperion(): void
    {
        $remover = $this->remover(
            [
                ['scope' => 'websites', 'scope_id' => '1', 'value' => self::LUMA_LINK],
                ['scope' => 'websites', 'scope_id' => '2', 'value' => self::LUMA_LINK],
            ],
            [1 => [1, self::THEME_LUMA], 2 => [1, self::THEME_HYPERION], 3 => [2, self::THEME_HYPERION]]
        );

        self::assertSame(2, $remover->remove());
        self::assertSame([
            ['design/head/includes', '', 'websites', 2],
            ['design/head/includes', '', 'stores', 2],
        ], $this->saved);
    }

    public function testAStoreViewWithItsOwnValueIsNotGivenTheInheritedOne(): void
    {
        $remover = $this->remover(
            [
                ['scope' => 'default', 'scope_id' => '0', 'value' => self::LUMA_LINK],
                ['scope' => 'stores', 'scope_id' => '2', 'value' => self::SCRIPT],
            ],
            [1 => [1, self::THEME_LUMA], 2 => [1, self::THEME_HYPERION]]
        );

        self::assertSame(0, $remover->remove());
        self::assertSame([], $this->saved);
    }

    public function testAStoreViewWhoseThemeCannotBeResolvedCountsAsNotHyperion(): void
    {
        $remover = $this->remover(
            [['scope' => 'default', 'scope_id' => '0', 'value' => self::LUMA_LINK]],
            [1 => [1, self::THEME_BROKEN], 2 => [1, self::THEME_HYPERION]]
        );

        self::assertSame(1, $remover->remove());
        self::assertSame([['design/head/includes', '', 'stores', 2]], $this->saved);
    }

    /**
     * @param array<int, array<string, mixed>> $rows the design/head/includes rows
     * @param array<int, array{0: int, 1: int}> $stores website id and theme id by store view id
     */
    private function remover(array $rows, array $stores): LumaStylesheetLinkRemover
    {
        $select = $this->createStub(Select::class);
        $select->method('from')->willReturnSelf();
        $select->method('where')->willReturnSelf();
        $connection = $this->createStub(AdapterInterface::class);
        $connection->method('select')->willReturn($select);
        $connection->method('fetchAll')->willReturn($rows);
        $resource = $this->createStub(ResourceConnection::class);
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getTableName')->willReturn('core_config_data');

        $writer = $this->createStub(WriterInterface::class);
        $writer->method('save')->willReturnCallback(function ($path, $value, $scope, $scopeId): void {
            $this->saved[] = [$path, $value, $scope, $scopeId];
        });

        $storeModels = [];
        foreach ($stores as $storeId => [$websiteId]) {
            $store = $this->createStub(StoreInterface::class);
            $store->method('getId')->willReturn($storeId);
            $store->method('getWebsiteId')->willReturn($websiteId);
            $storeModels[] = $store;
        }
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStores')->willReturn($storeModels);

        $design = $this->createStub(DesignInterface::class);
        $design->method('getConfigurationDesignTheme')->willReturnCallback(
            static fn ($area, array $params): string => (string) $stores[$params['store']][1]
        );

        $luma = $this->theme('Magento/luma', null);
        $hyperion = $this->theme('Magentofullstackdev/hyperion', null);
        $child = $this->theme('Acme/storefront', $hyperion);
        $themeProvider = $this->createStub(ThemeProviderInterface::class);
        $themeProvider->method('getThemeById')->willReturnCallback(
            static fn ($themeId): ThemeInterface => match ((int) $themeId) {
                self::THEME_LUMA => $luma,
                self::THEME_HYPERION => $hyperion,
                self::THEME_HYPERION_CHILD => $child,
                default => throw new \RuntimeException('Unknown theme.'),
            }
        );

        return new LumaStylesheetLinkRemover(
            $resource,
            $writer,
            $storeManager,
            $design,
            $themeProvider,
            $this->createStub(LoggerInterface::class)
        );
    }

    private function theme(string $path, ?ThemeInterface $parent): ThemeInterface
    {
        $theme = $this->createStub(ThemeInterface::class);
        $theme->method('getThemePath')->willReturn($path);
        $theme->method('getParentTheme')->willReturn($parent);

        return $theme;
    }
}

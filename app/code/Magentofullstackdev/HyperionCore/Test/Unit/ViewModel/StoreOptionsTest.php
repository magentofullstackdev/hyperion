<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\ViewModel;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magentofullstackdev\HyperionCore\ViewModel\StoreOptions;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\ViewModel\StoreOptions
 */
class StoreOptionsTest extends TestCase
{
    /**
     * @return array<string, array{bool, bool, bool}>
     */
    public static function wishlistProvider(): array
    {
        return [
            'module on, setting on' => [true, true, true],
            'module on, setting off' => [true, false, false],
            'module off, setting on' => [false, true, false],
        ];
    }

    #[DataProvider('wishlistProvider')]
    public function testTheWishlistIsEnabledOnlyWithTheModuleAndItsSettingOn(
        bool $moduleEnabled,
        bool $settingOn,
        bool $expected
    ): void {
        $options = $this->options(['wishlist/general/active' => $settingOn], $moduleEnabled);

        self::assertSame($expected, $options->isWishlistEnabled());
    }

    /**
     * @return array<string, array{mixed, int}>
     */
    public static function maxQueryLengthProvider(): array
    {
        return [
            'core default' => ['128', 128],
            'nothing configured' => [null, 0],
            'not a number' => ['abc', 0],
            'empty' => ['', 0],
            'zero' => ['0', 0],
            'negative' => ['-5', 0],
        ];
    }

    #[DataProvider('maxQueryLengthProvider')]
    public function testTheMaximumQueryLengthComesFromTheCatalogSearchSetting(mixed $max, int $expected): void
    {
        $options = $this->options([], true, ['catalog/search/max_query_length' => $max]);

        self::assertSame($expected, $options->getSearchMaxQueryLength());
    }

    public function testTheLayerProductCountFollowsItsSetting(): void
    {
        $path = 'catalog/layered_navigation/display_product_count';
        self::assertTrue($this->options([$path => true])->isLayerProductCountDisplayed());
        self::assertFalse($this->options([$path => false])->isLayerProductCountDisplayed());
    }

    /**
     * @param array<string, bool> $flags
     * @param bool $wishlistModule
     * @param array<string, mixed> $values
     * @return StoreOptions
     */
    private function options(array $flags, bool $wishlistModule = true, array $values = []): StoreOptions
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(
            static fn (string $path): bool => $flags[$path] ?? false
        );
        $scopeConfig->method('getValue')->willReturnCallback(
            static fn (string $path): mixed => $values[$path] ?? null
        );
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturnCallback(
            static fn (string $module): bool => $module === 'Magento_Wishlist' && $wishlistModule
        );

        return new StoreOptions($scopeConfig, $moduleManager);
    }
}

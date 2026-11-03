<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model;

use Magento\Catalog\Model\Category;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magentofullstackdev\HyperionCatalog\Model\InfiniteScroll;
use PHPUnit\Framework\TestCase;

class InfiniteScrollTest extends TestCase
{
    /**
     * @param array<string, string|int|null> $config
     */
    private function subject(array $config): InfiniteScroll
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(static fn (string $path) => $config[$path] ?? null);

        return new InfiniteScroll($scopeConfig);
    }

    private function category(?string $value): Category
    {
        $category = $this->createStub(Category::class);
        $category->method('getCustomAttribute')->willReturn(null);
        $category->method('getData')->willReturn($value);

        return $category;
    }

    /**
     * @return array<string, array{string|null, string|null, string}>
     */
    public static function resolveProvider(): array
    {
        return [
            'config only, disabled by default' => [null, null, InfiniteScroll::MODE_DISABLED],
            'config button, no category' => ['button', null, InfiniteScroll::MODE_BUTTON],
            'category empty follows the config' => ['scroll', '', InfiniteScroll::MODE_SCROLL],
            'category disables a scroll config' => ['scroll', 'disabled', InfiniteScroll::MODE_DISABLED],
            'category enables under a disabled config' => ['disabled', 'button', InfiniteScroll::MODE_BUTTON],
            'category switches the type' => ['button', 'scroll', InfiniteScroll::MODE_SCROLL],
            'unknown category value follows the config' => ['button', 'bogus', InfiniteScroll::MODE_BUTTON],
            'unknown config value is disabled' => ['bogus', null, InfiniteScroll::MODE_DISABLED],
        ];
    }

    /**
     * @dataProvider resolveProvider
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('resolveProvider')]
    public function testResolve(?string $configMode, ?string $categoryValue, string $expected): void
    {
        $subject = $this->subject([InfiniteScroll::XML_PATH_MODE => $configMode]);
        $category = $categoryValue === null ? null : $this->category($categoryValue);

        self::assertSame($expected, $subject->resolve($category));
    }

    /**
     * @return array<string, array{string, int, int, bool}>
     */
    public static function automaticProvider(): array
    {
        return [
            'button mode never loads automatically' => [InfiniteScroll::MODE_BUTTON, 3, 1, false],
            'disabled mode never' => [InfiniteScroll::MODE_DISABLED, 0, 1, false],
            'no cap: every page' => [InfiniteScroll::MODE_SCROLL, 0, 40, true],
            'within the cap' => [InfiniteScroll::MODE_SCROLL, 3, 3, true],
            'past the cap the button takes over' => [InfiniteScroll::MODE_SCROLL, 3, 4, false],
        ];
    }

    /**
     * @dataProvider automaticProvider
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('automaticProvider')]
    public function testIsAutomaticLoadAllowed(string $mode, int $cap, int $currentPage, bool $expected): void
    {
        $subject = $this->subject([InfiniteScroll::XML_PATH_AUTO_PAGES => $cap]);

        self::assertSame($expected, $subject->isAutomaticLoadAllowed($mode, $currentPage));
    }

    public function testAutoPagesIsNeverNegative(): void
    {
        self::assertSame(0, $this->subject([InfiniteScroll::XML_PATH_AUTO_PAGES => -2])->getAutoPages());
        self::assertSame(3, $this->subject([InfiniteScroll::XML_PATH_AUTO_PAGES => '3'])->getAutoPages());
    }
}

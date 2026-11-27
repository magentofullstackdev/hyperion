<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model;

use Magentofullstackdev\HyperionCore\Model\PublicRouteRegistry;
use PHPUnit\Framework\TestCase;

/**
 * Public route prefixes match on a path segment boundary.
 *
 * @covers \Magentofullstackdev\HyperionCore\Model\PublicRouteRegistry
 */
class PublicRouteRegistryTest extends TestCase
{
    #[\PHPUnit\Framework\Attributes\DataProvider('paths')]
    public function testAPrefixMatchesOnASegmentBoundary(string $pathInfo, bool $expected): void
    {
        $registry = new PublicRouteRegistry([
            'category_filter' => '/hyperion/category/filter',
            'navigation' => '/hyperion/navigation/',
            'blank' => '',
            'not_a_string' => 42,
        ]);

        self::assertSame($expected, $registry->matches($pathInfo));
    }

    /**
     * @return array<string, array{0: string, 1: bool}>
     */
    public static function paths(): array
    {
        return [
            'the exact path' => ['/hyperion/category/filter', true],
            'the path with a trailing slash' => ['/hyperion/category/filter/', true],
            'the path with parameters' => ['/hyperion/category/filter/id/5', true],
            'a longer last segment' => ['/hyperion/category/filterx', false],
            'a longer last segment with parameters' => ['/hyperion/category/filterx/id/5', false],
            'a prefix ending with a slash' => ['/hyperion/navigation/menu', true],
            'a prefix ending with a slash, the bare segment' => ['/hyperion/navigationx/menu', false],
            'another route' => ['/checkout/cart', false],
            'an empty path' => ['', false],
            'a relative path' => ['hyperion/category/filter', false],
        ];
    }

    public function testThePathsListKeepsOnlyStrings(): void
    {
        self::assertSame(['/a', ''], (new PublicRouteRegistry(['a' => '/a', 'b' => '', 'c' => 3]))->getPaths());
    }
}

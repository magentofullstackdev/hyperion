<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalogMode\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magentofullstackdev\HyperionCatalogMode\Model\Config;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCatalogMode\Model\Config
 */
class ConfigTest extends TestCase
{
    /**
     * @return array<string, array{string|null, int[]}>
     */
    public static function allowedGroupsProvider(): array
    {
        return [
            'unset' => [null, []],
            'empty' => ['', []],
            'guests only' => ['0', [0]],
            'several with spaces and duplicates' => [' 1, 2 ,,2,3', [1, 2, 3]],
        ];
    }

    /**
     * @dataProvider allowedGroupsProvider
     * @param string|null $raw
     * @param int[] $expected
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('allowedGroupsProvider')]
    public function testAllowedGroupIdsAreParsedFromTheMultiselectValue(?string $raw, array $expected): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn($raw);

        self::assertSame($expected, (new Config($scopeConfig))->getAllowedGroupIds());
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Model\Config
 */
class ConfigTest extends TestCase
{
    /**
     * @return array<string, array{string|null, string|null}>
     */
    public static function fuzzinessProvider(): array
    {
        return [
            'auto' => ['auto', 'AUTO'],
            'upper case auto' => ['AUTO', 'AUTO'],
            'one edit' => ['1', '1'],
            'two edits' => ['2', '2'],
            'off' => ['off', null],
            'unset' => [null, null],
            'garbage' => ['3', null],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('fuzzinessProvider')]
    public function testFuzzinessMapsToTheEngineValue(?string $raw, ?string $expected): void
    {
        self::assertSame($expected, $this->config([Config::XML_PATH_FUZZINESS => $raw])->getFuzziness());
    }

    public function testListsAreSplitTrimmedAndDeduplicated(): void
    {
        $config = $this->config([
            Config::XML_PATH_PROMOTED_SKUS => " 24-MB01, 24-MB02 ;\n24-MB01 ",
            Config::XML_PATH_STOP_WORDS => "The for\nFOR, shop",
        ]);

        self::assertSame(['24-MB01', '24-MB02'], $config->getPromotedSkus());
        self::assertSame(['the', 'for', 'shop'], $config->getStopWords());
    }

    public function testWeightsFallBackToOneAndCountsToZero(): void
    {
        $config = $this->config([Config::XML_PATH_SKU_BOOST => '0', Config::XML_PATH_PROMOTED_BOOST => 'abc', Config::XML_PATH_SUGGEST_PRODUCTS => '-3']);

        self::assertSame(1.0, $config->getSkuBoost());
        self::assertSame(1.0, $config->getPromotedBoost());
        self::assertSame(0, $config->getSuggestProducts());
        self::assertSame(2.5, $this->config([Config::XML_PATH_SKU_BOOST => '2.5'])->getSkuBoost());
    }

    /**
     * @param array<string, string|null> $values
     */
    private function config(array $values): Config
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(static fn (string $path) => $values[$path] ?? null);

        return new Config($scopeConfig);
    }
}

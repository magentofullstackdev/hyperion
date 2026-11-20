<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Config\Source;

use Magentofullstackdev\HyperionCheckout\Model\Config\Source\RateFields;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Config\Source\RateFields
 */
class RateFieldsTest extends TestCase
{
    public function testOffersTheFiveFieldsWithStringValues(): void
    {
        $options = (new RateFields())->toOptionArray();

        self::assertSame(
            ['country_id', 'region', 'postcode', 'city', 'street'],
            array_column($options, 'value')
        );
        foreach ($options as $option) {
            self::assertNotSame('', (string)$option['label']);
        }
    }

    /**
     * @param string[] $expected
     */
    #[DataProvider('storedValues')]
    public function testResolvesAStoredValueToTheFixedFieldsPlusTheChosenOptionalOnes(
        ?string $stored,
        array $expected
    ): void {
        self::assertSame($expected, (new RateFields())->resolve($stored));
    }

    /**
     * @return array<string, array{?string, string[]}>
     */
    public static function storedValues(): array
    {
        $fixed = ['country_id', 'region', 'postcode'];
        return [
            'no value' => [null, $fixed],
            'empty' => ['', $fixed],
            'the default' => ['country_id,region,postcode', $fixed],
            'a fixed field deselected' => ['country_id', $fixed],
            'city added' => ['country_id,region,postcode,city', [...$fixed, 'city']],
            'only optional ones, any order, spaces' => [' street , city', [...$fixed, 'city', 'street']],
            'unknown names dropped' => ['postcode,telephone,street', [...$fixed, 'street']],
        ];
    }
}

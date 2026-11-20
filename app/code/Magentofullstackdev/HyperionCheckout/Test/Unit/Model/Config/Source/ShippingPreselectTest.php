<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Config\Source;

use Magentofullstackdev\HyperionCheckout\Model\Config\Source\ShippingPreselect;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Config\Source\ShippingPreselect
 */
class ShippingPreselectTest extends TestCase
{
    public function testOffersTheThreeModesWithStringValues(): void
    {
        $options = (new ShippingPreselect())->toOptionArray();

        self::assertSame(['cheapest', 'first', 'none'], array_column($options, 'value'));
        foreach ($options as $option) {
            self::assertNotSame('', (string)$option['label']);
        }
    }

    #[DataProvider('storedValues')]
    public function testResolvesAStoredValueToAKnownMode(?string $stored, string $expected): void
    {
        self::assertSame($expected, (new ShippingPreselect())->resolve($stored));
    }

    /**
     * @return array<string, array{?string, string}>
     */
    public static function storedValues(): array
    {
        return [
            'no value' => [null, 'cheapest'],
            'empty' => ['', 'cheapest'],
            'unknown' => ['fastest', 'cheapest'],
            'cheapest' => ['cheapest', 'cheapest'],
            'first' => ['first', 'first'],
            'none, with spaces' => [' none ', 'none'],
        ];
    }
}

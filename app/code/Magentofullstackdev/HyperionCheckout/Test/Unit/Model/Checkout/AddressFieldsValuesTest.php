<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Framework\Api\AttributeValue;
use Magento\Quote\Api\Data\AddressExtensionInterface;
use Magento\Quote\Model\Quote\Address;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\AddressFieldsValues;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionPool;
use Magentofullstackdev\HyperionCheckout\Test\Unit\Fixture\AddressExtrasAttributes;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\AddressFieldsValues
 */
class AddressFieldsValuesTest extends TestCase
{
    /**
     * @param array{custom_attributes: string[], extension_attributes: string[]} $codes
     */
    private function values(array $codes): AddressFieldsValues
    {
        $pool = $this->createStub(ExtensionPool::class);
        $pool->method('getAddressFieldCodes')->willReturn($codes);
        return new AddressFieldsValues($pool, $this->createStub(LoggerInterface::class));
    }

    public function testOnlyTheDeclaredCodesAreExportedInTheRestShape(): void
    {
        $fiscal = $this->createStub(AttributeValue::class);
        $fiscal->method('getValue')->willReturn('RSSMRA80A01H501U');
        $extension = $this->createStubForIntersectionOfInterfaces(
            [AddressExtensionInterface::class, AddressExtrasAttributes::class]
        );
        $extension->method('getSdiCode')->willReturn('ABC1234');
        $address = $this->createStub(Address::class);
        $address->method('getCustomAttribute')->willReturnMap([
            ['fiscal_code', $fiscal],
            ['pec', null],
        ]);
        $address->method('getData')->willReturn(null);
        $address->method('getExtensionAttributes')->willReturn($extension);

        $result = $this->values([
            'custom_attributes' => ['fiscal_code', 'pec'],
            'extension_attributes' => ['sdi_code', 'unknown_code'],
        ])->export($address);

        self::assertSame([
            'custom_attributes' => [['attribute_code' => 'fiscal_code', 'value' => 'RSSMRA80A01H501U']],
            'extension_attributes' => ['sdi_code' => 'ABC1234'],
        ], $result);
    }

    public function testNoDeclaredFieldExportsNothing(): void
    {
        $address = $this->createStub(Address::class);

        self::assertSame([], $this->values(['custom_attributes' => [], 'extension_attributes' => []])->export($address));
    }
}

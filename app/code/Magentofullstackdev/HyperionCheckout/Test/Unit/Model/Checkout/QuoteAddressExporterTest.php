<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Quote\Model\Quote\Address;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\QuoteAddressExporter;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\QuoteAddressExporter
 */
class QuoteAddressExporterTest extends TestCase
{
    private const DATA = [
        'firstname' => 'Jane',
        'lastname' => 'Doe',
        'company' => null,
        'city' => 'Austin',
        'region' => 'Texas',
        'region_code' => 'TX',
        'postcode' => 78701,
        'country_id' => 'US',
        'telephone' => '5125550100',
        'fax' => null,
        'vat_id' => null,
        'prefix' => null,
        'middlename' => null,
        'suffix' => null,
        'email' => 'jane@example.com',
        'customer_address_id' => 12,
    ];

    /**
     * @param array<string, mixed> $data
     * @param string[] $street
     */
    private function address(array $data, array $street, mixed $regionId): Address
    {
        $address = $this->createStub(Address::class);
        $address->method('getCountryId')->willReturn($data['country_id'] ?? null);
        $address->method('getRegionId')->willReturn($regionId);
        $address->method('getStreet')->willReturn($street);
        $address->method('getData')->willReturnCallback(static fn (string $key) => $data[$key] ?? null);
        return $address;
    }

    public function testExportsTheFormFieldsAsStringsWithTheStreetAsAList(): void
    {
        $exported = (new QuoteAddressExporter())->export(
            $this->address(self::DATA, ['100 Congress Avenue', '', 'Suite 4'], 57)
        );

        self::assertSame(
            [
                'firstname' => 'Jane',
                'lastname' => 'Doe',
                'company' => null,
                'city' => 'Austin',
                'region' => 'Texas',
                'region_code' => 'TX',
                'postcode' => '78701',
                'country_id' => 'US',
                'telephone' => '5125550100',
                'fax' => null,
                'vat_id' => null,
                'prefix' => null,
                'middlename' => null,
                'suffix' => null,
                'region_id' => '57',
                'street' => ['100 Congress Avenue', 'Suite 4'],
            ],
            $exported
        );
    }

    public function testAnAddressWithoutARegionIdExportsNull(): void
    {
        $exported = (new QuoteAddressExporter())->export($this->address(self::DATA, [], null));
        self::assertNull($exported['region_id']);
        self::assertSame([], $exported['street']);
    }

    #[DataProvider('blankCountries')]
    public function testAnAddressWithoutACountryIsNotExported(?string $country): void
    {
        $address = $this->address(['country_id' => $country] + self::DATA, ['1 Main Street'], 57);
        self::assertNull((new QuoteAddressExporter())->export($address));
    }

    /**
     * @return array<string, array{?string}>
     */
    public static function blankCountries(): array
    {
        return ['null' => [null], 'empty' => [''], 'blank' => ['  ']];
    }

    public function testNoAddressIsNotExported(): void
    {
        self::assertNull((new QuoteAddressExporter())->export(null));
    }

    public function testTwoExportsOfTheSameValuesAreTheSameWhateverTheWhiteSpace(): void
    {
        $exporter = new QuoteAddressExporter();
        $a = (array)$exporter->export($this->address(self::DATA, ['1 Main Street'], 57));
        $b = (array)$exporter->export($this->address(['city' => ' Austin '] + self::DATA, ['1 Main Street'], '57'));

        self::assertTrue($exporter->isSame($a, $b));
        self::assertTrue($exporter->isSame($a, $b + ['customer_address_id' => 3]));
    }

    /**
     * @param array<string, mixed> $change
     * @param string[] $street
     */
    #[DataProvider('differences')]
    public function testADifferentFieldStreetOrRegionMakesTwoExportsDiffer(
        array $change,
        array $street,
        int $regionId
    ): void {
        $exporter = new QuoteAddressExporter();
        $a = (array)$exporter->export($this->address(self::DATA, ['1 Main Street'], 57));
        $b = (array)$exporter->export($this->address($change + self::DATA, $street, $regionId));

        self::assertFalse($exporter->isSame($a, $b));
    }

    /**
     * @return array<string, array{array<string, mixed>, string[], int}>
     */
    public static function differences(): array
    {
        return [
            'city' => [['city' => 'Calder'], ['1 Main Street'], 57],
            'telephone' => [['telephone' => '1'], ['1 Main Street'], 57],
            'street' => [[], ['2 Main Street'], 57],
            'second street line' => [[], ['1 Main Street', 'Floor 2'], 57],
            'region id' => [[], ['1 Main Street'], 33],
        ];
    }
}

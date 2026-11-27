<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model;

/**
 * The fake carrier's pickup points: a fixed list, the one source of truth
 * for the search controller, the validation plugin and the value provider.
 */
class LockerPoints
{
    /**
     * @var array<string, array{id: string, name: string, street: string, city: string, postcode: string,
     *     region: string, region_code: string, region_id: int, country_id: string}>
     */
    private const POINTS = [
        'HL-001' => [
            'id' => 'HL-001',
            'name' => 'Congress Avenue Locker',
            'street' => '100 Congress Ave',
            'city' => 'Austin',
            'postcode' => '78701',
            'region' => 'Texas',
            'region_code' => 'TX',
            'region_id' => 57,
            'country_id' => 'US',
        ],
        'HL-002' => [
            'id' => 'HL-002',
            'name' => 'Main Street Locker',
            'street' => '901 Main St',
            'city' => 'Dallas',
            'postcode' => '75202',
            'region' => 'Texas',
            'region_code' => 'TX',
            'region_id' => 57,
            'country_id' => 'US',
        ],
        'HL-003' => [
            'id' => 'HL-003',
            'name' => 'Travis Street Locker',
            'street' => '1001 Travis St',
            'city' => 'Houston',
            'postcode' => '77002',
            'region' => 'Texas',
            'region_code' => 'TX',
            'region_id' => 57,
            'country_id' => 'US',
        ],
    ];

    /**
     * One point, null for an unknown id.
     *
     * @param string $id
     * @return array{id: string, name: string, street: string, city: string, postcode: string,
     *     region: string, region_code: string, region_id: int, country_id: string}|null
     */
    public function get(string $id): ?array
    {
        return self::POINTS[$id] ?? null;
    }

    /**
     * The points whose name, street, city or postcode contains the text; all of them for an empty text.
     *
     * @param string $query
     * @return array<int, array{id: string, name: string, street: string, city: string, postcode: string,
     *     region: string, region_code: string, region_id: int, country_id: string}>
     */
    public function search(string $query): array
    {
        $needle = mb_strtolower(trim($query));
        $found = [];
        foreach (self::POINTS as $point) {
            $haystack = mb_strtolower(implode(' ', [$point['name'], $point['street'], $point['city'], $point['postcode']]));
            if ($needle === '' || str_contains($haystack, $needle)) {
                $found[] = $point;
            }
        }

        return $found;
    }

    /**
     * The summary lines of a point, as the checkout prints them under the shipping row.
     *
     * @param array{name: string, street: string, city: string, region_code: string, postcode: string} $point
     * @return string[]
     */
    public function summaryLines(array $point): array
    {
        return [$point['name'], $point['street'], sprintf('%s, %s %s', $point['city'], $point['region_code'], $point['postcode'])];
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Quote\Model\Quote\Address;

/**
 * A quote address in the flat shape the checkout bundle hydrates from:
 * every scalar a string or null, `region_id` a string or null, `street` a
 * list of its non-empty lines. The bundle turns it into its own `Address`
 * (`frontend/packages/module-checkout/src/utils/checkout-config.ts`).
 */
class QuoteAddressExporter
{
    /**
     * The address fields the checkout form edits, next to `region_id` and `street`.
     */
    public const FIELDS = [
        'firstname',
        'lastname',
        'company',
        'city',
        'region',
        'region_code',
        'postcode',
        'country_id',
        'telephone',
        'fax',
        'vat_id',
        'prefix',
        'middlename',
        'suffix',
    ];

    /**
     * The fields of an address, null when it was never entered (no country).
     *
     * @return array<string, mixed>|null
     */
    public function export(?Address $address): ?array
    {
        if ($address === null || trim((string)$address->getCountryId()) === '') {
            return null;
        }
        $data = [];
        foreach (self::FIELDS as $field) {
            $value = $address->getData($field);
            $data[$field] = $value === null ? null : (string)$value;
        }
        $regionId = $address->getRegionId();
        $data['region_id'] = $regionId ? (string)$regionId : null;
        $data['street'] = array_values(array_filter(
            array_map('strval', (array)$address->getStreet()),
            static fn (string $line): bool => trim($line) !== ''
        ));
        return $data;
    }

    /**
     * True when two exported addresses hold the same values (surrounding
     * white space ignored). Keys other than the exported fields are not
     * compared.
     *
     * @param array<string, mixed> $a
     * @param array<string, mixed> $b
     */
    public function isSame(array $a, array $b): bool
    {
        foreach (array_merge(self::FIELDS, ['region_id', 'street']) as $field) {
            $left = $a[$field] ?? null;
            $right = $b[$field] ?? null;
            if (is_array($left) || is_array($right)) {
                if ((array)$left !== (array)$right) {
                    return false;
                }
                continue;
            }
            if (trim((string)$left) !== trim((string)$right)) {
                return false;
            }
        }
        return true;
    }
}

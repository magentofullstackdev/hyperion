<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Quote\Api\Data\AddressInterface;
use Psr\Log\LoggerInterface;

/**
 * The values of the declared address fields (`hyperion.addressFields`) a
 * quote address already holds, so a guest's reload shows what was typed.
 *
 * Only the declared codes are read: `custom_attributes` as
 * `{ attribute_code, value }` entries (the REST shape the checkout sends
 * back), `extension_attributes` as `code => value`. Empty bags are left out.
 */
class AddressFieldsValues
{
    /**
     * @param ExtensionPool $pool
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ExtensionPool $pool,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The `custom_attributes` / `extension_attributes` keys to add to an exported address.
     *
     * @param AddressInterface $address
     * @return array<string, mixed>
     */
    public function export(AddressInterface $address): array
    {
        try {
            $codes = $this->pool->getAddressFieldCodes();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: address field codes unavailable', ['exception' => $e]);
            return [];
        }
        $result = [];

        $custom = [];
        foreach ($codes[AddressFields::TARGET_CUSTOM] as $code) {
            $value = $this->customValue($address, $code);
            if ($value !== null) {
                $custom[] = ['attribute_code' => $code, 'value' => $value];
            }
        }
        if ($custom !== []) {
            $result['custom_attributes'] = $custom;
        }

        $extension = [];
        $attributes = $codes[AddressFields::TARGET_EXTENSION] !== [] ? $address->getExtensionAttributes() : null;
        if ($attributes !== null) {
            foreach ($codes[AddressFields::TARGET_EXTENSION] as $code) {
                $getter = 'get' . str_replace('_', '', ucwords($code, '_'));
                if (!method_exists($attributes, $getter)) {
                    continue;
                }
                $value = $attributes->$getter();
                if ($value !== null && $value !== '') {
                    $extension[$code] = $value;
                }
            }
        }
        if ($extension !== []) {
            $result['extension_attributes'] = $extension;
        }

        return $result;
    }

    /**
     * A custom attribute value, from the attribute object or the address data.
     *
     * @param AddressInterface $address
     * @param string $code
     * @return mixed
     */
    private function customValue(AddressInterface $address, string $code): mixed
    {
        $value = null;
        if (method_exists($address, 'getCustomAttribute')) {
            $value = $address->getCustomAttribute($code)?->getValue();
        }
        if (($value === null || $value === '') && method_exists($address, 'getData')) {
            $value = $address->getData($code);
        }
        return $value === '' || is_object($value) ? null : $value;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Plugin;

use Magento\Checkout\Model\CompositeConfigProvider;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;

/**
 * Keeps the address field of an installed but switched off module out of
 * the checkout: while hyperion_sample_extension/general/enabled is 0 it is
 * removed from checkoutConfig.hyperion.addressFields. The module's other
 * entries skip themselves through their options providers; this list
 * repeats them so the module stays inert whichever way the pool emits them.
 */
class CheckoutConfigPlugin
{
    /**
     * List key in checkoutConfig.hyperion => [key of the entry's name, this module's names].
     */
    private const ENTRIES = [
        'extensions' => ['name', ['hyperion_sample_checkout']],
        'shippingExtensions' => ['id', ['hyperion_sample_locker']],
        'addressFields' => ['code', ['hyperion_sample_tax_code']],
    ];

    /**
     * @param Config $config
     */
    public function __construct(
        private readonly Config $config
    ) {
    }

    /**
     * Drop the entries while the module is off.
     *
     * @param CompositeConfigProvider $subject
     * @param array<string, mixed> $result
     * @return array<string, mixed>
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGetConfig(CompositeConfigProvider $subject, array $result): array
    {
        if ($this->config->isEnabled() || !isset($result['hyperion']) || !is_array($result['hyperion'])) {
            return $result;
        }
        foreach (self::ENTRIES as $list => [$key, $names]) {
            if (!isset($result['hyperion'][$list]) || !is_array($result['hyperion'][$list])) {
                continue;
            }
            $result['hyperion'][$list] = array_values(array_filter(
                $result['hyperion'][$list],
                static fn ($entry): bool => !is_array($entry) || !in_array($entry[$key] ?? null, $names, true)
            ));
        }

        return $result;
    }
}

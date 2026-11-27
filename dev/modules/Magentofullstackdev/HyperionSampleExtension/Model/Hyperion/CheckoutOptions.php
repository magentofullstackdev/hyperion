<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Model\Hyperion;

use Magento\Quote\Api\Data\CartInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;

/**
 * Options of the generic checkout extension; skips the entry while the
 * module is switched off, so its required gate never blocks an order.
 */
class CheckoutOptions implements ExtensionOptionsProviderInterface
{
    /**
     * @param Config $config
     */
    public function __construct(
        private readonly Config $config
    ) {
    }

    /**
     * @inheritDoc
     *
     * @throws SkipExtensionException while the module is off
     */
    public function getOptions(CartInterface $quote): array
    {
        if (!$this->config->isEnabled($quote->getStoreId())) {
            throw new SkipExtensionException('The sample extension is switched off.');
        }

        return ['attribute' => 'hyperion_sample_confirmation', 'value' => 'confirmed'];
    }
}

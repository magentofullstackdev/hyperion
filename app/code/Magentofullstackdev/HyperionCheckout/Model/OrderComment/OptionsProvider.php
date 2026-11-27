<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\OrderComment;

use Magento\Quote\Api\Data\CartInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;

/**
 * Options of the order comment entry of the checkout extension pool: the
 * maximum length. The entry is left out while the feature is off.
 */
class OptionsProvider implements ExtensionOptionsProviderInterface
{
    /**
     * @param Config $config
     */
    public function __construct(private readonly Config $config)
    {
    }

    /**
     * @inheritdoc
     *
     * @throws SkipExtensionException while the order comment is off
     */
    public function getOptions(CartInterface $quote): array
    {
        $storeId = $quote->getStoreId();
        if (!$this->config->isEnabled($storeId)) {
            throw new SkipExtensionException('The order comment is off.');
        }
        return ['maxLength' => $this->config->getMaxLength($storeId)];
    }
}

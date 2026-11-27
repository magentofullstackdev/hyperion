<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCheckout\Model\ConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Shipping\ExtensionPool;
use Psr\Log\LoggerInterface;

/**
 * Emits `hyperion.shippingExtensions` (`ShippingExtensionConfig[]`): the
 * entries of `Model\Shipping\ExtensionPool` with the options and the value
 * their providers compute for the session quote, so a reload restores the
 * shopper's choice.
 *
 * An empty list when the Lit checkout is off, the quote is virtual (it has
 * no shipping step) or nothing is registered: then the checkout loads none
 * of the shipping extension code. `hyperion.staticOrigins` is added only
 * when a module URL is on the static origin of the store.
 */
class ShippingExtensionsConfigProvider implements ConfigProviderInterface
{
    /**
     * @param ExtensionPool $pool
     * @param CheckoutSession $checkoutSession
     * @param ScopeConfigInterface $scopeConfig
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ExtensionPool $pool,
        private readonly CheckoutSession $checkoutSession,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        $origins = [];
        $entries = $this->entries($origins);
        $hyperion = ['shippingExtensions' => $entries];
        if ($origins !== []) {
            $hyperion['staticOrigins'] = $origins;
        }
        return ['hyperion' => $hyperion];
    }

    /**
     * @param string[] $origins
     * @return array<int, array<string, mixed>>
     */
    private function entries(array &$origins): array
    {
        if (!$this->scopeConfig->isSetFlag(ConfigProvider::CONFIG_ENABLED, ScopeInterface::SCOPE_STORE)) {
            return [];
        }
        try {
            if (!$this->pool->hasEntries()) {
                return [];
            }
            $quote = $this->checkoutSession->getQuote();
            if ($quote->getIsVirtual()) {
                return [];
            }
            return $this->pool->build($quote, $origins);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: shipping extensions unavailable', ['exception' => $e]);
            $origins = [];
            return [];
        }
    }
}

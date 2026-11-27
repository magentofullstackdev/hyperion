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
use Psr\Log\LoggerInterface;

/**
 * Emits `hyperion.extensions` (`CheckoutExtensionConfig[]`) and
 * `hyperion.addressFields` (`AddressFieldConfig[]`) from
 * `Model\Checkout\ExtensionPool`.
 *
 * Both lists are empty when the Lit checkout is off or nothing is
 * registered; then the checkout loads none of the extension runtime.
 * `hyperion.staticOrigins` is added only when a module URL is on the static
 * origin of the store.
 */
class ExtensionsConfigProvider implements ConfigProviderInterface
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
        if (!$this->scopeConfig->isSetFlag(ConfigProvider::CONFIG_ENABLED, ScopeInterface::SCOPE_STORE)) {
            return ['hyperion' => ['extensions' => [], 'addressFields' => []]];
        }
        $origins = [];
        $hyperion = [
            'extensions' => $this->extensions($origins),
            'addressFields' => $this->addressFields(),
        ];
        if ($origins !== []) {
            $hyperion['staticOrigins'] = $origins;
        }
        return ['hyperion' => $hyperion];
    }

    /**
     * @param string[] $origins
     * @return array<int, array<string, mixed>>
     */
    private function extensions(array &$origins): array
    {
        try {
            if (!$this->pool->hasExtensions()) {
                return [];
            }
            return $this->pool->buildExtensions($this->checkoutSession->getQuote(), $origins);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: checkout extensions unavailable', ['exception' => $e]);
            $origins = [];
            return [];
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function addressFields(): array
    {
        try {
            return $this->pool->getAddressFields();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: address fields unavailable', ['exception' => $e]);
            return [];
        }
    }
}

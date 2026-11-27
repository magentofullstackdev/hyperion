<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magentofullstackdev\HyperionCheckout\Model\ConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Payment\RendererPool;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsMonitor;
use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\App\State;
use Magento\Payment\Api\PaymentMethodListInterface;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Emits the payment renderers of the checkout into `checkoutConfig.hyperion`:
 *
 * - `paymentRenderers`: the `RendererPool` entries that serve at least one
 *   payment method active on the store view (vault codes included), as
 *   `PaymentRendererConfig` objects (`extension-api.d.ts`), so the island
 *   carries nothing for a gateway the store does not use;
 * - `staticOrigins`: the static files origins those entries' modules are
 *   served from when that is not the store's own origin;
 * - `debug.showUnsupportedPayments`: true in developer mode or when the
 *   page was asked with `?hyperion_debug_payments=1` (the checkout page is
 *   never cached); the browser then lists the hidden methods as disabled
 *   diagnostic rows, and the server skeleton
 *   (`ViewModel\CheckoutSkeleton`) reads this same flag.
 *
 * `CompositeConfigProvider` merges the providers with
 * `array_merge_recursive()`: a scalar emitted by two providers would turn
 * into a list, a list emitted by two providers is concatenated. Every key
 * here is emitted by this provider only; `staticOrigins` is a list, so
 * another pool provider may contribute origins to it (the browser checks
 * membership, a repeated origin is harmless).
 *
 * Each render also lets `UnsupportedMethodsMonitor` refresh the stored
 * report of hidden methods (at most once per store view and hour). Nothing
 * is emitted while the Hyperion checkout is off for the store view.
 */
class PaymentRenderersConfigProvider implements ConfigProviderInterface
{
    /** Query parameter of the checkout page that shows the hidden methods as diagnostic rows. */
    public const DEBUG_PARAM = 'hyperion_debug_payments';

    /**
     * @param RendererPool $rendererPool
     * @param PaymentMethodListInterface $paymentMethodList
     * @param StoreManagerInterface $storeManager
     * @param CheckoutSession $checkoutSession
     * @param ScopeConfigInterface $scopeConfig
     * @param State $appState
     * @param UnsupportedMethodsMonitor $monitor
     * @param LoggerInterface $logger
     * @param RequestInterface $request
     */
    public function __construct(
        private readonly RendererPool $rendererPool,
        private readonly PaymentMethodListInterface $paymentMethodList,
        private readonly StoreManagerInterface $storeManager,
        private readonly CheckoutSession $checkoutSession,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly State $appState,
        private readonly UnsupportedMethodsMonitor $monitor,
        private readonly LoggerInterface $logger,
        private readonly RequestInterface $request
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
            return [];
        }

        $renderers = [];
        $origins = [];
        try {
            $store = $this->storeManager->getStore();
            $storeId = (int)$store->getId();
            $codes = [];
            foreach ($this->paymentMethodList->getActiveList($storeId) as $method) {
                $codes[] = (string)$method->getCode();
            }
            $config = $this->rendererPool->getRendererConfig($this->quote(), $codes);
            $renderers = $config['renderers'];
            $origins = $config['staticOrigins'];
            $this->checkUnsupported($storeId, (string)$store->getCode());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: the payment renderers cannot be emitted: ' . $e->getMessage());
        }

        return [
            'hyperion' => [
                'paymentRenderers' => $renderers,
                'staticOrigins' => $origins,
                'debug' => ['showUnsupportedPayments' => $this->showUnsupportedPayments()],
            ],
        ];
    }

    /**
     * @return CartInterface|null
     */
    private function quote(): ?CartInterface
    {
        try {
            return $this->checkoutSession->getQuote();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: no quote for the payment renderer options: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * @param int $storeId
     * @param string $storeCode
     * @return void
     */
    private function checkUnsupported(int $storeId, string $storeCode): void
    {
        try {
            $this->monitor->check($storeId, $storeCode);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: the hidden payment methods could not be checked: ' . $e->getMessage()
            );
        }
    }

    /**
     * Developer mode, or the diagnostic query parameter of the page.
     *
     * @return bool
     */
    private function showUnsupportedPayments(): bool
    {
        if ((string)$this->request->getParam(self::DEBUG_PARAM) === '1') {
            return true;
        }
        try {
            return $this->appState->getMode() === State::MODE_DEVELOPER;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: the application mode is unknown: ' . $e->getMessage());
            return false;
        }
    }
}

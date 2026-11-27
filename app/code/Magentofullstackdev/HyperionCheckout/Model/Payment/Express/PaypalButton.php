<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment\Express;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Model\Product;
use Magentofullstackdev\HyperionCheckout\Api\ExpressButtonProviderInterface;
use Magentofullstackdev\HyperionCheckout\ViewModel\PaypalExpress;

/**
 * Provider of the first-party `paypal_express` entry of the express button
 * pool: the PayPal Express Checkout smart buttons (`<hyperion-paypal-buttons>`)
 * on the product page, the cart and the mini-cart.
 *
 * Every rule stays in `ViewModel\PaypalExpress`, which reaches the optional
 * Magento_Paypal by class name only: availability is "module enabled and the
 * merchant shows the buttons in this placement", the options are the button
 * configuration the element reads, the reserved height is the one the smart
 * buttons render with that configuration. The product placement decides from
 * configuration and the product only (the page is cached).
 */
class PaypalButton implements ExpressButtonProviderInterface, ReservedHeightProviderInterface
{
    private const CONTEXTS = [
        'product' => PaypalExpress::CONTEXT_PRODUCT,
        'cart' => PaypalExpress::CONTEXT_CART,
        'minicart' => PaypalExpress::CONTEXT_MINICART,
    ];

    /**
     * @var array<string, array<string, mixed>> button configuration by placement and product
     */
    private array $configs = [];

    /**
     * @param PaypalExpress $paypalExpress
     */
    public function __construct(
        private readonly PaypalExpress $paypalExpress
    ) {
    }

    /**
     * @inheritDoc
     */
    public function isAvailable(string $placement, ?ProductInterface $product): bool
    {
        return $this->getConfig($placement, $product) !== [];
    }

    /**
     * @inheritDoc
     */
    public function getOptions(string $placement, ?ProductInterface $product): array
    {
        return $this->getConfig($placement, $product);
    }

    /**
     * @inheritDoc
     */
    public function getReservedHeight(string $placement, array $options): int
    {
        return $this->paypalExpress->getReservedHeight($options);
    }

    /**
     * The smart button configuration of a placement, [] when the buttons do not show there.
     *
     * @param string $placement
     * @param ProductInterface|null $product
     * @return array<string, mixed>
     */
    private function getConfig(string $placement, ?ProductInterface $product): array
    {
        $context = self::CONTEXTS[$placement] ?? null;
        if ($context === null) {
            return [];
        }
        $model = null;
        if ($context === PaypalExpress::CONTEXT_PRODUCT) {
            if (!$product instanceof Product) {
                return [];
            }
            $model = $product;
        }
        $key = $placement . '|' . ($model !== null ? (string) $model->getId() : '');
        if (!isset($this->configs[$key])) {
            $config = [];
            if ($this->paypalExpress->isAvailable() && $this->paypalExpress->isVisible($context, $model)) {
                $config = $this->paypalExpress->getConfig($context);
                if ($this->paypalExpress->serialize($config) === '') {
                    $config = [];
                }
            }
            $this->configs[$key] = $config;
        }

        return $this->configs[$key];
    }
}

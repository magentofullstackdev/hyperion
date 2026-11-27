<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\DeploymentConfig;
use Magento\Framework\Config\ConfigOptionsListConstants;

/**
 * The token that ties the fake express page and its return to the cart of
 * the session that started the payment: a keyed hash of the cart id. Once
 * the order is placed the session holds a new cart and the token stops
 * matching.
 */
class ExpressSession
{
    /**
     * @param CheckoutSession $checkoutSession
     * @param DeploymentConfig $deploymentConfig
     */
    public function __construct(
        private readonly CheckoutSession $checkoutSession,
        private readonly DeploymentConfig $deploymentConfig
    ) {
    }

    /**
     * The token of the session's cart, empty without a cart.
     *
     * @return string
     */
    public function start(): string
    {
        return $this->tokenFor((int) $this->checkoutSession->getQuoteId());
    }

    /**
     * Whether the token belongs to the session's cart.
     *
     * @param string $token
     * @return bool
     */
    public function isValid(string $token): bool
    {
        $expected = $this->tokenFor((int) $this->checkoutSession->getQuoteId());

        return $expected !== '' && $token !== '' && hash_equals($expected, $token);
    }

    /**
     * The keyed hash of a cart id.
     *
     * @param int $quoteId
     * @return string
     */
    private function tokenFor(int $quoteId): string
    {
        if ($quoteId <= 0) {
            return '';
        }
        $key = (string) $this->deploymentConfig->get(ConfigOptionsListConstants::CONFIG_PATH_CRYPT_KEY);

        return hash_hmac('sha256', 'hyperion-sample-express|' . $quoteId, $key);
    }
}

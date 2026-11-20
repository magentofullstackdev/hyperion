<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Braintree;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Reuses Braintree client tokens instead of asking the gateway for a new one
 * on every call.
 *
 * Around `PayPal\Braintree\Model\Adapter\BraintreeAdapter::generate()` (the
 * Braintree module is optional: no import, no type hint on its classes). Every
 * Braintree checkout config provider (card, PayPal, Google Pay, Apple Pay,
 * Venmo, ACH, local payment methods) asks for its own token with the same
 * parameters, each call being an HTTPS round trip to the gateway, so a
 * checkout page waits for several of them in a row.
 *
 * - Within a request, equal parameters for the same credentials give the
 *   token of the first call, an empty string from a failed call included
 *   (one failed attempt per request instead of one per provider).
 * - A token asked for with shareable parameters only (the merchant account)
 *   is also kept in the application cache for 30 minutes under the
 *   configuration tag (cleaning the configuration cache drops it), keyed by
 *   the store and the gateway credentials in use, so a change of environment,
 *   merchant or API key asks for a new one; client tokens stay valid for 24
 *   hours. A token tied to a customer (`customerId`) or asked for
 *   with any other option never leaves the request. Only a non-empty string
 *   is stored: after a gateway error the next request asks again.
 *
 * The key holds the store, the configured environment and merchant id of that
 * store (hashed, never logged), the credentials the adapter actually carries
 * and the normalized parameters, so one store never receives a token of
 * another store's merchant.
 */
class ClientTokenCachePlugin
{
    public const CACHE_LIFETIME = 1800;
    public const CACHE_KEY_PREFIX = 'hyperion_braintree_client_token_';

    public const PATH_ENVIRONMENT = 'payment/braintree/environment';
    public const PATH_MERCHANT_ID = 'payment/braintree/merchant_id';
    public const PATH_SANDBOX_MERCHANT_ID = 'payment/braintree/sandbox_merchant_id';

    private const ENVIRONMENT_PRODUCTION = 'production';

    /**
     * Parameters a token may be shared on between visitors.
     */
    private const SHAREABLE_PARAMS = ['merchantAccountId'];

    /**
     * @var array<string, mixed>
     */
    private array $tokens = [];

    /**
     * @param CacheInterface $cache
     * @param ScopeConfigInterface $scopeConfig
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CacheInterface $cache,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Answer a client token from the request memo or the application cache.
     *
     * @param object $subject
     * @param callable $proceed
     * @param array $params
     * @return mixed
     */
    public function aroundGenerate(object $subject, callable $proceed, array $params = [])
    {
        $key = null;
        $shareable = false;
        try {
            $key = $this->buildKey($subject, $params);
            $shareable = $this->isShareable($params);
        } catch (\Throwable $e) {
            $this->logger->warning(
                'Hyperion: no Braintree client token cache key, asking the gateway.',
                ['exception' => $e]
            );
            $key = null;
        }

        if ($key !== null && array_key_exists($key, $this->tokens)) {
            return $this->tokens[$key];
        }
        if ($key !== null && $shareable) {
            try {
                $cached = $this->cache->load($key);
                if (is_string($cached) && $cached !== '') {
                    $this->tokens[$key] = $cached;

                    return $cached;
                }
            } catch (\Throwable $e) {
                $this->logger->warning(
                    'Hyperion: Braintree client token cache unavailable, asking the gateway.',
                    ['exception' => $e]
                );
            }
        }

        $token = $proceed($params);

        if ($key === null) {
            return $token;
        }
        $this->tokens[$key] = $token;
        if ($shareable && is_string($token) && $token !== '') {
            try {
                $this->cache->save($token, $key, [Config::CACHE_TAG], self::CACHE_LIFETIME);
            } catch (\Throwable $e) {
                $this->logger->warning(
                    'Hyperion: Braintree client token could not be cached.',
                    ['exception' => $e]
                );
            }
        }

        return $token;
    }

    /**
     * Cache key for a token of the current store, credentials and parameters.
     *
     * @param object $subject
     * @param array $params
     * @return string
     */
    private function buildKey(object $subject, array $params): string
    {
        $storeId = (int) $this->storeManager->getStore()->getId();
        $environment = (string) $this->scopeConfig->getValue(
            self::PATH_ENVIRONMENT,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );
        $merchantPath = $environment === self::ENVIRONMENT_PRODUCTION
            ? self::PATH_MERCHANT_ID
            : self::PATH_SANDBOX_MERCHANT_ID;
        $merchantId = (string) $this->scopeConfig->getValue($merchantPath, ScopeInterface::SCOPE_STORE, $storeId);

        // The adapter sets its credentials once, for the store it was built in.
        $liveEnvironment = method_exists($subject, 'environment') ? $subject->environment() : null;
        $liveMerchantId = method_exists($subject, 'merchantId') ? $subject->merchantId() : null;
        // Part of the hash only: rotated API keys must not be served a token signed for the old ones.
        $livePublicKey = method_exists($subject, 'publicKey') ? $subject->publicKey() : null;

        $this->sortKeys($params);
        $material = json_encode(
            [
                $storeId,
                $environment,
                $merchantId,
                is_scalar($liveEnvironment) ? (string) $liveEnvironment : '',
                is_scalar($liveMerchantId) ? (string) $liveMerchantId : '',
                is_scalar($livePublicKey) ? (string) $livePublicKey : '',
                $params,
            ],
            JSON_THROW_ON_ERROR
        );

        return self::CACHE_KEY_PREFIX . hash('sha256', $material);
    }

    /**
     * Whether a token for these parameters may be shared between visitors.
     *
     * @param array $params
     * @return bool
     */
    private function isShareable(array $params): bool
    {
        foreach ($params as $name => $value) {
            if (!in_array($name, self::SHAREABLE_PARAMS, true) || !is_scalar($value)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Sort an array by key at every level.
     *
     * @param array $values
     * @return void
     */
    private function sortKeys(array &$values): void
    {
        ksort($values);
        foreach ($values as &$value) {
            if (is_array($value)) {
                $this->sortKeys($value);
            }
        }
        unset($value);
    }
}

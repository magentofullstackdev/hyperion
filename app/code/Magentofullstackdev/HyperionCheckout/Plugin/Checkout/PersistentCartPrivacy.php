<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Checkout;

use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Keeps a remembered customer's personal data out of the checkout page
 * while the shopper is not signed in.
 *
 * With Persistent Shopping Cart on, a visitor who only holds the
 * persistent cookie gets the customer's quote back. Core's
 * `DefaultConfigProvider` then prints that quote as it is: `quoteData`
 * (`$quote->toArray()`: email, name, date of birth, customer id, the
 * shipping assignment with the address), `validatedEmailValue` and the
 * shipping / billing address of the quote (`shippingAddressFromData`,
 * `billingAddressFromData`), because the visitor counts as not logged in.
 * Whoever uses the device would read them in the page source.
 *
 * For a remembered, not signed-in shopper this plugin removes the address
 * keys and the email, and reduces `quoteData` to the keys the checkout
 * reads (`QUOTE_DATA_ALLOWED`): the cart id (masked by core's persistent
 * plugin in this state), the virtual flag, the two currency codes and the
 * base to quote rate. The checkout then starts like a guest checkout.
 *
 * `Magento_Persistent` is optional: its session helper is resolved by
 * name, only when the module is enabled, so this class compiles and runs
 * without it. When the module is enabled but its state cannot be read for
 * a shopper who is not signed in, the keys are stripped all the same
 * (logged): the checkout reads none of the removed keys and only the kept
 * `quoteData` keys, so a real guest loses nothing.
 */
class PersistentCartPrivacy
{
    private const MODULE = 'Magento_Persistent';
    private const SESSION_HELPER = 'Magento\\Persistent\\Helper\\Session';

    /** Top level keys that carry the remembered customer's address or email. */
    public const REMOVED_KEYS = [
        'validatedEmailValue',
        'shippingAddressFromData',
        'billingAddressFromData',
        'isShippingAddressFromDataValid',
        'isBillingAddressFromDataValid',
    ];

    /**
     * The `quoteData` keys the checkout bundle reads: `entity_id` and
     * `is_virtual` (`store/hydrate.ts`), `quote_currency_code`,
     * `base_currency_code` and `base_to_quote_rate` (`extension/snapshot.ts`).
     */
    public const QUOTE_DATA_ALLOWED = [
        'entity_id',
        'is_virtual',
        'quote_currency_code',
        'base_currency_code',
        'base_to_quote_rate',
    ];

    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly CustomerSession $customerSession,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Strips the remembered customer's data from the checkout configuration.
     *
     * @param CompositeConfigProvider $subject
     * @param mixed $result
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGetConfig(CompositeConfigProvider $subject, $result)
    {
        if (!is_array($result)) {
            return $result;
        }
        if ($this->customerSession->isLoggedIn()
            || !$this->moduleManager->isEnabled(self::MODULE)
            || !class_exists(self::SESSION_HELPER)
        ) {
            return $result;
        }
        try {
            if (!$this->isPersistent()) {
                return $result;
            }
        } catch (\Throwable $e) {
            $this->logger->error(
                'Hyperion checkout: the persistent session state could not be read, the customer keys are removed',
                ['exception' => $e]
            );
        }

        foreach (self::REMOVED_KEYS as $key) {
            unset($result[$key]);
        }
        if (isset($result['quoteData']) && is_array($result['quoteData'])) {
            $result['quoteData'] = array_intersect_key(
                $result['quoteData'],
                array_flip(self::QUOTE_DATA_ALLOWED)
            );
        }
        return $result;
    }

    /**
     * Whether a persistent session is active.
     *
     * @return bool
     * @throws \RuntimeException when the helper cannot answer
     */
    private function isPersistent(): bool
    {
        $helper = $this->objectManager->get(self::SESSION_HELPER);
        if (!is_object($helper) || !method_exists($helper, 'isPersistent')) {
            throw new \RuntimeException('The persistent session helper has no isPersistent().');
        }
        return (bool) $helper->isPersistent();
    }
}

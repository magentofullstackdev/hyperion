<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Newsletter;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;

/**
 * Options of the newsletter opt-in entry of the checkout extension pool:
 * whether the box starts ticked.
 *
 * The entry is left out while the feature is off, when `Magento_Newsletter`
 * is absent or the newsletter is inactive, for a shopper who is not signed
 * in when guests may not subscribe, and for a customer who is already
 * subscribed. The signed-in state comes from the customer session, never
 * from the quote: a quote restored from the persistent cart belongs to a
 * customer the visitor has not proved to be.
 */
class OptionsProvider implements ExtensionOptionsProviderInterface
{
    /**
     * @param Config $config
     * @param SubscriptionBridge $bridge
     * @param CustomerSession $customerSession
     * @param StoreManagerInterface $storeManager
     */
    public function __construct(
        private readonly Config $config,
        private readonly SubscriptionBridge $bridge,
        private readonly CustomerSession $customerSession,
        private readonly StoreManagerInterface $storeManager
    ) {
    }

    /**
     * @inheritdoc
     *
     * @throws SkipExtensionException when the opt-in does not apply to this shopper
     */
    public function getOptions(CartInterface $quote): array
    {
        $storeId = $quote->getStoreId();
        if (!$this->config->isEnabled($storeId) || !$this->bridge->isAvailable($storeId)) {
            throw new SkipExtensionException('The newsletter opt-in is off.');
        }
        if (!$this->customerSession->isLoggedIn()) {
            if (!$this->bridge->isGuestSubscriptionAllowed($storeId)) {
                throw new SkipExtensionException('Guests may not subscribe.');
            }
        } else {
            $websiteId = (int) $this->storeManager->getStore($storeId)->getWebsiteId();
            if ($this->bridge->isCustomerSubscribed((int) $this->customerSession->getCustomerId(), $websiteId)) {
                throw new SkipExtensionException('The customer is already subscribed.');
            }
        }
        return ['checked' => $this->config->isCheckedByDefault($storeId)];
    }
}

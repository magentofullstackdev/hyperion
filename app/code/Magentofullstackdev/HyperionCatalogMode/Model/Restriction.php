<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalogMode\Model;

use Magento\Customer\Model\Context as CustomerContext;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Phrase;
use Magentofullstackdev\HyperionCore\Model\Purchase\RestrictionInterface;

/**
 * Catalog mode: only the configured customer groups may buy.
 *
 * The group and the login state come from the HTTP context when the page
 * cache set them there (logged-in customer, full page cache on), because
 * those are the values the X-Magento-Vary cookie and every block cache key
 * are built from, and because the customer session is already depersonalized
 * while a cacheable page renders. The session is the fallback (guests, page
 * cache off).
 */
class Restriction implements RestrictionInterface
{
    public function __construct(
        private readonly Config $config,
        private readonly HttpContext $httpContext,
        private readonly CustomerSession $customerSession
    ) {
    }

    /**
     * @inheritDoc
     */
    public function isRestricted(): bool
    {
        if (!$this->config->isEnabled()) {
            return false;
        }

        return !in_array($this->getCurrentGroupId(), $this->config->getAllowedGroupIds(), true);
    }

    /**
     * @inheritDoc
     */
    public function getMessage(): Phrase
    {
        return $this->isLoggedIn()
            ? __('Your account is not allowed to purchase items.')
            : __('Please log in to purchase items.');
    }

    /**
     * @return bool
     */
    private function isLoggedIn(): bool
    {
        $contextAuth = $this->httpContext->getValue(CustomerContext::CONTEXT_AUTH);
        if ($contextAuth !== null) {
            return (bool) $contextAuth;
        }

        return $this->customerSession->isLoggedIn();
    }

    /**
     * @return int
     */
    private function getCurrentGroupId(): int
    {
        $contextGroup = $this->httpContext->getValue(CustomerContext::CONTEXT_GROUP);
        if ($contextGroup !== null) {
            return (int) $contextGroup;
        }

        return (int) $this->customerSession->getCustomerGroupId();
    }
}

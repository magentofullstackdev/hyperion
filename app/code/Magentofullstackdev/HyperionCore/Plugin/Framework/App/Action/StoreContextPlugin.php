<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\App\Action;

use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Session\Generic as Session;
use Magento\Store\Model\Store;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManager;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Store and currency values of the HTTP context for controllers that
 * implement ActionInterface directly.
 *
 * Core sets them in Magento\Store\App\Action\Plugin\Context, a plugin on
 * AbstractAction::dispatch(), so a controller that only implements the
 * action interface (every Hyperion HTMX endpoint) never gets them. The
 * X-Magento-Vary cookie is derived from that context on every response:
 * without the values the header state request, which every page issues,
 * answered with a null vary string and deleted the cookie the currency or
 * store switch had just set, and the next page came out of the full page
 * cache in the default currency. Same rules as core's updateContext().
 */
class StoreContextPlugin
{
    /**
     * @param HttpContext $httpContext
     * @param StoreManagerInterface $storeManager
     * @param Session $session
     * @param HttpRequest $request
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly HttpContext $httpContext,
        private readonly StoreManagerInterface $storeManager,
        private readonly Session $session,
        private readonly HttpRequest $request,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param ActionInterface $subject
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeExecute(ActionInterface $subject): void
    {
        if ($this->httpContext->getValue(StoreManagerInterface::CONTEXT_STORE) !== null) {
            return;
        }

        try {
            $store = $this->storeManager->getStore();
            if (!$store instanceof Store) {
                return;
            }
            $defaultStore = $this->resolveDefaultStore($store);

            $this->httpContext->setValue(
                StoreManagerInterface::CONTEXT_STORE,
                $store->getCode(),
                $defaultStore->getCode()
            );
            $this->httpContext->setValue(
                HttpContext::CONTEXT_CURRENCY,
                (string) $this->session->getData('currency_code') ?: $store->getDefaultCurrencyCode(),
                $defaultStore->getDefaultCurrencyCode()
            );
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion StoreContextPlugin: context not set -- ' . $e->getMessage());
        }
    }

    /**
     * @param Store $store
     * @return Store
     */
    private function resolveDefaultStore(Store $store): Store
    {
        if ($store->isUseStoreInUrl()) {
            return $store;
        }
        $code = ScopeInterface::SCOPE_STORE === $this->request->getServerValue(StoreManager::PARAM_RUN_TYPE)
            ? (string) $this->request->getServerValue(StoreManager::PARAM_RUN_CODE)
            : $this->storeManager->getDefaultStoreView()->getCode();
        $defaultStore = $this->storeManager->getStore($code);

        return $defaultStore instanceof Store ? $defaultStore : $store;
    }
}

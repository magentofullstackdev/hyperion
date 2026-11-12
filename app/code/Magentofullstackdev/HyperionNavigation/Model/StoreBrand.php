<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * The name a storefront shows as its brand (header wordmark, logo link,
 * footer, copyright line): the Store Name of Stores > Configuration >
 * General > Store Information for the current store view, else the name of
 * its store group, else the website name, else the host of its base URL.
 * Never the store view name, which names a language or a region
 * ("English", "Italiano").
 */
class StoreBrand
{
    public const XML_PATH_STORE_NAME = 'general/store_information/name';

    public function __construct(
        private readonly StoreManagerInterface $storeManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The brand name of the current store, an empty string only when every source fails.
     */
    public function getName(): string
    {
        $sources = [
            'store information' => fn (): string => (string) $this->scopeConfig->getValue(
                self::XML_PATH_STORE_NAME,
                ScopeInterface::SCOPE_STORE
            ),
            'store group' => fn (): string => (string) $this->storeManager->getGroup()->getName(),
            'website' => fn (): string => (string) $this->storeManager->getWebsite()->getName(),
            'base URL' => fn (): string => $this->baseHost(),
        ];
        foreach ($sources as $label => $read) {
            try {
                $name = trim($read());
                if ($name !== '') {
                    return $name;
                }
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion StoreBrand: ' . $label . ' name not read: ' . $e->getMessage());
            }
        }

        return '';
    }

    private function baseHost(): string
    {
        $store = $this->storeManager->getStore();
        if (!$store instanceof Store) {
            return '';
        }

        return (string) parse_url((string) $store->getBaseUrl(), PHP_URL_HOST);
    }
}

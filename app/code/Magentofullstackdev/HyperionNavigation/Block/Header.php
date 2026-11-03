<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Block;

use Magentofullstackdev\HyperionNavigation\Model\LogoResolver;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

class Header extends Template
{
    /**
     * @param Context $context
     * @param StoreManagerInterface $storeManager
     * @param UrlInterface $urlBuilder
     * @param LogoResolver $logoResolver
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Context $context,
        private readonly StoreManagerInterface $storeManager,
        private readonly UrlInterface $urlBuilder,
        private readonly LogoResolver $logoResolver,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * @return string
     */
    public function getHomeUrl(): string
    {
        try {
            $store = $this->storeManager->getStore();
            return $store instanceof \Magento\Store\Model\Store
                ? (string) $store->getBaseUrl()
                : (string) $this->_urlBuilder->getBaseUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Header: failed to get home URL: ' . $e->getMessage());
            return '/';
        }
    }

    /**
     * @return string
     */
    public function getStoreName(): string
    {
        try {
            return (string) $this->storeManager->getStore()->getName();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Header: failed to get store name: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getLogoFile(): string
    {
        return $this->logoResolver->getLogoFile();
    }

    /**
     * Resolve the logo image URL via the shared LogoResolver.
     *
     * @see \Magentofullstackdev\HyperionNavigation\Model\LogoResolver for the resolution order.
     * @return string
     */
    public function getLogoUrl(): string
    {
        return $this->logoResolver->getLogoUrl();
    }

    /**
     * @return string
     */
    public function getLogoAlt(): string
    {
        return $this->logoResolver->getLogoAlt();
    }

    /**
     * @return string
     */
    public function getSearchActionUrl(): string
    {
        try {
            return $this->urlBuilder->getUrl('catalogsearch/result');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Header: failed to get search action URL: ' . $e->getMessage());
            return '/catalogsearch/result';
        }
    }

    /**
     * @return string
     */
    public function getAccountUrl(): string
    {
        return $this->getUrl('customer/account');
    }

    /**
     * @return string
     */
    public function getLoginUrl(): string
    {
        return $this->getUrl('customer/account/login');
    }

    /**
     * @return string
     */
    public function getRegisterUrl(): string
    {
        return $this->getUrl('customer/account/create');
    }

    /**
     * @return string
     */
    public function getLogoutUrl(): string
    {
        return $this->getUrl('customer/account/logout');
    }

    /**
     * @return string
     */
    public function getCartUrl(): string
    {
        return $this->getUrl('checkout/cart');
    }

    /**
     * @return string
     */
    public function getMinicartFragmentUrl(): string
    {
        // Standard Magento 3-segment routing: frontName=hyperion,
        // controller=minicart, action=fragment. The design doc's
        // /hyperion/checkout/minicart/fragment form was cosmetic; Magento's
        // default router maps /hyperion/minicart/fragment -> the real
        // Magentofullstackdev\HyperionCheckout\Controller\Minicart\Fragment class.
        return $this->getUrl('hyperion/minicart/fragment');
    }

    /**
     * @return array
     */
    public function getCacheKeyInfo(): array
    {
        try {
            $storeCode = $this->storeManager->getStore()->getCode();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Header: failed to get store code for cache key: ' . $e->getMessage());
            $storeCode = 'default';
        }

        return array_merge(
            parent::getCacheKeyInfo(),
            ['store_' . $storeCode]
        );
    }
}

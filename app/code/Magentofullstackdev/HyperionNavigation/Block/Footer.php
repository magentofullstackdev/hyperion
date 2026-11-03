<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Block;

use Magentofullstackdev\HyperionNavigation\Model\LogoResolver;
use Magento\Catalog\Helper\Category as CategoryHelper;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory;
use Magento\Cms\Helper\Page as CmsPageHelper;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Data\Collection;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

class Footer extends Template
{
    private const XML_PATH_TERMS = 'hyperion/footer/terms_cms_identifier';
    private const XML_PATH_PRIVACY = 'hyperion/footer/privacy_cms_identifier';
    private const XML_PATH_COPYRIGHT = 'design/footer/copyright';

    /**
     * @param Context $context
     * @param StoreManagerInterface $storeManager
     * @param ScopeConfigInterface $scopeConfig
     * @param CmsPageHelper $cmsPageHelper
     * @param CollectionFactory $collectionFactory
     * @param CategoryHelper $categoryHelper
     * @param LogoResolver $logoResolver
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Context $context,
        private readonly StoreManagerInterface $storeManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly CmsPageHelper $cmsPageHelper,
        private readonly CollectionFactory $collectionFactory,
        private readonly CategoryHelper $categoryHelper,
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
            return $store instanceof Store ? (string) $store->getBaseUrl() : '/';
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to get home URL: ' . $e->getMessage());
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
            $this->logger->error('Hyperion Footer: failed to get store name: ' . $e->getMessage());
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
    public function getCopyrightText(): string
    {
        try {
            return (string) $this->scopeConfig->getValue(
                self::XML_PATH_COPYRIGHT,
                ScopeInterface::SCOPE_STORE
            );
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to get copyright text: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return int
     */
    public function getCurrentYear(): int
    {
        return (int) date('Y');
    }

    /**
     * @return array<int, array{name: string, url: string}>
     */
    public function getShopLinks(): array
    {
        try {
            $store = $this->storeManager->getStore();
            if (!$store instanceof Store) {
                return [];
            }
            $rootId = (int) $store->getRootCategoryId();

            $collection = $this->collectionFactory->create();
            $collection->setStoreId((int) $store->getId());
            $collection->addAttributeToSelect('name');
            $collection->addFieldToFilter('parent_id', $rootId);
            $collection->addAttributeToFilter('include_in_menu', ['eq' => 1]);
            $collection->addIsActiveFilter();
            $collection->addOrder('position', Collection::SORT_ORDER_ASC);
            $collection->setPageSize(4);

            $links = [];
            foreach ($collection as $category) {
                $links[] = [
                    'name' => (string) $category->getName(),
                    'url' => $this->categoryHelper->getCategoryUrl($category),
                ];
            }

            return $links;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to load shop links: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return string
     */
    public function getContactUrl(): string
    {
        return $this->getUrl('contact');
    }

    /**
     * @return string
     */
    public function getOrderStatusUrl(): string
    {
        return $this->getUrl('sales/guest/form');
    }

    /**
     * @return string
     */
    public function getPrivacyPolicyUrl(): string
    {
        try {
            $identifier = (string) $this->scopeConfig->getValue(
                self::XML_PATH_PRIVACY,
                ScopeInterface::SCOPE_STORE
            );

            if ($identifier === '') {
                return '';
            }

            return (string) $this->cmsPageHelper->getPageUrl($identifier);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to get privacy policy URL: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getTermsUrl(): string
    {
        try {
            $identifier = (string) $this->scopeConfig->getValue(
                self::XML_PATH_TERMS,
                ScopeInterface::SCOPE_STORE
            );

            if ($identifier === '') {
                return '';
            }

            return (string) $this->cmsPageHelper->getPageUrl($identifier);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to get terms URL: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return array
     */
    public function getCacheKeyInfo(): array
    {
        try {
            $storeCode = $this->storeManager->getStore()->getCode();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to get store code for cache key: ' . $e->getMessage());
            $storeCode = 'default';
        }

        return array_merge(
            parent::getCacheKeyInfo(),
            ['store_' . $storeCode]
        );
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Block;

use Magentofullstackdev\HyperionNavigation\Model\LogoResolver;
use Magentofullstackdev\HyperionNavigation\Model\StoreBrand;
use Magento\Catalog\Helper\Category as CategoryHelper;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory;
use Magento\Cms\Api\Data\BlockInterface as CmsBlockInterface;
use Magento\Cms\Api\GetBlockByIdentifierInterface;
use Magento\Cms\Helper\Page as CmsPageHelper;
use Magento\Cms\Model\Block as CmsBlock;
use Magento\Cms\Model\Template\Filter as CmsFilter;
use Magento\Cms\Model\Template\FilterProvider;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Data\Collection;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

class Footer extends Template implements IdentityInterface
{
    /**
     * Identifier of the optional CMS block printed under the footer logo.
     */
    public const ABOUT_BLOCK_IDENTIFIER = 'hyperion-footer-about';

    /**
     * Name of core's footer links block: modules add their links to it, the footer lists them.
     */
    private const CORE_LINKS_BLOCK = 'footer_links';

    private const XML_PATH_TERMS = 'hyperion/footer/terms_cms_identifier';
    private const XML_PATH_PRIVACY = 'hyperion/footer/privacy_cms_identifier';
    private const XML_PATH_COPYRIGHT = 'design/footer/copyright';

    /**
     * The about block of the current store: null until asked, false when there is none.
     *
     * @var CmsBlockInterface|false|null
     */
    private CmsBlockInterface|false|null $aboutBlock = null;

    /**
     * @param Context $context
     * @param StoreManagerInterface $storeManager
     * @param ScopeConfigInterface $scopeConfig
     * @param CmsPageHelper $cmsPageHelper
     * @param CollectionFactory $collectionFactory
     * @param CategoryHelper $categoryHelper
     * @param LogoResolver $logoResolver
     * @param LoggerInterface $logger
     * @param StoreBrand $storeBrand
     * @param GetBlockByIdentifierInterface $getBlockByIdentifier
     * @param FilterProvider $filterProvider
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
        private readonly StoreBrand $storeBrand,
        private readonly GetBlockByIdentifierInterface $getBlockByIdentifier,
        private readonly FilterProvider $filterProvider,
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
     * The merchant's brand name (never the store view name).
     *
     * @return string
     */
    public function getStoreName(): string
    {
        return $this->storeBrand->getName();
    }

    /**
     * Filtered content of the CMS block `hyperion-footer-about`, empty when the store has none.
     *
     * @return string
     */
    public function getAboutHtml(): string
    {
        $block = $this->getAboutBlock();
        if ($block === null) {
            return '';
        }

        try {
            $filter = $this->filterProvider->getBlockFilter();
            if ($filter instanceof CmsFilter) {
                $filter->setStoreId((int) $this->storeManager->getStore()->getId());
            }

            return (string) $filter->filter((string) $block->getContent());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to render the about block: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * Cache tags of the about block.
     *
     * The identifier tag is always present, so creating the block later refreshes the pages
     * that were cached without it.
     *
     * @return string[]
     */
    public function getIdentities(): array
    {
        $identities = [CmsBlock::CACHE_TAG . '_' . self::ABOUT_BLOCK_IDENTIFIER];
        $block = $this->getAboutBlock();
        if ($block !== null) {
            $identities[] = CmsBlock::CACHE_TAG . '_' . $block->getId();
        }

        return $identities;
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
     * Links that modules added to core's `footer_links` block, minus the ones the footer designs itself.
     *
     * A link removed in layout XML or switched off by its `ifconfig` is not a child of the block,
     * so it never shows up here.
     *
     * @return array<int, array{label: string, url: string}>
     */
    public function getServiceLinks(): array
    {
        try {
            $seen = [];
            $designed = [
                $this->getContactUrl(),
                $this->getOrderStatusUrl(),
                $this->getPrivacyPolicyUrl(),
                $this->getTermsUrl(),
            ];
            foreach ($designed as $url) {
                if ($url !== '') {
                    $seen[$this->normalizeUrlPath($url)] = true;
                }
            }

            $links = [];
            foreach ($this->getLayout()->getChildBlocks(self::CORE_LINKS_BLOCK) as $child) {
                if (!$child instanceof AbstractBlock || !method_exists($child, 'getHref')) {
                    continue;
                }
                $label = trim((string) $child->getData('label'));
                $url = (string) $child->getHref();
                if ($label === '' || $url === '') {
                    continue;
                }
                $path = $this->normalizeUrlPath($url);
                if (isset($seen[$path])) {
                    continue;
                }
                $seen[$path] = true;
                $links[] = ['label' => $label, 'url' => $url];
            }

            return $links;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Footer: failed to collect the service links: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * The path of a URL without the host, the trailing slash and a trailing `/index`,
     * so two spellings of one page compare equal.
     *
     * @param string $url
     * @return string
     */
    private function normalizeUrlPath(string $url): string
    {
        $path = (string) parse_url($url, PHP_URL_PATH);
        $path = (string) preg_replace('#(/index)*/*$#', '', $path);

        return strtolower($path);
    }

    /**
     * The active about block of the current store, loaded once per request.
     *
     * @return CmsBlockInterface|null
     */
    private function getAboutBlock(): ?CmsBlockInterface
    {
        if ($this->aboutBlock === null) {
            $this->aboutBlock = false;
            try {
                $block = $this->getBlockByIdentifier->execute(
                    self::ABOUT_BLOCK_IDENTIFIER,
                    (int) $this->storeManager->getStore()->getId()
                );
                if ($block->isActive()) {
                    $this->aboutBlock = $block;
                }
            } catch (NoSuchEntityException $e) {
                // The block is optional: a store without it prints no paragraph.
                $this->logger->debug('Hyperion Footer: no about block for this store: ' . $e->getMessage());
                $this->aboutBlock = false;
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion Footer: failed to load the about block: ' . $e->getMessage());
            }
        }

        return $this->aboutBlock ?: null;
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

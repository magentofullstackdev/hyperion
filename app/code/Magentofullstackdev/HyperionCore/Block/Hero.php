<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Block;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory as CategoryCollectionFactory;
use Magento\Cms\Block\Block as CmsBlockRenderer;
use Magento\Cms\Model\BlockFactory as CmsBlockFactory;
use Magento\Cms\Model\ResourceModel\Block as CmsBlockResource;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;

/**
 * Renders the CMS-driven homepage hero section.
 *
 * Attempts to load and render the CMS block identified by "hyperion_hero".
 * Falls back to a static translated placeholder when the block is absent.
 */
class Hero extends Template
{
    /**
     * CMS block identifier used for the hero content.
     */
    private const HERO_CMS_IDENTIFIER = 'hyperion_hero';

    public function __construct(
        Context $context,
        private readonly CmsBlockFactory $cmsBlockFactory,
        private readonly CategoryCollectionFactory $categoryCollectionFactory,
        private readonly CmsBlockResource $cmsBlockResource,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * Return the rendered HTML of the "hyperion_hero" CMS block, or null when absent.
     */
    public function getHeroContent(): ?string
    {
        $cmsBlock = $this->cmsBlockFactory->create();
        $this->cmsBlockResource->load($cmsBlock, self::HERO_CMS_IDENTIFIER, 'identifier');

        if (!$cmsBlock->getId() || !$cmsBlock->isActive()) {
            return null;
        }

        // Render via the cms/block template so directives ({{store url="..."}}, etc.) are processed.
        $block = $this->getLayout()->createBlock(
            CmsBlockRenderer::class,
            '',
            ['data' => ['block_id' => self::HERO_CMS_IDENTIFIER]]
        );
        return $block->toHtml();
    }

    /**
     * Return a URL pointing to the first active top-level category, or the store's base URL
     * when the store has none (a fixed category id would point at a root that is not displayable).
     */
    public function getShopUrl(): string
    {
        $store = $this->_storeManager->getStore();
        $rootId = (int) $this->_storeManager->getGroup()->getRootCategoryId();

        $collection = $this->categoryCollectionFactory->create();
        $collection->setStoreId((int) $store->getId());
        $collection->addFieldToFilter('parent_id', $rootId);
        $collection->addAttributeToFilter('include_in_menu', ['eq' => 1]);
        $collection->addIsActiveFilter();
        $collection->addOrder('position', \Magento\Framework\Data\Collection::SORT_ORDER_ASC);
        $collection->setPageSize(1);
        $collection->addAttributeToSelect('url_key');

        $first = $collection->getFirstItem();

        if ($first instanceof Category && $first->getId()) {
            return (string) $first->getUrl();
        }

        return (string) $this->getBaseUrl();
    }
}

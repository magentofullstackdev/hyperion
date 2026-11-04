<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Seo;

use Magento\Catalog\Helper\Data as CatalogHelper;
use Magento\Cms\Block\Page as CmsPageBlock;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Page\Config as PageConfig;
use Magento\Framework\View\Page\Config\Renderer;
use Magento\Store\Model\ScopeInterface;
use Magentofullstackdev\HyperionCore\Model\Seo\MetaDescription;
use Psr\Log\LoggerInterface;

/**
 * Gives a category, product or CMS page that has no meta description one
 * made from its own text, right before the head renders: by then every
 * controller and helper has written its own metadata (the product helper
 * sets the description after the blocks are generated, so an earlier hook
 * is overwritten). A value the merchant typed, or the store's default
 * description, is never replaced; the option switches the fallback off.
 */
class MetaDescriptionFallbackPlugin
{
    public const XML_PATH_ENABLED = 'hyperion/seo/meta_description_fallback';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly HttpRequest $request,
        private readonly PageConfig $pageConfig,
        private readonly LayoutInterface $layout,
        private readonly CatalogHelper $catalogHelper,
        private readonly MetaDescription $metaDescription,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeRenderHeadContent(Renderer $subject): void
    {
        try {
            if (!$this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE)) {
                return;
            }
            if (trim((string) $this->pageConfig->getDescription()) !== '') {
                return;
            }
            $source = $this->sourceText((string) $this->request->getFullActionName());
            $description = $this->metaDescription->fromHtml($source);
            if ($description !== '') {
                $this->pageConfig->setDescription($description);
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion meta description fallback failed: ' . $e->getMessage());
        }
    }

    private function sourceText(string $action): string
    {
        switch ($action) {
            case 'catalog_category_view':
                $category = $this->catalogHelper->getCategory();
                return $category ? (string) $category->getData('description') : '';
            case 'catalog_product_view':
                $product = $this->catalogHelper->getProduct();
                if (!$product) {
                    return '';
                }
                $short = (string) $product->getData('short_description');
                return trim(strip_tags($short)) !== '' ? $short : (string) $product->getData('description');
            case 'cms_page_view':
            case 'cms_index_index':
                $block = $this->layout->getBlock('cms_page');
                return $block instanceof CmsPageBlock ? (string) $block->getPage()->getContent() : '';
            default:
                return '';
        }
    }
}

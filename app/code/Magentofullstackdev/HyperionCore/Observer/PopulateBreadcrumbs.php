<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Observer;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory as CategoryCollectionFactory;
use Magento\Cms\Model\Page as CmsPage;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Registry;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Page\Config as PageConfig;
use Magento\Theme\Block\Html\Breadcrumbs;
use Psr\Log\LoggerInterface;

/**
 * Server-side breadcrumb population -- supplements Magento core.
 *
 * Magento core already populates breadcrumbs on catalog pages:
 *   - PDP  -> Magento\Catalog\Block\Breadcrumbs::_prepareLayout()
 *   - PLP  -> Magento\Catalog\Block\Category\View::_prepareLayout()
 *
 * On those pages we respect what core has set and do nothing. On all other
 * pages (CMS, customer account, checkout, wishlist, etc.) core doesn't
 * touch breadcrumbs, so we fill them in here -- always prefixing "Home".
 */
class PopulateBreadcrumbs implements ObserverInterface
{
    public function __construct(
        private readonly Registry $registry,
        private readonly UrlInterface $urlBuilder,
        private readonly HttpRequest $request,
        private readonly CategoryCollectionFactory $categoryCollectionFactory,
        private readonly LoggerInterface $logger,
        private readonly PageConfig $pageConfig
    ) {
    }

    public function execute(Observer $observer): void
    {
        /** @var LayoutInterface|null $layout */
        $layout = $observer->getData('layout');
        if (!$layout) {
            return;
        }

        $breadcrumbs = $layout->getBlock('breadcrumbs');
        if (!$breadcrumbs instanceof Breadcrumbs) {
            return;
        }

        // Respect core: if core (or any other module) already populated crumbs,
        // do nothing. Peek at the protected _crumbs property read-only.
        if ($this->blockHasCrumbs($breadcrumbs)) {
            return;
        }

        // Always add Home first on pages core doesn't touch.
        $breadcrumbs->addCrumb('home', [
            'label' => (string) __('Home'),
            'title' => (string) __('Go to Home Page'),
            'link' => $this->urlBuilder->getUrl(''),
        ]);

        $cmsPage = $this->registry->registry('cms_page');
        if ($cmsPage instanceof CmsPage && $cmsPage->getId()) {
            $breadcrumbs->addCrumb('cms_page', [
                'label' => (string) $cmsPage->getTitle(),
                'title' => (string) $cmsPage->getTitle(),
            ]);
            return;
        }

        // Catalog pages are already handled by core, but if somehow a PDP or PLP
        // reaches here with an empty crumb list, fall back to our own resolution.
        $product = $this->registry->registry('current_product');
        $category = $this->registry->registry('current_category');

        if ($product instanceof Product) {
            $this->addProductCrumbs($breadcrumbs, $product);
            return;
        }

        if ($category instanceof Category) {
            $this->addCategoryPathCrumbs($breadcrumbs, $category, true);
            return;
        }

        // Fallback: the page title the controller or its blocks set ("Checkout",
        // "Order # 000000012", "My Wish List"); the route name only when a page
        // has no title at all.
        $fullAction = (string) $this->request->getFullActionName();
        if ($fullAction !== '' && $fullAction !== 'cms_index_index') {
            $label = trim((string) $this->pageConfig->getTitle()->getShort()) ?: $this->humanizeAction($fullAction);
            $breadcrumbs->addCrumb('current', [
                'label' => $label,
                'title' => $label,
            ]);
        }
    }

    /**
     * Read-only check: does the breadcrumbs block already have crumbs in its internal array?
     */
    private function blockHasCrumbs(Breadcrumbs $breadcrumbs): bool
    {
        try {
            $prop = new \ReflectionProperty($breadcrumbs, '_crumbs');
            $value = $prop->getValue($breadcrumbs);
            return is_array($value) && $value !== [];
        } catch (\ReflectionException $e) {
            $this->logger->warning(
                'PopulateBreadcrumbs::blockHasCrumbs could not read the _crumbs property of ' . $breadcrumbs::class,
                ['exception' => $e]
            );
            return false;
        }
    }

    private function addCategoryPathCrumbs(Breadcrumbs $breadcrumbs, Category $category, bool $currentIsLast): void
    {
        $pathIds = explode('/', (string) $category->getPath());
        $pathIds = array_values(array_filter($pathIds, static fn($id) => (int) $id > 2));
        if (empty($pathIds)) {
            return;
        }

        $categories = $this->categoryCollectionFactory->create()
            ->addAttributeToSelect(['name', 'url_key', 'url_path'])
            ->addAttributeToFilter('entity_id', ['in' => $pathIds])
            ->setOrder('level', 'ASC');

        $byId = [];
        foreach ($categories as $cat) {
            $byId[(int) $cat->getId()] = $cat;
        }

        $lastId = (int) $category->getId();
        foreach ($pathIds as $id) {
            $id = (int) $id;
            $cat = $byId[$id] ?? null;
            if (!$cat) {
                continue;
            }
            $isLast = $currentIsLast && $id === $lastId;
            // Match Magento core's crumb key format: category<id> (no underscore).
            $breadcrumbs->addCrumb('category' . $id, [
                'label' => (string) $cat->getName(),
                'title' => (string) $cat->getName(),
                'link' => $isLast ? '' : (string) $cat->getUrl(),
            ]);
        }
    }

    private function addProductCrumbs(Breadcrumbs $breadcrumbs, Product $product): void
    {
        $category = $this->registry->registry('current_category');
        if ($category instanceof Category) {
            $this->addCategoryPathCrumbs($breadcrumbs, $category, false);
        } else {
            $categoryIds = (array) $product->getCategoryIds();
            if (!empty($categoryIds)) {
                $categories = $this->categoryCollectionFactory->create()
                    ->addAttributeToSelect(['name', 'url_key', 'url_path', 'level'])
                    ->addAttributeToFilter('entity_id', ['in' => $categoryIds])
                    ->setOrder('level', 'DESC')
                    ->setPageSize(1);
                $deepest = $categories->getFirstItem();
                if ($deepest instanceof Category && $deepest->getId()) {
                    $this->addCategoryPathCrumbs($breadcrumbs, $deepest, false);
                }
            }
        }

        $breadcrumbs->addCrumb('product', [
            'label' => (string) $product->getName(),
            'title' => (string) $product->getName(),
        ]);
    }

    private function humanizeAction(string $fullAction): string
    {
        $parts = array_filter(preg_split('/[_\-]/', $fullAction) ?: []);
        return implode(' ', array_map('ucfirst', $parts));
    }
}

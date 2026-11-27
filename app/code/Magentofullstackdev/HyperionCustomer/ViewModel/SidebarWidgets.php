<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel;

use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Sales\Model\Order\Config as OrderConfig;
use Magento\Sales\Model\ResourceModel\Order\CollectionFactory as OrderCollectionFactory;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Rows of the "Recently Ordered" sidebar of the account pages.
 *
 * Reads the customer session, so it is only used on private pages (the
 * account handles, rendered by an uncacheable block).
 */
class SidebarWidgets implements ArgumentInterface
{
    private const RECENT_ORDER_LIMIT = 5;
    private const ITEM_LIMIT = 5;

    /**
     * @param CustomerSession $customerSession
     * @param OrderCollectionFactory $orderCollectionFactory
     * @param OrderConfig $orderConfig
     * @param ProductRepositoryInterface $productRepository
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CustomerSession $customerSession,
        private readonly OrderCollectionFactory $orderCollectionFactory,
        private readonly OrderConfig $orderConfig,
        private readonly ProductRepositoryInterface $productRepository,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Items of the customer's latest orders (statuses visible on the storefront),
     * one row per product, at most five, products of the current website only.
     *
     * `id` is the order item id `checkout/cart/addgroup` expects; `url` is empty
     * for a product not visible on its own; `saleable` false renders a disabled
     * checkbox.
     *
     * @return array<int, array{id: int, name: string, url: string, saleable: bool}>
     */
    public function getReorderItems(): array
    {
        try {
            $customerId = (int) $this->customerSession->getCustomerId();
            if (!$this->customerSession->isLoggedIn() || $customerId <= 0) {
                return [];
            }
            $store = $this->storeManager->getStore();
            $websiteId = (int) $store->getWebsiteId();
            $collection = $this->orderCollectionFactory->create($customerId)
                ->addAttributeToFilter('customer_id', $customerId)
                ->addAttributeToFilter('status', ['in' => $this->orderConfig->getVisibleOnFrontStatuses()])
                ->addAttributeToSort('created_at', 'desc')
                ->setPageSize(self::RECENT_ORDER_LIMIT)
                ->setCurPage(1);

            $rows = [];
            foreach ($collection as $order) {
                foreach ($order->getAllVisibleItems() as $item) {
                    $productId = (int) $item->getProductId();
                    if ($productId <= 0 || isset($rows[$productId])) {
                        continue;
                    }
                    try {
                        $product = $this->productRepository->getById($productId, false, (int) $store->getId());
                    } catch (NoSuchEntityException $e) {
                        $this->logger->debug('Recently Ordered: product ' . $productId . ' no longer exists');
                        continue;
                    }
                    if (!$product instanceof Product) {
                        continue;
                    }
                    if (!in_array($websiteId, array_map('intval', (array) $product->getWebsiteIds()), true)) {
                        continue;
                    }
                    $rows[$productId] = [
                        'id' => (int) $item->getId(),
                        'name' => (string) $item->getName(),
                        'url' => $product->isVisibleInSiteVisibility() ? (string) $product->getProductUrl() : '',
                        'saleable' => (bool) $product->isSaleable(),
                    ];
                    if (count($rows) >= self::ITEM_LIMIT) {
                        break 2;
                    }
                }
            }
            return array_values($rows);
        } catch (\Throwable $e) {
            $this->logger->error('Recently Ordered: order items could not be read', ['exception' => $e]);
            return [];
        }
    }
}

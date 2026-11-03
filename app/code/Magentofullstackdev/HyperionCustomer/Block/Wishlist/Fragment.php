<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block\Wishlist;

use Magentofullstackdev\HyperionCustomer\ViewModel\CustomerData;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\View\Element\Template;
use Magento\Wishlist\Helper\Data as WishlistHelper;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use Psr\Log\LoggerInterface;

class Fragment extends Template
{
    /**
     * @param Template\Context $context
     * @param CustomerData $customerData
     * @param CustomerSession $customerSession
     * @param LoggerInterface $logger
     * @param WishlistHelper $wishlistHelper
     * @param ProductSummary $productSummary
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        private readonly CustomerData $customerData,
        private readonly CustomerSession $customerSession,
        private readonly LoggerInterface $logger,
        private readonly WishlistHelper $wishlistHelper,
        private readonly ProductSummary $productSummary,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * Product id => wishlist item id for the logged-in customer. The item
     * id is what `wishlist/index/remove` expects, so the toggle buttons can
     * remove a product without an extra lookup.
     *
     * @return array<int, int>
     */
    public function getItemMap(): array
    {
        try {
            if (!$this->isLoggedIn()) {
                return [];
            }
            $map = [];
            foreach ($this->wishlistHelper->getWishlistItemCollection() as $item) {
                $map[(int) $item->getProductId()] = (int) $item->getId();
            }
            return $map;
        } catch (\Throwable $e) {
            $this->logger->error('Wishlist\Fragment::getItemMap -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * The newest wishlist items as product summaries for the client-side
     * sidebar (`<hyperion-wishlist-sidebar>`), each with the wishlist item
     * id (`item`) the remove and add-to-cart controllers expect and the
     * stored quantity. Same number of items as core's sidebar.
     *
     * @param int $limit
     * @return array<int, array<string, mixed>>
     */
    public function getItemSummaries(int $limit = 3): array
    {
        try {
            if (!$this->isLoggedIn()) {
                return [];
            }
            $items = [];
            foreach ($this->wishlistHelper->getWishlistItemCollection() as $item) {
                $product = $item->getProduct();
                if (!$product instanceof \Magento\Catalog\Model\Product || !$product->getId()) {
                    continue;
                }
                $items[] = $this->productSummary->fromProduct($product, 'product_small_image')
                    + ['item' => (int) $item->getId(), 'qty' => (float) $item->getQty()];
                if (count($items) >= $limit) {
                    break;
                }
            }
            return $items;
        } catch (\Throwable $e) {
            $this->logger->error('Wishlist\Fragment::getItemSummaries -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return int
     */
    public function getItemCount(): int
    {
        try {
            return $this->customerData->getWishlistItemCount();
        } catch (\Throwable $e) {
            $this->logger->error('Wishlist\Fragment::getItemCount -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * @return string
     */
    public function getWishlistUrl(): string
    {
        try {
            return $this->customerData->getWishlistUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Wishlist\Fragment::getWishlistUrl -- ' . $e->getMessage());
            return '/wishlist';
        }
    }

    /**
     * @return string
     */
    public function getLoginUrl(): string
    {
        try {
            return $this->customerData->getLoginUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Wishlist\Fragment::getLoginUrl -- ' . $e->getMessage());
            return '/customer/account/login';
        }
    }

    /**
     * @return bool
     */
    public function isLoggedIn(): bool
    {
        try {
            return $this->customerData->isLoggedIn();
        } catch (\Throwable $e) {
            $this->logger->error('Wishlist\Fragment::isLoggedIn -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * @return array
     */
    public function getCacheKeyInfo(): array
    {
        try {
            $customerId = (int) $this->customerSession->getCustomerId();
            if ($customerId > 0) {
                return ['hyperion_wishlist_customer_' . $customerId];
            }
            return ['hyperion_wishlist_anon'];
        } catch (\Throwable $e) {
            $this->logger->error('Wishlist\Fragment::getCacheKeyInfo -- ' . $e->getMessage());
            return ['hyperion_wishlist_anon'];
        }
    }

    /**
     * @return null
     */
    public function getCacheLifetime(): ?int
    {
        return null;
    }
}

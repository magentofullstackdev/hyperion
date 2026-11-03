<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel;

use Magento\Catalog\Helper\Product\Compare as CompareHelper;
use Magento\Customer\Model\Context as CustomerContext;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Sales\Model\ResourceModel\Order\CollectionFactory as OrderCollectionFactory;
use Magento\Wishlist\Helper\Data as WishlistHelper;
use Psr\Log\LoggerInterface;

/**
 * Hyperion sidebar-widgets view model.
 *
 * Exposes the minimum accessors Hyperion's overridden widget templates
 * need to render a *server-side* "Recently Ordered" / "Compare" /
 * "Wishlist" rail for the logged-in customer. Each accessor guards
 * against unauthenticated or empty states so the widget templates can
 * render nothing (empty string) and their parent containers collapse
 * via the Tailwind `empty:hidden` utility Hyperion applies to
 * `div.sidebar.main`.
 *
 * This view-model intentionally does not duplicate the Knockout-driven
 * AJAX pipeline (`Magento_Sales/js/view/last-ordered-items`, etc.).
 * Hyperion is server-first: if the customer state changes we refresh
 * the page (or, for the mini-cart, issue an HTMX OOB swap), rather
 * than maintaining a parallel JSON client-side state store.
 */
class SidebarWidgets implements ArgumentInterface
{
    private const RECENT_ORDER_LIMIT = 5;

    /** @var \Magento\Sales\Model\Order[]|null */
    private ?array $recentOrders = null;

    public function __construct(
        private readonly CustomerSession $customerSession,
        private readonly HttpContext $httpContext,
        private readonly OrderCollectionFactory $orderCollectionFactory,
        private readonly WishlistHelper $wishlistHelper,
        private readonly CompareHelper $compareHelper,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Auth check that works under Varnish / Magento FPC -- the customer
     * session alone is populated per-request and gets cached wrong on
     * edge-cached responses. Magento's `CONTEXT_AUTH` value propagates
     * through the `X-Magento-Vary` cache-key machinery, so falling
     * back to it keeps the widget correct for logged-in customers
     * even when the category page is served from the page cache.
     */
    public function isLoggedIn(): bool
    {
        try {
            if ($this->customerSession->isLoggedIn()) {
                return true;
            }
            return (bool) $this->httpContext->getValue(CustomerContext::CONTEXT_AUTH);
        } catch (\Throwable $e) {
            $this->logger->error('SidebarWidgets::isLoggedIn: auth state lookup failed', ['exception' => $e]);
            return false;
        }
    }

    /**
     * Up to `RECENT_ORDER_LIMIT` most-recent orders for the current
     * customer. Caches the collection on the instance so repeated
     * calls from inside a single template render resolve in-memory.
     *
     * @return \Magento\Sales\Model\Order[]
     */
    public function getRecentOrders(): array
    {
        if ($this->recentOrders !== null) {
            return $this->recentOrders;
        }
        $this->recentOrders = [];

        try {
            if (!$this->isLoggedIn()) {
                return $this->recentOrders;
            }
            $customerId = $this->resolveCustomerId();
            if ($customerId <= 0) {
                return $this->recentOrders;
            }

            $collection = $this->orderCollectionFactory->create();
            $collection->addAttributeToFilter('customer_id', $customerId);
            $collection->addOrder('created_at', 'DESC');
            $collection->setPageSize(self::RECENT_ORDER_LIMIT);

            $items = [];
            foreach ($collection as $order) {
                $items[] = $order;
            }
            $this->recentOrders = $items;
        } catch (\Throwable $e) {
            $this->logger->error(
                'SidebarWidgets::getRecentOrders: order collection load failed',
                ['exception' => $e]
            );
            $this->recentOrders = [];
        }

        return $this->recentOrders;
    }

    /**
     * Customer id resolution that copes with both fresh request cycles
     * (where CustomerSession::getCustomerId() works) AND cached /
     * late-init contexts where the storage key has not been hydrated
     * yet. We poke the session's getCustomer() proxy to trigger the
     * internal loadCustomer() if it hasn't fired yet, then read the
     * id off the resolved Customer entity. Any throw falls back to 0.
     */
    private function resolveCustomerId(): int
    {
        try {
            $id = (int) $this->customerSession->getCustomerId();
            if ($id > 0) {
                return $id;
            }
            // Fallback: force the proxy to resolve the customer entity.
            $id = (int) $this->customerSession->getCustomer()->getId();
            if ($id > 0) {
                return $id;
            }
        } catch (\Throwable $e) {
            $this->logger->warning(
                'SidebarWidgets::resolveCustomerId: customer resolution failed, widget hidden',
                ['exception' => $e]
            );
        }
        return 0;
    }

    public function getWishlistItemCount(): int
    {
        try {
            return (int) $this->wishlistHelper->getItemCount();
        } catch (\Throwable $e) {
            $this->logger->error('SidebarWidgets::getWishlistItemCount: wishlist count failed', ['exception' => $e]);
            return 0;
        }
    }

    public function getWishlistItems(int $limit = 4): array
    {
        try {
            $collection = $this->wishlistHelper->getWishlist()->getItemCollection();
            $collection->setPageSize($limit);
            $result = [];
            foreach ($collection as $item) {
                $result[] = $item;
            }
            return $result;
        } catch (\Throwable $e) {
            $this->logger->error('SidebarWidgets::getWishlistItems: wishlist items load failed', ['exception' => $e]);
            return [];
        }
    }

    public function getCompareItemCount(): int
    {
        try {
            return (int) $this->compareHelper->getItemCount();
        } catch (\Throwable $e) {
            $this->logger->error('SidebarWidgets::getCompareItemCount: compare count failed', ['exception' => $e]);
            return 0;
        }
    }
}

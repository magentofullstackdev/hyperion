<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Plugin\Wishlist\Controller\Shared;

use Magento\Framework\Controller\Result\ForwardFactory;
use Magento\Framework\Controller\ResultInterface;
use Magento\Wishlist\Controller\Shared\Index;
use Magento\Wishlist\Controller\Shared\WishlistProvider;

/**
 * Answers 404 for a shared wish list link that is unknown or no longer
 * shared. Core renders the page anyway and its header block then throws
 * (no customer to name the list after), which turns every stale link a
 * crawler follows into an HTTP 500.
 */
class IndexPlugin
{
    /**
     * @param WishlistProvider $wishlistProvider
     * @param ForwardFactory $forwardFactory
     */
    public function __construct(
        private readonly WishlistProvider $wishlistProvider,
        private readonly ForwardFactory $forwardFactory
    ) {
    }

    /**
     * Forward to the 404 page when there is no shared wish list to show.
     *
     * @param Index $subject
     * @param callable $proceed
     * @return ResultInterface
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function aroundExecute(Index $subject, callable $proceed): ResultInterface
    {
        /** @var \Magento\Wishlist\Model\Wishlist|false $wishlist core documents the model only, but returns false */
        $wishlist = $this->wishlistProvider->getWishlist();
        if (!$wishlist || !$wishlist->getCustomerId()) {
            return $this->forwardFactory->create()->forward('noroute');
        }

        return $proceed();
    }
}

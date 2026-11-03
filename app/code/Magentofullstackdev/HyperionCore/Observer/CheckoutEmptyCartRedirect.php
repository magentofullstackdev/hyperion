<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Observer;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\UrlInterface;

class CheckoutEmptyCartRedirect implements ObserverInterface
{
    /**
     * @param CheckoutSession $checkoutSession
     * @param UrlInterface $url
     */
    public function __construct(
        private readonly CheckoutSession $checkoutSession,
        private readonly UrlInterface $url
    ) {
    }

    /**
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        $quote = $this->checkoutSession->getQuote();

        if ((int) $quote->getItemsCount() > 0) {
            return;
        }

        $controllerAction = $observer->getEvent()->getData('controller_action');
        if ($controllerAction === null) {
            return;
        }

        $controllerAction->getResponse()->setRedirect(
            $this->url->getUrl('checkout/cart')
        );
    }
}

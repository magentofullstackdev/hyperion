<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Block\Order;

use Magento\Framework\View\Element\Template;
use Magento\Sales\Model\Order;
use Psr\Log\LoggerInterface;

/**
 * Order status pill + actions row (`#hyperion-order-actions`) of the
 * account order pages.
 *
 * Rendered in two places with the same template:
 *   - as child `actions` of the order / invoice / shipment / credit memo
 *     view block (theme Magento_Sales layouts), reading the order from
 *     its parent block;
 *   - from the fragment-only handle `hyperion_customer_order_actions` by
 *     Controller\Order\Cancel, with `order`, `show_actions` and `oob` set
 *     as block data, so a cancellation swaps the row out-of-band.
 */
class Actions extends Template
{
    /**
     * @param Template\Context $context
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * The order: block data first, then the parent block's `getOrder()`.
     *
     * @return Order|null
     */
    public function getOrder(): ?Order
    {
        $order = $this->getData('order');
        if ($order instanceof Order) {
            return $order;
        }

        try {
            $parent = $this->getParentBlock();
            if ($parent && method_exists($parent, 'getOrder')) {
                $order = $parent->getOrder();
                return $order instanceof Order ? $order : null;
            }
        } catch (\Throwable $e) {
            $this->logger->error('Order\Actions::getOrder -- ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Whether the reorder / print / cancel buttons are wanted (the
     * `show_actions` layout argument of the parent, or block data).
     *
     * @return bool
     */
    public function showActions(): bool
    {
        if ($this->hasData('show_actions')) {
            return (bool) $this->getData('show_actions');
        }

        $parent = $this->getParentBlock();

        return $parent ? (bool) $parent->getData('show_actions') : false;
    }

    /**
     * @inheritdoc
     */
    protected function _toHtml(): string
    {
        return $this->getOrder() === null ? '' : parent::_toHtml();
    }
}

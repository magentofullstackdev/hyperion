<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\ViewModel\Sales;

use Magento\Customer\Model\Context as CustomerContext;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Sales\Helper\Reorder as ReorderHelper;
use Magento\Sales\Model\Order;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use Magentofullstackdev\HyperionCustomer\Model\OrderCancellation;

/**
 * Reorder / print / cancel actions for the order pages.
 *
 * Mirrors Magento\Sales\Block\Order\Info\Buttons (plus the
 * Magento_OrderCancellationUi button) so the Hyperion order templates can
 * render the actions from any order block (view, invoice, shipment,
 * credit memo, history, recent orders), for customers and guests alike.
 */
class OrderActions implements ArgumentInterface
{
    /**
     * @param ReorderHelper $reorderHelper
     * @param HttpContext $httpContext
     * @param UrlInterface $urlBuilder
     * @param OrderCancellation $orderCancellation
     * @param FormKey $formKey
     * @param Availability $availability
     */
    public function __construct(
        private readonly ReorderHelper $reorderHelper,
        private readonly HttpContext $httpContext,
        private readonly UrlInterface $urlBuilder,
        private readonly OrderCancellation $orderCancellation,
        private readonly FormKey $formKey,
        private readonly Availability $availability
    ) {
    }

    /**
     * Whether the order can be reordered by the current visitor.
     *
     * @param Order $order
     * @return bool
     */
    public function canReorder(Order $order): bool
    {
        return $this->availability->canPurchase()
            && $this->reorderHelper->canReorder((int) $order->getEntityId());
    }

    /**
     * Reorder POST url, guest aware.
     *
     * @param Order $order
     * @return string
     */
    public function getReorderUrl(Order $order): string
    {
        return $this->getOrderUrl('reorder', $order);
    }

    /**
     * Print order url, guest aware.
     *
     * @param Order $order
     * @return string
     */
    public function getPrintUrl(Order $order): string
    {
        return $this->getOrderUrl('print', $order);
    }

    /**
     * Whether the signed-in customer may cancel the order (optional feature,
     * false when Magento_OrderCancellation is absent or disabled).
     *
     * @param Order $order
     * @return bool
     */
    public function canCancel(Order $order): bool
    {
        return $this->isLoggedIn() && $this->orderCancellation->canCancel($order);
    }

    /**
     * Cancellation reasons offered for the order, empty when it cannot be cancelled.
     *
     * @param Order $order
     * @return string[]
     */
    public function getCancellationReasons(Order $order): array
    {
        return $this->canCancel($order) ? $this->orderCancellation->getReasons($order) : [];
    }

    /**
     * Hyperion cancel endpoint (POST, form key + order_id + reason).
     *
     * @return string
     */
    public function getCancelUrl(): string
    {
        return $this->urlBuilder->getUrl('hyperion/order/cancel');
    }

    /**
     * Form key for the POST actions rendered outside a `formkey` block.
     *
     * @return string
     */
    public function getFormKey(): string
    {
        return (string) $this->formKey->getFormKey();
    }

    /**
     * Build a sales/order or sales/guest url for the order.
     *
     * @param string $action
     * @param Order $order
     * @return string
     */
    private function getOrderUrl(string $action, Order $order): string
    {
        $area = $this->isLoggedIn() ? 'order' : 'guest';

        return $this->urlBuilder->getUrl(
            'sales/' . $area . '/' . $action,
            ['order_id' => $order->getId()]
        );
    }

    /**
     * @return bool
     */
    private function isLoggedIn(): bool
    {
        return (bool) $this->httpContext->getValue(CustomerContext::CONTEXT_AUTH);
    }
}

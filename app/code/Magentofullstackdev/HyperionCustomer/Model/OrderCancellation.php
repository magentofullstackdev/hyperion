<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Phrase;
use Magento\Sales\Model\Order;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;

/**
 * Self-service order cancellation, bridged to the optional
 * Magento_OrderCancellation module without a hard dependency on it.
 *
 * The core classes are resolved by name at run time and only when the
 * module is enabled, so Hyperion works on an install where the module is
 * absent or disabled. The rules mirror the GraphQL `cancelOrder` mutation
 * (`Magento\OrderCancellationGraphQl\Model\Validator\ValidateOrder`):
 * feature flag per store, order state, no shipment yet.
 */
class OrderCancellation
{
    private const MODULE_NAME = 'Magento_OrderCancellation';
    private const XML_PATH_ENABLED = 'sales/cancellation/enabled';
    private const CONFIG_CLASS = 'Magento\OrderCancellation\Model\Config\Config';
    private const CUSTOMER_CAN_CANCEL_CLASS = 'Magento\OrderCancellation\Model\CustomerCanCancel';
    private const CANCEL_ORDER_CLASS = 'Magento\OrderCancellation\Model\CancelOrder';

    /**
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     * @param ScopeConfigInterface $scopeConfig
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Whether the core cancellation module is installed and enabled.
     *
     * @return bool
     */
    public function isAvailable(): bool
    {
        return $this->moduleManager->isEnabled(self::MODULE_NAME) && class_exists(self::CANCEL_ORDER_CLASS);
    }

    /**
     * Whether the feature is switched on for the order's store.
     *
     * @param Order $order
     * @return bool
     */
    public function isEnabled(Order $order): bool
    {
        return $this->isAvailable()
            && $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE, $order->getStoreId());
    }

    /**
     * Why the order cannot be cancelled by its customer, null when it can.
     *
     * @param Order $order
     * @return Phrase|null
     */
    public function getBlocker(Order $order): ?Phrase
    {
        if (!$this->isEnabled($order)) {
            return __('Order cancellation is not enabled for requested store.');
        }

        $customerCanCancel = $this->resolve(self::CUSTOMER_CAN_CANCEL_CLASS);
        if ($customerCanCancel === null || !$customerCanCancel->execute($order)) {
            return __('Order already closed, complete, cancelled or on hold');
        }

        if ($order->hasShipments()) {
            return __('Order with one or more items shipped cannot be cancelled');
        }

        return null;
    }

    /**
     * @param Order $order
     * @return bool
     */
    public function canCancel(Order $order): bool
    {
        return $this->getBlocker($order) === null;
    }

    /**
     * Configured cancellation reasons for the order's store (labels).
     *
     * @param Order $order
     * @return string[]
     */
    public function getReasons(Order $order): array
    {
        if (!$this->isEnabled($order)) {
            return [];
        }

        $config = $this->resolve(self::CONFIG_CLASS);
        if ($config === null) {
            return [];
        }

        try {
            $reasons = $config->getCancellationReasons($order->getStore());
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion OrderCancellation: reading the reasons failed -- ' . $e->getMessage());
            return [];
        }

        return array_values(array_filter(array_map('strval', is_array($reasons) ? $reasons : [])));
    }

    /**
     * Cancel the order (refunding a paid one) and record the reason.
     *
     * @param Order $order
     * @param string $reason
     * @return Order
     * @throws LocalizedException
     */
    public function cancel(Order $order, string $reason): Order
    {
        $cancelOrder = $this->resolve(self::CANCEL_ORDER_CLASS);
        if ($cancelOrder === null) {
            throw new LocalizedException(__('Order cancellation is not enabled for requested store.'));
        }

        return $cancelOrder->execute($order, $reason);
    }

    /**
     * Instantiate an optional core class, null when it is not installed.
     *
     * @param string $className
     * @return object|null
     */
    private function resolve(string $className): ?object
    {
        if (!$this->isAvailable() || !class_exists($className)) {
            return null;
        }

        try {
            $instance = $this->objectManager->get($className);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion OrderCancellation: cannot build ' . $className . ' -- ' . $e->getMessage());
            return null;
        }

        return is_object($instance) ? $instance : null;
    }
}

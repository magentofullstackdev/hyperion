<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment;

use Magento\Payment\Api\PaymentMethodListInterface;
use Magento\Payment\Helper\Data as PaymentHelper;
use Psr\Log\LoggerInterface;

/**
 * The active payment methods of a store view and the renderer each one has.
 *
 * A method the checkout would offer (active, `canUseCheckout()`) without a
 * matching `RendererPool` entry is hidden from shoppers. This class finds
 * them. It must run in the frontend area: the pool is declared there only
 * (the console command loads that area's configuration first).
 */
class UnsupportedMethods
{
    /**
     * @param PaymentMethodListInterface $paymentMethodList
     * @param PaymentHelper $paymentHelper
     * @param RendererPool $rendererPool
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly PaymentMethodListInterface $paymentMethodList,
        private readonly PaymentHelper $paymentHelper,
        private readonly RendererPool $rendererPool,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Active methods offered in the checkout that no renderer serves.
     *
     * @param int $storeId
     * @return array<string, string> code => title
     */
    public function collect(int $storeId): array
    {
        $unsupported = [];
        foreach ($this->inspect($storeId) as $row) {
            if ($row['checkout'] && $row['entry'] === null) {
                $unsupported[$row['code']] = $row['title'];
            }
        }
        ksort($unsupported);
        return $unsupported;
    }

    /**
     * Every active method of the store view, with whether the checkout
     * offers it and the renderer entry that serves it.
     *
     * @param int $storeId
     * @return list<array{code: string, title: string, checkout: bool, entry: array<string, mixed>|null}>
     */
    public function inspect(int $storeId): array
    {
        $rows = [];
        foreach ($this->paymentMethodList->getActiveList($storeId) as $method) {
            $code = (string)$method->getCode();
            if ($code === '') {
                continue;
            }
            $rows[] = [
                'code' => $code,
                'title' => (string)$method->getTitle(),
                'checkout' => $this->canUseCheckout($code, $storeId),
                'entry' => $this->rendererPool->match($code),
            ];
        }
        return $rows;
    }

    /**
     * @param string $code
     * @param int $storeId
     * @return bool
     */
    private function canUseCheckout(string $code, int $storeId): bool
    {
        try {
            $instance = $this->paymentHelper->getMethodInstance($code);
            $instance->setStore($storeId);
            return (bool)$instance->canUseCheckout();
        } catch (\Throwable $e) {
            $this->logger->warning(sprintf(
                'Hyperion checkout: the payment method "%s" cannot be inspected on store %d: %s',
                $code,
                $storeId,
                $e->getMessage()
            ));
            return false;
        }
    }
}

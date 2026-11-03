<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Block\Compare;

use Magentofullstackdev\HyperionCatalog\ViewModel\CompareData;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\View\Element\Template;
use Psr\Log\LoggerInterface;

class Fragment extends Template
{
    /**
     * @param Template\Context $context
     * @param CompareData $compareData
     * @param CustomerSession $customerSession
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        private readonly CompareData $compareData,
        private readonly CustomerSession $customerSession,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * @return int
     */
    public function getItemCount(): int
    {
        try {
            return $this->compareData->getCompareItemCount();
        } catch (\Throwable $e) {
            $this->logger->error('Compare\Fragment::getItemCount -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * @return int[]
     */
    public function getProductIds(): array
    {
        try {
            return $this->compareData->getCompareProductIds();
        } catch (\Throwable $e) {
            $this->logger->error('Compare\Fragment::getProductIds -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return array<int, array{id: int, name: string, url: string}>
     */
    public function getItems(): array
    {
        try {
            return $this->compareData->getCompareItems();
        } catch (\Throwable $e) {
            $this->logger->error('Compare\Fragment::getItems -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return string
     */
    public function getCompareUrl(): string
    {
        try {
            return $this->compareData->getCompareUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Compare\Fragment::getCompareUrl -- ' . $e->getMessage());
            return '/catalog/product_compare';
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
                return ['hyperion_compare_customer_' . $customerId];
            }
            return ['hyperion_compare_anon'];
        } catch (\Throwable $e) {
            $this->logger->error('Compare\Fragment::getCacheKeyInfo -- ' . $e->getMessage());
            return ['hyperion_compare_anon'];
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

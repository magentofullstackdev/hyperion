<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Review\Model\ResourceModel\Rating\Option\Vote\CollectionFactory as VoteCollectionFactory;
use Magento\Review\Model\Review;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Star distribution of a product's approved reviews (5 stars: n, 4 stars: n, ...).
 *
 * Core keeps only the average (`rating_summary`); the distribution comes
 * from the votes table, averaged per review (a review with several ratings,
 * Quality / Value / Price, counts once with its mean rounded to a star) and
 * filtered to the approved reviews of the current store.
 */
class ReviewBreakdown implements ArgumentInterface
{
    /**
     * @param VoteCollectionFactory $voteCollectionFactory
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly VoteCollectionFactory $voteCollectionFactory,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param Product $product
     * @return array{total: int, average: float, stars: array<int, array{count: int, percent: int}>} stars keyed 5..1
     */
    public function getDistribution(Product $product): array
    {
        $stars = [];
        for ($star = 5; $star >= 1; $star--) {
            $stars[$star] = ['count' => 0, 'percent' => 0];
        }
        $total = 0;
        $sum = 0.0;
        try {
            $collection = $this->voteCollectionFactory->create();
            $select = $collection->getSelect();
            $select->reset(\Magento\Framework\DB\Select::COLUMNS)
                ->join(['r' => $collection->getTable('review')], 'r.review_id = main_table.review_id', [])
                ->join(['rs' => $collection->getTable('review_store')], 'rs.review_id = main_table.review_id', [])
                ->where('main_table.entity_pk_value = ?', (int) $product->getId())
                ->where('r.status_id = ?', Review::STATUS_APPROVED)
                ->where('rs.store_id = ?', (int) $this->storeManager->getStore()->getId())
                ->columns(['review_id' => 'main_table.review_id', 'avg_value' => new \Zend_Db_Expr('AVG(main_table.value)')])
                ->group('main_table.review_id');
            foreach ($collection->getConnection()->fetchAll($select) as $row) {
                $value = (float) $row['avg_value'];
                $star = (int) min(5, max(1, round($value)));
                $stars[$star]['count']++;
                $total++;
                $sum += $value;
            }
            if ($total > 0) {
                foreach ($stars as $star => $data) {
                    $stars[$star]['percent'] = (int) round($data['count'] / $total * 100);
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('ReviewBreakdown::getDistribution -- ' . $e->getMessage());
        }

        return ['total' => $total, 'average' => $total > 0 ? round($sum / $total, 1) : 0.0, 'stars' => $stars];
    }
}

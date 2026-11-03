<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Plugin\CatalogSearch;

use Magento\CatalogSearch\Model\Indexer\Fulltext;
use Magentofullstackdev\HyperionSearch\Model\Suggest\Cache as SuggestCache;
use Psr\Log\LoggerInterface;

/**
 * Drops the cached autocomplete answers whenever the fulltext index changes:
 * the indexer is the one place every product passes through on its way into
 * or out of the engine (a save in "Update on Save", the cron in "Update by
 * Schedule", imports, `indexer:reindex`). A cached answer that showed no
 * product carries no product tag, so nothing else would ever refresh it.
 * The plugin never throws: an index run must not fail on a cache.
 */
class FulltextIndexerPlugin
{
    public function __construct(
        private readonly SuggestCache $cache,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param Fulltext $subject
     * @param mixed $result
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterExecuteFull(Fulltext $subject, mixed $result = null): mixed
    {
        $this->flush();

        return $result;
    }

    /**
     * @param Fulltext $subject
     * @param mixed $result
     * @param int[] $ids
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterExecuteList(Fulltext $subject, mixed $result, array $ids): mixed
    {
        $this->flush();

        return $result;
    }

    /**
     * @param Fulltext $subject
     * @param mixed $result
     * @param mixed $id
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterExecuteRow(Fulltext $subject, mixed $result, mixed $id): mixed
    {
        $this->flush();

        return $result;
    }

    /**
     * @param Fulltext $subject
     * @param mixed $result
     * @param mixed $entityIds
     * @return mixed
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterExecute(Fulltext $subject, mixed $result, mixed $entityIds): mixed
    {
        $this->flush();

        return $result;
    }

    private function flush(): void
    {
        try {
            $this->cache->flush();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: suggest cache flush after indexing failed: ' . $e->getMessage());
        }
    }
}

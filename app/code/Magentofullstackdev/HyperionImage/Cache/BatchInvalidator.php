<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Cache;

use Magento\Catalog\Model\Product;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\Event\ManagerInterface as EventManager;
use Magento\Framework\Indexer\CacheContextFactory;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\ProductIdResolver;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Invalidates, once per batch, the cached pages of the products whose
 * images were converted, so they re-render with the new `<source>` tags.
 *
 * Invalidation is by cache tag only (`cat_p_<id>`), the same way core's
 * indexers do it: the tags are cleaned in the application cache
 * (block_html entries) and announced through `clean_cache_by_tags`, which
 * core's observers turn into a built-in page cache clean or a Varnish BAN
 * on `X-Magento-Tags`. Nothing is ever flushed store-wide from here: a
 * background job triggered by visitors must not be able to empty the cache.
 *
 * Files that belong to no product (category banners, wysiwyg images)
 * invalidate nothing; pages pick up their companions when their TTL ends.
 *
 * Lifecycle:
 *
 *   1. After each successful conversion the consumer / CLI calls
 *      `recordConversion()` with the source path.
 *   2. At batch end the CLI calls `flushIfDirty()`; the queue consumer
 *      does it from a shutdown function when its process exits.
 *
 * Can be switched off with `hyperion_image/general/invalidate_on_batch_end`.
 */
class BatchInvalidator
{
    /** @var array<string, true> */
    private array $sourcePaths = [];

    public function __construct(
        private readonly CacheInterface $cache,
        private readonly EventManager $eventManager,
        private readonly CacheContextFactory $cacheContextFactory,
        private readonly ProductIdResolver $productIdResolver,
        private readonly Config $config,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Remember a source file that received at least one new companion in this batch.
     */
    public function recordConversion(string $sourcePath): void
    {
        $this->sourcePaths[$sourcePath] = true;
    }

    /**
     * True when at least one conversion was recorded since the last flush.
     */
    public function isDirty(): bool
    {
        return $this->sourcePaths !== [];
    }

    /**
     * Invalidate the cache tags of the products behind the recorded files.
     *
     * Returns the number of products invalidated (0 when nothing was
     * recorded, the feature is off or no file belongs to a product).
     * Never throws: on failure the recorded files are kept so a later
     * attempt may succeed.
     */
    public function flushIfDirty(): int
    {
        if ($this->sourcePaths === []) {
            return 0;
        }
        if (!$this->config->isEnabled() || !$this->config->isInvalidateOnBatchEndEnabled()) {
            $this->sourcePaths = [];
            return 0;
        }

        try {
            $productIds = $this->productIdResolver->resolve(array_keys($this->sourcePaths));
            if ($productIds !== []) {
                $cacheContext = $this->cacheContextFactory->create();
                $cacheContext->registerEntities(Product::CACHE_TAG, $productIds);
                $this->eventManager->dispatch('clean_cache_by_tags', ['object' => $cacheContext]);
                $this->cache->clean($cacheContext->getIdentities());
                $this->logger->info(
                    sprintf('HyperionImage: invalidated the cache tags of %d product(s).', count($productIds))
                );
            }
            $this->sourcePaths = [];
            return count($productIds);
        } catch (Throwable $e) {
            $this->logger->warning(
                'HyperionImage: batch cache invalidation failed: ' . $e->getMessage(),
                ['exception' => $e]
            );
            return 0;
        }
    }
}

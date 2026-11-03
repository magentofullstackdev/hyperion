<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\EntityManager\MetadataPool;

/**
 * Maps converted files of the product image cache back to the products
 * that use them, through the media gallery tables.
 *
 * A cached file lives at `catalog/product/cache/<hash>/<gallery value>`,
 * where the gallery value (`/j/o/joust.jpg`) is what
 * `catalog_product_entity_media_gallery.value` stores. Files outside the
 * product image cache (category banners, wysiwyg) belong to no product
 * and resolve to nothing.
 */
class ProductIdResolver
{
    private const CACHE_PATH_PATTERN = '#/catalog/product/cache/[0-9a-f]+(/.+)$#';

    private const CHUNK_SIZE = 500;

    public function __construct(
        private readonly ResourceConnection $resourceConnection,
        private readonly MetadataPool $metadataPool
    ) {
    }

    /**
     * Gallery value for a file of the product image cache, null for any other path.
     */
    public function getGalleryValue(string $sourcePath): ?string
    {
        if (preg_match(self::CACHE_PATH_PATTERN, $sourcePath, $matches) !== 1) {
            return null;
        }
        return $matches[1];
    }

    /**
     * Ids of the products whose gallery holds at least one of the given files.
     *
     * @param string[] $sourcePaths
     * @return int[]
     */
    public function resolve(array $sourcePaths): array
    {
        $values = [];
        foreach ($sourcePaths as $sourcePath) {
            $value = $this->getGalleryValue($sourcePath);
            if ($value !== null) {
                $values[$value] = true;
            }
        }
        if ($values === []) {
            return [];
        }

        $linkField = $this->metadataPool->getMetadata(ProductInterface::class)->getLinkField();
        $connection = $this->resourceConnection->getConnection();
        $productIds = [];
        foreach (array_chunk(array_keys($values), self::CHUNK_SIZE) as $chunk) {
            $select = $connection->select()
                ->distinct()
                ->from(
                    ['gallery' => $this->resourceConnection->getTableName('catalog_product_entity_media_gallery')],
                    []
                )
                ->join(
                    ['link' => $this->resourceConnection->getTableName(
                        'catalog_product_entity_media_gallery_value_to_entity'
                    )],
                    'link.value_id = gallery.value_id',
                    []
                )
                ->join(
                    ['product' => $this->resourceConnection->getTableName('catalog_product_entity')],
                    'product.' . $linkField . ' = link.' . $linkField,
                    ['entity_id']
                )
                ->where('gallery.value IN (?)', $chunk);
            foreach ($connection->fetchCol($select) as $productId) {
                $productIds[(int) $productId] = true;
            }
        }

        return array_keys($productIds);
    }
}

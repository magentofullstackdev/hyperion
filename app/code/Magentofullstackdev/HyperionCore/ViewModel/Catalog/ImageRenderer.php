<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel\Catalog;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Model\Product;
use Magento\Framework\View\Element\Block\ArgumentInterface;

/**
 * Wraps Magento\Catalog\Helper\Image so templates no longer call $this->helper().
 */
class ImageRenderer implements ArgumentInterface
{
    public function __construct(
        private readonly ImageHelper $imageHelper
    ) {
    }

    /**
     * Initialize the image helper for a given product and image ID, then return the URL.
     *
     * @param Product $product
     * @param string $imageId e.g. 'category_page_grid', 'product_page_image_large'
     * @param string $imageFile Optional specific file from the media gallery.
     */
    public function getUrl(Product $product, string $imageId, string $imageFile = ''): string
    {
        $helper = $this->imageHelper->init($product, $imageId);
        if ($imageFile !== '') {
            $helper->setImageFile($imageFile);
        }
        return $helper->getUrl();
    }
}

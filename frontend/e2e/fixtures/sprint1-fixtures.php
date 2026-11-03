<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Fixtures for the catalog completeness live check (e2e/pw-catalog-completeness.mjs). Runs inside php-fpm as www-data:
//   php /tmp/sprint1-fixtures.php /var/www/html apply    MAP on the configurable MH01 (msrp 99 on every child,
//                                                        display type "on gesture", sales/msrp/enabled on),
//                                                        a YouTube video entry on 24-MB01, a stock threshold of 1000000 (above any sample quantity, restocks included)
//                                                        and quantity increments of 2 (store config)
//   php /tmp/sprint1-fixtures.php /var/www/html remove   undoes all of it
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = $argv[2] ?? 'apply';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$config = $om->get(\Magento\Framework\App\Config\Storage\WriterInterface::class);
$productRepo = $om->get(\Magento\Catalog\Api\ProductRepositoryInterface::class);
$configurable = $productRepo->get('MH01');
$children = $om->get(\Magento\ConfigurableProduct\Model\Product\Type\Configurable::class)->getUsedProducts($configurable);
$out = [];

if ($action === 'remove') {
    foreach ([$configurable, ...$children] as $product) {
        $product->setData('msrp', null)->setData('msrp_display_actual_price_type', null);
        $productRepo->save($product);
    }
    $config->delete('sales/msrp/enabled');
    $config->delete('cataloginventory/options/stock_threshold_qty');
    $config->delete('cataloginventory/item_options/enable_qty_increments');
    $config->delete('cataloginventory/item_options/qty_increments');
    $bag = $productRepo->get('24-MB01');
    $gallery = $om->get(\Magento\Catalog\Api\ProductAttributeMediaGalleryManagementInterface::class);
    foreach ($gallery->getList('24-MB01') as $entry) {
        if ($entry->getMediaType() === 'external-video') {
            $gallery->remove('24-MB01', (int) $entry->getId());
        }
    }
    echo json_encode(['removed' => true]) . "\n";
    exit(0);
}

$config->save('sales/msrp/enabled', 1);
foreach ($children as $child) {
    $child->setData('msrp', 99)->setData('msrp_display_actual_price_type', \Magento\Msrp\Model\Product\Attribute\Source\Type::TYPE_ON_GESTURE);
    $productRepo->save($child);
}
$configurable->setData('msrp_display_actual_price_type', \Magento\Msrp\Model\Product\Attribute\Source\Type::TYPE_ON_GESTURE);
$productRepo->save($configurable);
$out['msrp_children'] = count($children);

$config->save('cataloginventory/options/stock_threshold_qty', 1000000);
$config->save('cataloginventory/item_options/enable_qty_increments', 1);
$config->save('cataloginventory/item_options/qty_increments', 2);
$stockQty = (float) $om->get(\Magento\CatalogInventory\Api\StockRegistryInterface::class)->getStockItemBySku('24-MB01')->getQty();
$out['bag_qty'] = $stockQty;

try {
    $gallery = $om->get(\Magento\Catalog\Api\ProductAttributeMediaGalleryManagementInterface::class);
    $hasVideo = false;
    foreach ($gallery->getList('24-MB01') as $entry) {
        $hasVideo = $hasVideo || $entry->getMediaType() === 'external-video';
    }
    if (!$hasVideo) {
        $bag = $productRepo->get('24-MB01');
        $mediaDir = $om->get(\Magento\Framework\Filesystem::class)->getDirectoryRead(\Magento\Framework\App\Filesystem\DirectoryList::MEDIA);
        $posterPath = 'catalog/product' . $bag->getImage();
        $entry = $om->get(\Magento\Catalog\Api\Data\ProductAttributeMediaGalleryEntryInterfaceFactory::class)->create();
        $content = $om->get(\Magento\Framework\Api\Data\ImageContentInterfaceFactory::class)->create();
        $content->setBase64EncodedData(base64_encode($mediaDir->readFile($posterPath)))
            ->setType('image/jpeg')->setName('spec021-video-poster.jpg');
        $video = $om->get(\Magento\Framework\Api\Data\VideoContentInterfaceFactory::class)->create();
        $video->setMediaType('external-video')->setVideoProvider('youtube')
            ->setVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')->setVideoTitle('Hyperion e2e video')
            ->setVideoDescription('')->setVideoMetadata('');
        $entry->setMediaType('external-video')->setLabel('Hyperion e2e video')->setPosition(99)->setDisabled(false)
            ->setTypes([])->setContent($content);
        $entry->setExtensionAttributes($om->get(\Magento\Catalog\Api\Data\ProductAttributeMediaGalleryEntryExtensionFactory::class)->create()->setVideoContent($video));
        $out['video_entry'] = (int) $gallery->create('24-MB01', $entry);
    } else {
        $out['video_entry'] = 'exists';
    }
} catch (\Throwable $e) {
    $out['video_entry'] = 'failed: ' . $e->getMessage();
}
echo json_encode($out) . "\n";

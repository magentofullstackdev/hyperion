<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Fixture for the infinite loading live check (e2e/pw-infinite-scroll.mjs). Runs inside php-fpm as www-data:
//   php /tmp/infinite-scroll-fixture.php /var/www/html apply <url_key> <mode>   sets the category's
//                                                        `hyperion_infinite_scroll` attribute (default scope)
//   php /tmp/infinite-scroll-fixture.php /var/www/html remove <url_key>         clears it
// Prints a JSON summary the check reads.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = $argv[2] ?? 'apply';
$urlKey = $argv[3] ?? '';
$mode = $argv[4] ?? '';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$collection = $om->get(\Magento\Catalog\Model\ResourceModel\Category\CollectionFactory::class)->create()
    ->setStoreId(0)
    ->addAttributeToFilter('url_key', $urlKey)
    ->addAttributeToSelect(['name', 'hyperion_infinite_scroll']);
$category = $collection->getFirstItem();
if (!$category->getId()) {
    echo json_encode(['error' => 'category not found: ' . $urlKey]) . "\n";
    exit(1);
}
/** @var \Magento\Catalog\Model\Category $category */
$category = $om->get(\Magento\Catalog\Api\CategoryRepositoryInterface::class)->get((int) $category->getId(), 0);
$category->setStoreId(0);
$category->setData('hyperion_infinite_scroll', $action === 'remove' ? null : $mode);
$category->getResource()->saveAttribute($category, 'hyperion_infinite_scroll');
echo json_encode(['category_id' => (int) $category->getId(), 'name' => $category->getName(), 'value' => $category->getData('hyperion_infinite_scroll')]) . "\n";

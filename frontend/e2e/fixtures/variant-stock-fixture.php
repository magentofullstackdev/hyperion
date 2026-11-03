<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Fixture for the variant stock check (e2e/pw-variant-stock.mjs). Runs inside php-fpm as www-data:
//   php /tmp/variant-stock-fixture.php /var/www/html set <sku> <qty>   sets the stock quantity of one simple
//                                                                      (a child of a configurable) through the
//                                                                      stock registry, so MSI's legacy sync sees it,
//                                                                      and prints the previous quantity as JSON
//   php /tmp/variant-stock-fixture.php /var/www/html set <sku> <qty>   again with the printed quantity restores it
// Reindex cataloginventory_stock (and inventory on MSI) and flush the cache afterwards.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = $argv[2] ?? 'set';
$sku = (string) ($argv[3] ?? '');
$qty = (float) ($argv[4] ?? 0);
if ($action !== 'set' || $sku === '') {
    fwrite(STDERR, "usage: php variant-stock-fixture.php <root> set <sku> <qty>\n");
    exit(2);
}
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$registry = $om->get(\Magento\CatalogInventory\Api\StockRegistryInterface::class);
$item = $registry->getStockItemBySku($sku);
$previous = (float) $item->getQty();
$item->setQty($qty);
$item->setIsInStock($qty > 0);
$registry->updateStockItemBySku($sku, $item);
echo json_encode(['sku' => $sku, 'previous_qty' => $previous, 'qty' => $qty]) . "\n";

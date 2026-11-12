<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Decimal quantity fixture for the cart live check (e2e/pw-cart-features.mjs). Runs inside php-fpm as www-data:
//   php /tmp/decimal-qty-fixture.php /var/www/html <sku>            makes the quantity of one simple product decimal
//                                                                   (`is_qty_decimal` of its stock item, through the
//                                                                   stock registry) and prints the previous flag as JSON
//   php /tmp/decimal-qty-fixture.php /var/www/html <sku> --remove   puts the previous flag back
// The previous flag is kept in var/tmp/hyperion-decimal-qty-fixture-<sku>.json until --remove. Quote lines that
// carry a decimal quantity of the product stay as they are: empty the test cart before --remove.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$sku = (string) ($argv[2] ?? '');
$remove = in_array('--remove', $argv, true);
if ($sku === '' || str_starts_with($sku, '--')) {
    fwrite(STDERR, "usage: php decimal-qty-fixture.php <root> <sku> [--remove]\n");
    exit(2);
}
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$registry = $om->get(\Magento\CatalogInventory\Api\StockRegistryInterface::class);
$snapshotFile = $root . '/var/tmp/hyperion-decimal-qty-fixture-' . preg_replace('/[^A-Za-z0-9_-]/', '_', $sku) . '.json';
$item = $registry->getStockItemBySku($sku);
$current = (bool) $item->getIsQtyDecimal();

if ($remove) {
    if (!is_file($snapshotFile)) {
        echo json_encode(['sku' => $sku, 'removed' => false, 'reason' => 'no snapshot: the fixture is not applied']) . "\n";
        exit(0);
    }
    $before = json_decode((string) file_get_contents($snapshotFile), true);
    $previous = (bool) ($before['is_qty_decimal'] ?? false);
    $item->setIsQtyDecimal($previous);
    $registry->updateStockItemBySku($sku, $item);
    unlink($snapshotFile);
    echo json_encode(['sku' => $sku, 'removed' => true, 'is_qty_decimal' => $previous]) . "\n";
    exit(0);
}

if (!is_file($snapshotFile)) {
    if (!is_dir(dirname($snapshotFile))) {
        mkdir(dirname($snapshotFile), 0775, true);
    }
    file_put_contents($snapshotFile, json_encode(['is_qty_decimal' => $current]));
}
$item->setIsQtyDecimal(true);
$registry->updateStockItemBySku($sku, $item);
echo json_encode(['sku' => $sku, 'applied' => true, 'previous_is_qty_decimal' => $current]) . "\n";

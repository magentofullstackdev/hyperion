<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Takes ONE simple product out of stock and puts it back, for the live check of an item that sells out between the
// load of the checkout and the order (e2e/pw-checkout-flow.mjs). Runs inside php-fpm as www-data:
//   php /tmp/stock-zero-fixture.php /var/www/html --apply [sku]    sets the quantity to 0 and "out of stock" through
//                                                                  the stock registry, reindexes that one product and
//                                                                  prints the quantity it found as JSON
//   php /tmp/stock-zero-fixture.php /var/www/html --remove [sku]   puts the quantity and the stock status back
// The default product is the Luma sample `24-UG07` (Dual Handle Cardio Ball), which no other script of this directory
// buys. The values found before the first apply are kept in var/tmp/hyperion-stock-zero-fixture-<sku>.json until
// --remove, so applying twice does not lose them.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$apply = in_array('--apply', $argv, true);
$remove = in_array('--remove', $argv, true);
$positional = array_values(array_filter(array_slice($argv, 2), static fn (string $arg): bool => !str_starts_with($arg, '--')));
$sku = (string) ($positional[0] ?? '24-UG07');
if ($apply === $remove) {
    fwrite(STDERR, "usage: php stock-zero-fixture.php <root> --apply|--remove [sku]\n");
    exit(2);
}
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$registry = $om->get(\Magento\CatalogInventory\Api\StockRegistryInterface::class);
$snapshotFile = $root . '/var/tmp/hyperion-stock-zero-fixture-' . preg_replace('/[^A-Za-z0-9_-]/', '_', $sku) . '.json';

$write = static function (float $qty, bool $inStock) use ($om, $registry, $sku): void {
    $item = $registry->getStockItemBySku($sku);
    $item->setQty($qty);
    $item->setIsInStock($inStock);
    $registry->updateStockItemBySku($sku, $item);
    $om->get(\Magento\CatalogInventory\Model\Indexer\Stock\Processor::class)->reindexRow((int) $item->getProductId(), true);
};

if ($remove) {
    if (!is_file($snapshotFile)) {
        echo json_encode(['removed' => false, 'sku' => $sku, 'reason' => 'no snapshot: the fixture is not applied']) . "\n";
        exit(0);
    }
    $before = json_decode((string) file_get_contents($snapshotFile), true);
    if (!is_array($before) || !isset($before['qty'], $before['is_in_stock'])) {
        fwrite(STDERR, "unreadable snapshot $snapshotFile\n");
        exit(1);
    }
    $write((float) $before['qty'], (bool) $before['is_in_stock']);
    unlink($snapshotFile);
    echo json_encode(['removed' => true, 'sku' => $sku, 'qty' => (float) $before['qty'], 'is_in_stock' => (bool) $before['is_in_stock']]) . "\n";
    exit(0);
}

$item = $registry->getStockItemBySku($sku);
if (!$item->getProductId()) {
    fwrite(STDERR, "no product with the SKU $sku\n");
    exit(1);
}
if (!is_file($snapshotFile)) {
    if (!is_dir(dirname($snapshotFile))) {
        mkdir(dirname($snapshotFile), 0775, true);
    }
    file_put_contents($snapshotFile, json_encode(['qty' => (float) $item->getQty(), 'is_in_stock' => (bool) $item->getIsInStock()]));
}
$before = json_decode((string) file_get_contents($snapshotFile), true);
$write(0.0, false);
echo json_encode(['applied' => true, 'sku' => $sku, 'previous_qty' => (float) $before['qty'], 'previous_is_in_stock' => (bool) $before['is_in_stock']]) . "\n";

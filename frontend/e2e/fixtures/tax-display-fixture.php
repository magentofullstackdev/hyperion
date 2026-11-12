<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Tax display fixture for the live checks of prices including tax (e2e/pw-cart-features.mjs,
// e2e/pw-catalog-completeness.mjs). Runs inside php-fpm as www-data:
//   php /tmp/tax-display-fixture.php /var/www/html            catalog prices entered excluding tax and SHOWN including
//                                                             tax in the catalog, the cart (prices, subtotal) and for
//                                                             shipping; shipping taxed with the product tax class; the
//                                                             default tax destination is the one destination an existing
//                                                             tax rule covers for guests (the sample data rule: United
//                                                             States, Michigan, 8.25 %). Nothing is created in the tax
//                                                             tables. Prints the destination and the rate as JSON;
//                                                             `applied: false` with a reason when no rule covers guests.
//   php /tmp/tax-display-fixture.php /var/www/html --remove   puts every tax/* configuration row back as it was: a row
//                                                             that did not exist is deleted (the tax/notification/ignore_*
//                                                             rows core writes when a tax display field is saved too),
//                                                             a changed one gets its value back.
// The rows found before the first apply are kept in var/tmp/hyperion-tax-display-fixture.json until --remove.
// Flush the cache after each call.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$remove = in_array('--remove', $argv, true);
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$resource = $om->get(\Magento\Framework\App\ResourceConnection::class);
$db = $resource->getConnection();
$configTable = $resource->getTableName('core_config_data');
$snapshotFile = $root . '/var/tmp/hyperion-tax-display-fixture.json';

$taxRows = static function () use ($db, $configTable): array {
    $rows = [];
    $select = $db->select()->from($configTable, ['scope', 'scope_id', 'path', 'value'])->where('path LIKE ?', 'tax/%');
    foreach ($db->fetchAll($select) as $row) {
        $rows[$row['scope'] . '|' . $row['scope_id'] . '|' . $row['path']] = $row['value'];
    }
    return $rows;
};

if ($remove) {
    if (!is_file($snapshotFile)) {
        echo json_encode(['removed' => false, 'reason' => 'no snapshot: the fixture is not applied']) . "\n";
        exit(0);
    }
    $before = json_decode((string) file_get_contents($snapshotFile), true);
    if (!is_array($before)) {
        fwrite(STDERR, "unreadable snapshot $snapshotFile\n");
        exit(1);
    }
    $deleted = 0;
    $restored = 0;
    foreach ($taxRows() as $key => $value) {
        [$scope, $scopeId, $path] = explode('|', $key, 3);
        $where = ['scope = ?' => $scope, 'scope_id = ?' => (int) $scopeId, 'path = ?' => $path];
        if (!array_key_exists($key, $before)) {
            $deleted += $db->delete($configTable, $where);
        } elseif ($before[$key] !== $value) {
            $restored += $db->update($configTable, ['value' => $before[$key]], $where);
        }
    }
    foreach (array_diff_key($before, $taxRows()) as $key => $value) {
        [$scope, $scopeId, $path] = explode('|', $key, 3);
        $db->insert($configTable, ['scope' => $scope, 'scope_id' => (int) $scopeId, 'path' => $path, 'value' => $value]);
        $restored++;
    }
    $same = $taxRows() == $before;
    if ($same) {
        unlink($snapshotFile);
    }
    echo json_encode(['removed' => $same, 'deleted' => $deleted, 'restored' => $restored, 'rows' => count($before)]) . "\n";
    exit($same ? 0 : 1);
}

// The destination an existing rule taxes for guests (the customer tax class of the NOT LOGGED IN group).
$destination = $db->fetchRow(
    $db->select()
        ->from(['c' => $resource->getTableName('tax_calculation')], ['product_class' => 'product_tax_class_id'])
        ->join(
            ['r' => $resource->getTableName('tax_calculation_rate')],
            'r.tax_calculation_rate_id = c.tax_calculation_rate_id',
            ['country' => 'tax_country_id', 'region_id' => 'tax_region_id', 'postcode' => 'tax_postcode', 'rate']
        )
        ->join(
            ['g' => $resource->getTableName('customer_group')],
            'g.customer_group_id = 0 AND g.tax_class_id = c.customer_tax_class_id',
            []
        )
        ->where('r.rate > 0')
        ->order('c.tax_calculation_id ASC')
        ->limit(1)
);
if (!$destination) {
    echo json_encode(['applied' => false, 'reason' => 'no tax rule covers guests: nothing would be taxed']) . "\n";
    exit(0);
}
if (!is_file($snapshotFile)) {
    if (!is_dir(dirname($snapshotFile))) {
        mkdir(dirname($snapshotFile), 0775, true);
    }
    file_put_contents($snapshotFile, json_encode($taxRows()));
}
$config = $om->get(\Magento\Framework\App\Config\Storage\WriterInterface::class);
$values = [
    'tax/calculation/price_includes_tax' => '0',
    'tax/display/type' => '2',
    'tax/cart_display/price' => '2',
    'tax/cart_display/subtotal' => '2',
    'tax/display/shipping' => '2',
    'tax/cart_display/shipping' => '2',
    'tax/classes/shipping_tax_class' => (string) $destination['product_class'],
    'tax/defaults/country' => (string) $destination['country'],
    'tax/defaults/region' => (string) (int) $destination['region_id'],
    'tax/defaults/postcode' => (string) $destination['postcode'],
];
foreach ($values as $path => $value) {
    $config->save($path, $value);
}
$regionName = (string) $db->fetchOne(
    $db->select()
        ->from($resource->getTableName('directory_country_region'), ['default_name'])
        ->where('region_id = ?', (int) $destination['region_id'])
);
echo json_encode([
    'applied' => true,
    'country' => (string) $destination['country'],
    'region_id' => (int) $destination['region_id'],
    'region' => $regionName,
    'postcode' => (string) $destination['postcode'],
    'rate' => (float) $destination['rate'],
]) . "\n";

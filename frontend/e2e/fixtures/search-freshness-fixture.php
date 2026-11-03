<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Fixture for the suggest freshness check of e2e/pw-search-shield.mjs. Runs inside php-fpm as www-data:
//   php /tmp/search-freshness-fixture.php /var/www/html apply <word>    creates the in stock simple product
//                                                                       "Hyperion <word> Tester" (SKU HYP-FRESH-<WORD>,
//                                                                       visible in catalog and search, default website)
//   php /tmp/search-freshness-fixture.php /var/www/html remove <word>   deletes it (silent when it does not exist)
// Prints a JSON summary the check reads.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = $argv[2] ?? 'apply';
$word = preg_replace('/[^a-z0-9]/', '', strtolower((string) ($argv[3] ?? '')));
if ($word === '') {
    echo json_encode(['error' => 'usage: apply|remove <word>']) . "\n";
    exit(1);
}
$sku = 'HYP-FRESH-' . strtoupper($word);
$name = 'Hyperion ' . $word . ' Tester';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$om->get(\Magento\Framework\Registry::class)->register('isSecureArea', true);
$productRepo = $om->get(\Magento\Catalog\Api\ProductRepositoryInterface::class);

if ($action === 'remove') {
    try {
        $productRepo->deleteById($sku);
        echo json_encode(['removed' => true, 'sku' => $sku]) . "\n";
    } catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
        echo json_encode(['removed' => false, 'sku' => $sku]) . "\n";
    }
    exit(0);
}

try {
    $existing = $productRepo->get($sku);
    echo json_encode(['id' => (int) $existing->getId(), 'sku' => $sku, 'name' => $existing->getName(), 'created' => false]) . "\n";
    exit(0);
} catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
    // created below
}
$websiteId = (int) $om->get(\Magento\Store\Model\StoreManagerInterface::class)->getDefaultStoreView()->getWebsiteId();
/** @var \Magento\Catalog\Model\Product $product */
$product = $om->create(\Magento\Catalog\Model\Product::class);
$product->setStoreId(0)
    ->setTypeId(\Magento\Catalog\Model\Product\Type::TYPE_SIMPLE)
    ->setAttributeSetId((int) $product->getDefaultAttributeSetId())
    ->setSku($sku)
    ->setName($name)
    ->setUrlKey('hyperion-' . $word . '-tester')
    ->setPrice(12.0)
    ->setWeight(1.0)
    ->setStatus(\Magento\Catalog\Model\Product\Attribute\Source\Status::STATUS_ENABLED)
    ->setVisibility(\Magento\Catalog\Model\Product\Visibility::VISIBILITY_BOTH)
    ->setTaxClassId(0)
    ->setWebsiteIds([$websiteId])
    ->setStockData(['use_config_manage_stock' => 1, 'qty' => 100, 'is_in_stock' => 1]);
$saved = $productRepo->save($product);
echo json_encode(['id' => (int) $saved->getId(), 'sku' => $sku, 'name' => $name, 'created' => true]) . "\n";

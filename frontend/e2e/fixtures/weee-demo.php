<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// FPT demo for the cart features live check (e2e/pw-cart-features.mjs --with-fpt). Creates a Fixed Product Tax attribute
// "hyperion_fpt" ("Recycling fee") on the Default attribute set, puts 5.00 (US) on product 24-MB01 (Joust Duffle Bag)
// and turns tax/weee on (display mode 2: excluding FPT, FPT description, final price). --remove deletes the attribute
// and every tax/weee row it wrote. Reindex prices + flush afterwards.
// Usage: docker compose cp e2e/fixtures/weee-demo.php php-fpm:/tmp/ then, inside php-fpm as www-data,
//   php /tmp/weee-demo.php /var/www/html [--remove]
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$remove = in_array('--remove', $argv, true);
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$config = $om->get(\Magento\Framework\App\Config\Storage\WriterInterface::class);
$attrRepo = $om->get(\Magento\Catalog\Api\ProductAttributeRepositoryInterface::class);
$productRepo = $om->get(\Magento\Catalog\Api\ProductRepositoryInterface::class);
$code = 'hyperion_fpt';
if ($remove) {
    try { $attrRepo->deleteById($code); echo "attribute removed\n"; } catch (\Throwable $e) { echo "attribute: " . $e->getMessage() . "\n"; }
    foreach (['enable', 'include_in_subtotal', 'display', 'display_list', 'display_sales'] as $key) {
        $config->delete('tax/weee/' . $key);
    }
    echo "tax/weee/* rows removed\n";
    exit(0);
}
try {
    $attribute = $attrRepo->get($code);
    echo "attribute exists (id {$attribute->getAttributeId()})\n";
} catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
    $eavSetupFactory = $om->get(\Magento\Eav\Setup\EavSetupFactory::class);
    $setup = $eavSetupFactory->create();
    $setup->addAttribute(\Magento\Catalog\Model\Product::ENTITY, $code, [
        'type' => 'static',
        'label' => 'Recycling fee',
        'input' => 'weee',
        'backend' => \Magento\Weee\Model\Attribute\Backend\Weee\Tax::class,
        'frontend' => '',
        'required' => false,
        'global' => \Magento\Eav\Model\Entity\Attribute\ScopedAttributeInterface::SCOPE_GLOBAL,
        'visible' => true,
        'user_defined' => true,
        'group' => 'Product Details',
        'used_in_product_listing' => true,
        'is_used_in_grid' => false,
    ]);
    $attribute = $attrRepo->get($code);
    echo "attribute created (id {$attribute->getAttributeId()})\n";
}
$config->save('tax/weee/enable', 1);
$config->save('tax/weee/include_in_subtotal', 0);
$config->save('tax/weee/display', 2);
$config->save('tax/weee/display_list', 2);
$config->save('tax/weee/display_sales', 2);
echo "tax/weee/enable = 1, display = 2 (excl FPT, FPT description, final price)\n";
$product = $productRepo->get('24-MB01');
$product->setData($code, [['website_id' => 0, 'country' => 'US', 'state' => 0, 'price' => 5.00, 'delete' => '']]);
$productRepo->save($product);
echo "24-MB01 saved with 5.00 FPT (US)\n";

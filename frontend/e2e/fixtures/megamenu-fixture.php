<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Fixture for the mega menu live check (e2e/pw-megamenu.mjs). Runs inside php-fpm as www-data:
//   php /tmp/megamenu-fixture.php /var/www/html apply    creates the `main_navigation` group (all websites, both
//                                                        devices): the categories imported, Women as a 12 column mega
//                                                        panel with a promo CMS block column, a SALE badge on Men,
//                                                        a custom link, an `empty` label with system links, a store
//                                                        view title override on Gear, a disabled item
//   php /tmp/megamenu-fixture.php /var/www/html remove   deletes the group and the CMS block
// Prints a JSON summary the check reads.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = $argv[2] ?? 'apply';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');

$identifier = 'main_navigation';
$blockIdentifier = 'hyperion-megamenu-promo';
$groupFactory = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\GroupFactory::class);
$groupResource = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group::class);
$groups = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group\CollectionFactory::class)->create()
    ->addFieldToFilter('identifier', $identifier)->getItems();
$blockRepo = $om->get(\Magento\Cms\Api\BlockRepositoryInterface::class);
$blocks = $blockRepo->getList(
    $om->get(\Magento\Framework\Api\SearchCriteriaBuilder::class)->addFilter('identifier', $blockIdentifier)->create()
)->getItems();

if ($action === 'remove') {
    foreach ($groups as $group) {
        $groupResource->delete($group);
    }
    foreach ($blocks as $block) {
        $blockRepo->delete($block);
    }
    echo json_encode(['removed' => true]) . "\n";
    exit(0);
}

foreach ($groups as $group) {
    $groupResource->delete($group);
}
$block = $blocks ? reset($blocks) : $om->get(\Magento\Cms\Model\BlockFactory::class)->create();
$block->setIdentifier($blockIdentifier)->setTitle('Hyperion mega menu promo')->setStores([0])->setIsActive(true)
    ->setContent('<div class="rounded-lg bg-surface-raised p-4" data-hyperion-promo><p class="font-semibold">New season</p>'
        . '<p class="text-sm text-muted">Hyperion e2e promo column.</p></div>');
$blockRepo->save($block);

$storeManager = $om->get(\Magento\Store\Model\StoreManagerInterface::class);
$store = $storeManager->getDefaultStoreView();
$group = $groupFactory->create();
$group->setData([
    'identifier' => $identifier,
    'title' => 'Main navigation (e2e fixture)',
    'menu_type' => 'mega-horizontal',
    'website_ids' => '0',
    'devices' => 'both',
    'root_category_id' => (int) $store->getRootCategoryId(),
    'is_active' => 1,
    'priority' => 1000, // above any group of the install: the fixture must win the header
]);
$groupResource->save($group);
$groupId = (int) $group->getId();

$imported = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\Import\CategoryImporter::class)->import($group, 2);

$itemResource = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item::class);
$itemFactory = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\ItemFactory::class);
$itemStore = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\ItemStore::class);
$items = $om->get(\Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item\CollectionFactory::class)->create()
    ->addGroupFilter($groupId)->getItems();
$byTitle = [];
foreach ($items as $item) {
    if ((int) $item->getParentId() === 0) {
        $byTitle[$item->getTitle()] = $item;
    }
}
$save = static function (array $data) use ($itemFactory, $itemResource, $groupId): int {
    $item = $itemFactory->create();
    $item->setData(array_merge(['group_id' => $groupId, 'is_active' => 1, 'position' => 0], $data));
    $itemResource->save($item);
    return (int) $item->getId();
};
$summary = ['group_id' => $groupId, 'imported' => $imported];

// Women: a 12 column mega panel; its imported children become 3 column headers; a promo block column.
if (isset($byTitle['Women'])) {
    $women = $byTitle['Women'];
    $women->setData('dropdown_width', 12)->setData('is_container', 1);
    $itemResource->save($women);
    foreach ($items as $item) {
        if ((int) $item->getParentId() === (int) $women->getId()) {
            $item->setData('dropdown_width', 3);
            $itemResource->save($item);
        }
    }
    $summary['promo_item'] = $save([
        'parent_id' => (int) $women->getId(), 'title' => 'Promo', 'item_type' => 'cms_block',
        'item_target_value' => $blockIdentifier, 'dropdown_width' => 6, 'position' => 50,
    ]);
    $summary['women_item'] = (int) $women->getId();
}
// Men: SALE badge on the root item, a live subcategory depth on its first child.
if (isset($byTitle['Men'])) {
    $men = $byTitle['Men'];
    $men->setData('badge_text', 'SALE')->setData('badge_color', 'danger');
    $itemResource->save($men);
    $summary['men_item'] = (int) $men->getId();
}
// Gear: a title override on the default store view and a "NEW" badge there only.
if (isset($byTitle['Gear'])) {
    $itemStore->saveValues((int) $byTitle['Gear']->getId(), (int) $store->getId(), ['title' => 'Gear & More', 'badge_text' => 'NEW', 'badge_color' => 'success']);
    $summary['gear_item'] = (int) $byTitle['Gear']->getId();
}
// A custom link, an external one, a label with system links, a disabled item, a product.
$summary['custom_item'] = $save(['title' => 'Hyperion e2e', 'item_type' => 'custom', 'item_target_value' => '{storeurl}catalogsearch/result/?q=bag', 'position' => 90]);
$summary['external_item'] = $save(['title' => 'Docs', 'item_type' => 'custom', 'item_target_value' => 'https://example.com/docs', 'url_target' => '_blank', 'nofollow' => 1, 'position' => 91]);
$label = $save(['title' => 'Account', 'item_type' => 'empty', 'position' => 92, 'custom_class' => 'hyperion-account-label']);
$save(['parent_id' => $label, 'title' => 'Sign In', 'item_type' => 'login', 'position' => 0]);
$save(['parent_id' => $label, 'title' => 'Wish List', 'item_type' => 'wishlist', 'position' => 1]);
$save(['parent_id' => $label, 'title' => 'Joust Duffle Bag', 'item_type' => 'product', 'item_target_value' => '24-MB01', 'position' => 2]);
$summary['label_item'] = $label;
$summary['disabled_item'] = $save(['title' => 'Hidden item', 'item_type' => 'custom', 'item_target_value' => '/hidden', 'is_active' => 0, 'position' => 93]);
$summary['store_id'] = (int) $store->getId();
$om->get(\Magentofullstackdev\HyperionMegaMenu\Model\Cache\Flusher::class)->flushGroup($groupId);
echo json_encode($summary) . "\n";

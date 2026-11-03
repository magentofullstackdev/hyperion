<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Fixtures for the orders and widgets live check (e2e/pw-orders-widgets-ga4.mjs). Runs inside php-fpm as www-data:
//   php /tmp/sprint3-fixtures.php /var/www/html page            creates the CMS page /hyperion-history-check with the
//                                                               Recently Viewed (grid) and Recently Compared (sidebar) widgets
//   php /tmp/sprint3-fixtures.php /var/www/html comment <id>    adds a storefront-visible status comment to order <increment id>
//   php /tmp/sprint3-fixtures.php /var/www/html remove          deletes the CMS page
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = $argv[2] ?? 'page';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$identifier = 'hyperion-history-check';
$pageRepo = $om->get(\Magento\Cms\Api\PageRepositoryInterface::class);
$criteria = $om->get(\Magento\Framework\Api\SearchCriteriaBuilder::class)->addFilter('identifier', $identifier)->create();
$existing = $pageRepo->getList($criteria)->getItems();

if ($action === 'remove') {
    foreach ($existing as $page) {
        $pageRepo->delete($page);
    }
    echo "page removed\n";
    exit(0);
}
if ($action === 'comment') {
    $incrementId = $argv[3] ?? '';
    $orders = $om->get(\Magento\Sales\Api\OrderRepositoryInterface::class)
        ->getList($om->get(\Magento\Framework\Api\SearchCriteriaBuilder::class)->addFilter('increment_id', $incrementId)->create())
        ->getItems();
    $order = reset($orders);
    if (!$order) {
        echo "order $incrementId not found\n";
        exit(1);
    }
    $order->addCommentToStatusHistory('Hyperion e2e says: your parcel ships tomorrow.', false, true);
    $om->get(\Magento\Sales\Api\OrderRepositoryInterface::class)->save($order);
    echo "comment added to $incrementId\n";
    exit(0);
}

$content = '<p>Hyperion e2e history widgets.</p>'
    . '{{widget type="Magento\\Catalog\\Block\\Widget\\RecentlyViewed" uiComponent="widget_recently_viewed"'
    . ' page_size="5" show_attributes="name,image,price,learn_more" show_buttons="add_to_cart,add_to_wishlist,add_to_compare"'
    . ' template="product/widget/viewed/grid.phtml"}}'
    . '{{widget type="Magento\\Catalog\\Block\\Widget\\RecentlyCompared" uiComponent="widget_recently_compared"'
    . ' page_size="5" show_attributes="name,image,price" show_buttons="add_to_cart"'
    . ' template="product/widget/compared/sidebar.phtml"}}';
$page = $existing ? reset($existing) : $om->get(\Magento\Cms\Model\PageFactory::class)->create();
$page->setIdentifier($identifier)->setTitle('Hyperion history check')->setPageLayout('1column')
    ->setStores([0])->setIsActive(true)->setContent($content);
$pageRepo->save($page);
echo "page /$identifier ready\n";

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Read-only fixture of the checkout resilience check (e2e/pw-checkout-resilience.mjs). Runs inside php-fpm as
// www-data:
//   php /tmp/order-address-fixture.php /var/www/html <increment id>
// prints the shipping address of the order as the store holds it, as one JSON line:
//   {"increment_id":"000000123","found":true,"email":"...","street":["..."],"city":"...","postcode":"...",
//    "region":"...","country_id":"US"}
// An unknown order prints {"increment_id":"...","found":false}. It writes nothing, so there is nothing to apply
// or to remove.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$incrementId = (string) ($argv[2] ?? '');
if ($incrementId === '') {
    fwrite(STDERR, "usage: php order-address-fixture.php <root> <increment id>\n");
    exit(2);
}
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$criteria = $om->get(\Magento\Framework\Api\SearchCriteriaBuilder::class)
    ->addFilter('increment_id', $incrementId)
    ->setPageSize(1)
    ->create();
$orders = $om->get(\Magento\Sales\Api\OrderRepositoryInterface::class)->getList($criteria)->getItems();
$order = reset($orders);
if (!$order instanceof \Magento\Sales\Model\Order) {
    echo json_encode(['increment_id' => $incrementId, 'found' => false]) . "\n";
    exit(0);
}
$address = $order->getShippingAddress();
echo json_encode([
    'increment_id' => $incrementId,
    'found' => true,
    'email' => (string) $order->getCustomerEmail(),
    'street' => $address ? array_values((array) $address->getStreet()) : [],
    'city' => $address ? (string) $address->getCity() : '',
    'postcode' => $address ? (string) $address->getPostcode() : '',
    'region' => $address ? (string) $address->getRegion() : '',
    'country_id' => $address ? (string) $address->getCountryId() : '',
]) . "\n";

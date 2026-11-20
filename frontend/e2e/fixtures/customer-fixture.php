<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// A customer of its own for a live check that changes customer state (cart, wish list, addresses, orders),
// so the run never shares a cart with another session of the sample customer
// (e2e/pw-cart-features.mjs, e2e/pw-fallback-pages.mjs). Runs inside php-fpm as www-data:
//   php /tmp/customer-fixture.php /var/www/html <email> <password> --apply   creates the customer on the default
//                                                              website (confirmed, General group, no welcome email)
//                                                              with one address that is the default billing and
//                                                              shipping address (United States, Michigan, 49628).
//                                                              An existing customer with that email is kept as it is.
//   php /tmp/customer-fixture.php /var/www/html <email> --remove             deletes the customer (addresses, cart,
//                                                              wish list and stored tokens go with it; orders stay,
//                                                              as for any deleted customer).
// The last output line is a JSON object: {"applied": true, "customer_id": ..., "created": ..., "lastname": ...} or
// {"removed": true|false}.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$email = $argv[2] ?? '';
$apply = in_array('--apply', $argv, true);
$remove = in_array('--remove', $argv, true);
$password = $apply ? ($argv[3] ?? '') : '';
if ($apply === $remove || $email === '' || str_starts_with($email, '--') || ($apply && ($password === '' || str_starts_with($password, '--')))) {
    echo json_encode(['applied' => false, 'reason' => 'usage: customer-fixture.php <root> <email> <password> --apply | <root> <email> --remove']) . "\n";
    exit(2);
}
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$storeManager = $om->get(\Magento\Store\Model\StoreManagerInterface::class);
$store = $storeManager->getDefaultStoreView();
$websiteId = (int) $store->getWebsiteId();
$customers = $om->get(\Magento\Customer\Api\CustomerRepositoryInterface::class);

$existing = null;
try {
    $existing = $customers->get($email, $websiteId);
} catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
    $existing = null;
}

if ($remove) {
    if ($existing === null) {
        echo json_encode(['removed' => false, 'reason' => 'no customer with that email']) . "\n";
        exit(0);
    }
    // Deleting a customer outside the admin needs the secure area flag.
    $registry = $om->get(\Magento\Framework\Registry::class);
    $registry->unregister('isSecureArea');
    $registry->register('isSecureArea', true);
    $customers->deleteById((int) $existing->getId());
    echo json_encode(['removed' => true]) . "\n";
    exit(0);
}
if ($existing !== null) {
    echo json_encode(['applied' => true, 'customer_id' => (int) $existing->getId(), 'created' => false, 'lastname' => (string) $existing->getLastname()]) . "\n";
    exit(0);
}
$region = $om->get(\Magento\Directory\Model\RegionFactory::class)->create()->loadByCode('MI', 'US');
$regionData = $om->get(\Magento\Customer\Api\Data\RegionInterfaceFactory::class)->create()
    ->setRegionId((int) $region->getId())
    ->setRegionCode('MI')
    ->setRegion('Michigan');
$address = $om->get(\Magento\Customer\Api\Data\AddressInterfaceFactory::class)->create()
    ->setFirstname('Hyperion')
    ->setLastname('Checker')
    ->setStreet(['6146 Honey Bluff Parkway'])
    ->setCity('Calder')
    ->setCountryId('US')
    ->setRegion($regionData)
    ->setRegionId((int) $region->getId())
    ->setPostcode('49628')
    ->setTelephone('5553334444')
    ->setIsDefaultBilling(true)
    ->setIsDefaultShipping(true);
$customer = $om->get(\Magento\Customer\Api\Data\CustomerInterfaceFactory::class)->create()
    ->setEmail($email)
    ->setFirstname('Hyperion')
    ->setLastname('Checker')
    ->setWebsiteId($websiteId)
    ->setStoreId((int) $store->getId())
    ->setGroupId(1)
    ->setAddresses([$address]);
$hash = $om->get(\Magento\Framework\Encryption\EncryptorInterface::class)->getHash($password, true);
$saved = $customers->save($customer, $hash);
echo json_encode(['applied' => true, 'customer_id' => (int) $saved->getId(), 'created' => true, 'lastname' => 'Checker']) . "\n";

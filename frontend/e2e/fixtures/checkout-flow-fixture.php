<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Coupons and customers for the live check of the checkout flow (e2e/pw-checkout-flow.mjs). Runs inside php-fpm as
// www-data:
//   php /tmp/checkout-flow-fixture.php /var/www/html --apply    creates three active cart price rules with one coupon
//                                                               each (every website and customer group) and prints
//                                                               their ids as JSON; a rule that exists is left alone:
//                                                                 HYPFLOW100    100 percent, shipping included (a zero
//                                                                               total, so only "free" can pay)
//                                                                 HYPFLOW60     60 percent of the cart
//                                                                 HYPFLOWSHIP   free shipping
//   php /tmp/checkout-flow-fixture.php /var/www/html --remove   deletes the three rules
//   php /tmp/checkout-flow-fixture.php /var/www/html customer <email> <password> <addresses>
//                                                               creates a customer of the default website with 0 or 2
//                                                               saved addresses (the first, in Michigan, is the
//                                                               default billing and shipping address; the second, in
//                                                               Alaska, is not a default) and prints the ids as JSON.
//                                                               An existing customer with that email is returned as is.
// Customers are not removed: the orders they place keep pointing at them.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$action = (string) ($argv[2] ?? '');
if (!in_array($action, ['--apply', '--remove', 'customer'], true)) {
    fwrite(STDERR, "usage: php checkout-flow-fixture.php <root> --apply|--remove|customer <email> <password> <addresses>\n");
    exit(2);
}
const RULE_PREFIX = 'Hyperion e2e checkout flow: ';
const COUPONS = [
    'HYPFLOW100' => ['label' => '100 percent', 'discount_amount' => 100, 'apply_to_shipping' => 1, 'simple_free_shipping' => 0],
    'HYPFLOW60' => ['label' => '60 percent', 'discount_amount' => 60, 'apply_to_shipping' => 0, 'simple_free_shipping' => 0],
    'HYPFLOWSHIP' => ['label' => 'free shipping', 'discount_amount' => 0, 'apply_to_shipping' => 0, 'simple_free_shipping' => 1],
];
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');

if ($action === 'customer') {
    $email = (string) ($argv[3] ?? '');
    $password = (string) ($argv[4] ?? '');
    $addressCount = (int) ($argv[5] ?? 0);
    if ($email === '' || $password === '' || !in_array($addressCount, [0, 2], true)) {
        fwrite(STDERR, "usage: php checkout-flow-fixture.php <root> customer <email> <password> 0|2\n");
        exit(2);
    }
    $store = $om->get(\Magento\Store\Model\StoreManagerInterface::class)->getDefaultStoreView();
    $customers = $om->get(\Magento\Customer\Api\CustomerRepositoryInterface::class);
    try {
        $customer = $customers->get($email, (int) $store->getWebsiteId());
        $created = false;
    } catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
        $data = $om->create(\Magento\Customer\Api\Data\CustomerInterface::class);
        $data->setEmail($email)->setFirstname('Flow')->setLastname('Checker')
            ->setWebsiteId((int) $store->getWebsiteId())->setStoreId((int) $store->getId());
        $customer = $om->get(\Magento\Customer\Api\AccountManagementInterface::class)->createAccount($data, $password);
        $created = true;
    }
    $addressIds = [];
    if ($created && $addressCount === 2) {
        $addresses = $om->get(\Magento\Customer\Api\AddressRepositoryInterface::class);
        $regions = $om->get(\Magento\Directory\Model\RegionFactory::class);
        $rows = [
            ['street' => '6146 Honey Bluff Parkway', 'city' => 'Calder', 'region' => 'MI', 'postcode' => '49628-7978', 'default' => true],
            ['street' => '700 Flow Avenue', 'city' => 'Anchorage', 'region' => 'AK', 'postcode' => '99501', 'default' => false],
        ];
        foreach ($rows as $row) {
            $region = $regions->create()->loadByCode($row['region'], 'US');
            $address = $om->create(\Magento\Customer\Api\Data\AddressInterface::class);
            $regionData = $om->create(\Magento\Customer\Api\Data\RegionInterface::class);
            $regionData->setRegionId((int) $region->getId())->setRegion((string) $region->getName())->setRegionCode($row['region']);
            $address->setCustomerId((int) $customer->getId())->setFirstname('Flow')->setLastname('Checker')
                ->setStreet([$row['street']])->setCity($row['city'])->setCountryId('US')
                ->setRegionId((int) $region->getId())->setRegion($regionData)
                ->setPostcode($row['postcode'])->setTelephone('5552293326')
                ->setIsDefaultBilling($row['default'])->setIsDefaultShipping($row['default']);
            $addressIds[] = (int) $addresses->save($address)->getId();
        }
    } else {
        foreach ($customers->getById((int) $customer->getId())->getAddresses() ?? [] as $address) {
            $addressIds[] = (int) $address->getId();
        }
    }
    echo json_encode(['customer_id' => (int) $customer->getId(), 'created' => $created, 'address_ids' => $addressIds]) . "\n";
    exit(0);
}

$existing = static function (string $code) use ($om): array {
    $collection = $om->create(\Magento\SalesRule\Model\ResourceModel\Rule\Collection::class);
    $collection->addFieldToFilter('name', RULE_PREFIX . $code);
    return $collection->getItems();
};

if ($action === '--remove') {
    $removed = 0;
    foreach (array_keys(COUPONS) as $code) {
        foreach ($existing($code) as $rule) {
            $rule->delete();
            $removed++;
        }
    }
    echo json_encode(['removed' => $removed]) . "\n";
    exit(0);
}

$websiteIds = array_map('intval', array_keys($om->get(\Magento\Store\Model\StoreManagerInterface::class)->getWebsites()));
$groupIds = [];
foreach ($om->create(\Magento\Customer\Model\ResourceModel\Group\Collection::class) as $group) {
    $groupIds[] = (int) $group->getId();
}
$result = [];
foreach (COUPONS as $code => $settings) {
    $found = $existing($code);
    if ($found !== []) {
        $result[$code] = (int) reset($found)->getId();
        continue;
    }
    $rule = $om->create(\Magento\SalesRule\Model\Rule::class);
    $rule->setData([
        'name' => RULE_PREFIX . $code,
        'description' => 'Created by e2e/fixtures/checkout-flow-fixture.php (' . $settings['label'] . '). Safe to delete.',
        'is_active' => 1,
        'website_ids' => $websiteIds,
        'customer_group_ids' => $groupIds,
        'coupon_type' => \Magento\SalesRule\Model\Rule::COUPON_TYPE_SPECIFIC,
        'coupon_code' => $code,
        'uses_per_coupon' => 0,
        'uses_per_customer' => 0,
        'simple_action' => \Magento\SalesRule\Model\Rule::BY_PERCENT_ACTION,
        'discount_amount' => $settings['discount_amount'],
        'discount_qty' => 0,
        'discount_step' => 0,
        'apply_to_shipping' => $settings['apply_to_shipping'],
        'simple_free_shipping' => $settings['simple_free_shipping'],
        'stop_rules_processing' => 0,
        'is_advanced' => 1,
        'sort_order' => 95,
    ]);
    $rule->save();
    $result[$code] = (int) $rule->getId();
}
echo json_encode(['applied' => true, 'rules' => $result]) . "\n";

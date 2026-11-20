<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Cart price rule that depends on the payment method, for the live check of the checkout flow
// (e2e/pw-checkout-flow.mjs). Runs inside php-fpm as www-data:
//   php /tmp/payment-rule-fixture.php /var/www/html --apply    creates the active rule "Hyperion e2e: 5% off with
//                                                              Bank Transfer" (no coupon, every website and customer
//                                                              group, 5 percent of the cart, condition: payment method
//                                                              is `banktransfer`) and prints its id as JSON. A second
//                                                              apply finds the rule and changes nothing.
//   php /tmp/payment-rule-fixture.php /var/www/html --remove   deletes every rule with that name
// The rule only acts while the Bank Transfer method is offered (`payment/banktransfer/active`): the calling script
// switches it on for the check and puts the stored value back.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$apply = in_array('--apply', $argv, true);
$remove = in_array('--remove', $argv, true);
if ($apply === $remove) {
    fwrite(STDERR, "usage: php payment-rule-fixture.php <root> --apply|--remove\n");
    exit(2);
}
const RULE_NAME = 'Hyperion e2e: 5% off with Bank Transfer';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');

$existing = static function () use ($om): array {
    $collection = $om->create(\Magento\SalesRule\Model\ResourceModel\Rule\Collection::class);
    $collection->addFieldToFilter('name', RULE_NAME);
    return $collection->getItems();
};

if ($remove) {
    $removed = 0;
    foreach ($existing() as $rule) {
        $rule->delete();
        $removed++;
    }
    echo json_encode(['removed' => $removed]) . "\n";
    exit(0);
}

$found = $existing();
if ($found !== []) {
    echo json_encode(['applied' => true, 'created' => false, 'rule_id' => (int) reset($found)->getId()]) . "\n";
    exit(0);
}
$websiteIds = array_map('intval', array_keys($om->get(\Magento\Store\Model\StoreManagerInterface::class)->getWebsites()));
$groupIds = [];
foreach ($om->create(\Magento\Customer\Model\ResourceModel\Group\Collection::class) as $group) {
    $groupIds[] = (int) $group->getId();
}
$rule = $om->create(\Magento\SalesRule\Model\Rule::class);
$rule->loadPost([
    'name' => RULE_NAME,
    'description' => 'Created by e2e/fixtures/payment-rule-fixture.php. Safe to delete.',
    'is_active' => 1,
    'website_ids' => $websiteIds,
    'customer_group_ids' => $groupIds,
    'coupon_type' => \Magento\SalesRule\Model\Rule::COUPON_TYPE_NO_COUPON,
    'simple_action' => \Magento\SalesRule\Model\Rule::BY_PERCENT_ACTION,
    'discount_amount' => 5,
    'discount_qty' => 0,
    'discount_step' => 0,
    'apply_to_shipping' => 0,
    'simple_free_shipping' => 0,
    'stop_rules_processing' => 0,
    'is_advanced' => 1,
    'sort_order' => 90,
    'conditions' => [
        '1' => [
            'type' => \Magento\SalesRule\Model\Rule\Condition\Combine::class,
            'aggregator' => 'all',
            'value' => '1',
            'new_child' => '',
        ],
        '1--1' => [
            'type' => \Magento\SalesRule\Model\Rule\Condition\Address::class,
            'attribute' => 'payment_method',
            'operator' => '==',
            'value' => 'banktransfer',
        ],
    ],
    'actions' => [
        '1' => [
            'type' => \Magento\SalesRule\Model\Rule\Condition\Product\Combine::class,
            'aggregator' => 'all',
            'value' => '1',
            'new_child' => '',
        ],
    ],
]);
$rule->save();
echo json_encode(['applied' => true, 'created' => true, 'rule_id' => (int) $rule->getId()]) . "\n";

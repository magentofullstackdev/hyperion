<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// What the live check of the CAPTCHA forms (e2e/pw-captcha.mjs) cannot do through configuration. Runs inside
// php-fpm as www-data:
//   php /tmp/captcha-fixture.php /var/www/html --apply      empties the attempt log of Magento's image CAPTCHA
//                                                           (`captcha_log`, so no form is required because of
//                                                           earlier attempts) and creates the active cart price
//                                                           rule "Hyperion e2e captcha: 10 percent" with the coupon
//                                                           HYPCAPTCHA10 (every website and customer group, 10
//                                                           percent of the cart: the total stays above zero). A rule
//                                                           that exists is left alone.
//   php /tmp/captcha-fixture.php /var/www/html --clear-log  empties the attempt log only (between two journeys)
//   php /tmp/captcha-fixture.php /var/www/html --restore    deletes the rule and empties the attempt log
// The last output line is a JSON object: {"applied": true, "rule_id": ..., "coupon": "HYPCAPTCHA10",
// "log_rows_removed": ...}, {"cleared": true, "log_rows_removed": ...} or {"restored": true, "rules_removed": ...,
// "log_rows_removed": ...}. Every action can be repeated.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$actions = array_values(array_intersect(['--apply', '--clear-log', '--restore'], $argv));
if (count($actions) !== 1) {
    fwrite(STDERR, "usage: php captcha-fixture.php <root> --apply|--clear-log|--restore\n");
    exit(2);
}
$action = $actions[0];
const RULE_NAME = 'Hyperion e2e captcha: 10 percent';
const COUPON = 'HYPCAPTCHA10';
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');

$clearLog = static function () use ($om): int {
    $resource = $om->get(\Magento\Framework\App\ResourceConnection::class);
    return (int) $resource->getConnection()->delete($resource->getTableName('captcha_log'));
};
$existing = static function () use ($om): array {
    $collection = $om->create(\Magento\SalesRule\Model\ResourceModel\Rule\Collection::class);
    $collection->addFieldToFilter('name', RULE_NAME);
    return $collection->getItems();
};

if ($action === '--clear-log') {
    echo json_encode(['cleared' => true, 'log_rows_removed' => $clearLog()]) . "\n";
    exit(0);
}

if ($action === '--restore') {
    $removed = 0;
    foreach ($existing() as $rule) {
        $rule->delete();
        $removed++;
    }
    echo json_encode(['restored' => true, 'rules_removed' => $removed, 'log_rows_removed' => $clearLog()]) . "\n";
    exit(0);
}

$found = $existing();
if ($found !== []) {
    $ruleId = (int) reset($found)->getId();
} else {
    $websiteIds = array_map('intval', array_keys($om->get(\Magento\Store\Model\StoreManagerInterface::class)->getWebsites()));
    $groupIds = [];
    foreach ($om->create(\Magento\Customer\Model\ResourceModel\Group\Collection::class) as $group) {
        $groupIds[] = (int) $group->getId();
    }
    $rule = $om->create(\Magento\SalesRule\Model\Rule::class);
    $rule->setData([
        'name' => RULE_NAME,
        'description' => 'Created by e2e/fixtures/captcha-fixture.php. Safe to delete.',
        'is_active' => 1,
        'website_ids' => $websiteIds,
        'customer_group_ids' => $groupIds,
        'coupon_type' => \Magento\SalesRule\Model\Rule::COUPON_TYPE_SPECIFIC,
        'coupon_code' => COUPON,
        'uses_per_coupon' => 0,
        'uses_per_customer' => 0,
        'simple_action' => \Magento\SalesRule\Model\Rule::BY_PERCENT_ACTION,
        'discount_amount' => 10,
        'discount_qty' => 0,
        'discount_step' => 0,
        'apply_to_shipping' => 0,
        'simple_free_shipping' => 0,
        'stop_rules_processing' => 0,
        'is_advanced' => 1,
        'sort_order' => 96,
    ]);
    $rule->save();
    $ruleId = (int) $rule->getId();
}
echo json_encode(['applied' => true, 'rule_id' => $ruleId, 'coupon' => COUPON, 'log_rows_removed' => $clearLog()]) . "\n";

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Custom customer and address attributes for the live check of the account forms (e2e/pw-custom-attributes.mjs).
// Runs inside php-fpm as www-data:
//   php /tmp/custom-attributes-fixture.php /var/www/html --apply    creates, through CustomerSetup, three user defined
//                                                                   customer attributes (a text, a select with two
//                                                                   options and a required text) and one text attribute
//                                                                   of the customer address, visible and assigned to
//                                                                   the storefront and admin forms; an attribute that
//                                                                   exists is left as it is
//   php /tmp/custom-attributes-fixture.php /var/www/html --remove   deletes the four attributes (their values go with
//                                                                   them)
// While the attributes exist every new customer needs the required one, on the storefront and in the admin: remove
// them as soon as the check ends. Flush the cache after each call. The last output line is a JSON object with the
// attribute codes and the select options ({"applied": true, ...} or {"removed": [...]}).
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$apply = in_array('--apply', $argv, true);
$remove = in_array('--remove', $argv, true);
if ($apply === $remove) {
    fwrite(STDERR, "usage: php custom-attributes-fixture.php <root> --apply|--remove\n");
    exit(2);
}
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');

const CUSTOMER_FORMS = ['customer_account_create', 'customer_account_edit', 'adminhtml_customer'];
const ADDRESS_FORMS = ['customer_address_edit', 'customer_register_address', 'adminhtml_customer_address'];
$attributes = [
    'hyperion_e2e_nickname' => [
        'entity' => 'customer', 'type' => 'varchar', 'input' => 'text', 'label' => 'Nickname', 'required' => false,
        'validate_rules' => ['max_text_length' => 40],
    ],
    'hyperion_e2e_channel' => [
        'entity' => 'customer', 'type' => 'int', 'input' => 'select', 'label' => 'Preferred channel', 'required' => false,
        'source' => \Magento\Eav\Model\Entity\Attribute\Source\Table::class,
        'option' => ['values' => ['Email', 'Phone']],
    ],
    'hyperion_e2e_member_code' => [
        'entity' => 'customer', 'type' => 'varchar', 'input' => 'text', 'label' => 'Member code', 'required' => true,
        'validate_rules' => ['min_text_length' => 3, 'max_text_length' => 20],
    ],
    'hyperion_e2e_gate_code' => [
        'entity' => 'customer_address', 'type' => 'varchar', 'input' => 'text', 'label' => 'Gate code', 'required' => false,
        'validate_rules' => ['max_text_length' => 20],
    ],
];

$setup = $om->get(\Magento\Customer\Setup\CustomerSetupFactory::class)->create();
$eavConfig = $om->get(\Magento\Eav\Model\Config::class);
$cacheTypes = $om->get(\Magento\Framework\App\Cache\TypeListInterface::class);
$clearEav = static function () use ($cacheTypes, $eavConfig): void {
    $cacheTypes->cleanType('eav');
    $eavConfig->clear();
};

if ($remove) {
    $removed = [];
    foreach ($attributes as $code => $definition) {
        if ($setup->getAttributeId($definition['entity'], $code)) {
            $setup->removeAttribute($definition['entity'], $code);
            $removed[] = $code;
        }
    }
    $clearEav();
    echo json_encode(['removed' => $removed]) . "\n";
    exit(0);
}

$created = [];
foreach ($attributes as $code => $definition) {
    if ($setup->getAttributeId($definition['entity'], $code)) {
        continue;
    }
    $setup->addAttribute($definition['entity'], $code, array_filter([
        'type' => $definition['type'],
        'label' => $definition['label'],
        'input' => $definition['input'],
        'source' => $definition['source'] ?? null,
        'option' => $definition['option'] ?? null,
        'required' => $definition['required'],
        'visible' => true,
        'user_defined' => true,
        'system' => false,
        'position' => 900 + count($created),
        'sort_order' => 900 + count($created),
    ], static fn ($value): bool => $value !== null));
    $created[] = $code;
}
$clearEav();
$out = ['applied' => true, 'created' => $created, 'attributes' => []];
foreach ($attributes as $code => $definition) {
    $entityType = $eavConfig->getEntityType($definition['entity']);
    $setId = (int) $entityType->getDefaultAttributeSetId();
    $groupId = (int) $setup->getDefaultAttributeGroupId($definition['entity'], $setId);
    $attribute = $eavConfig->getAttribute($definition['entity'], $code);
    $attribute->addData([
        'attribute_set_id' => $setId,
        'attribute_group_id' => $groupId,
        'used_in_forms' => $definition['entity'] === 'customer' ? CUSTOMER_FORMS : ADDRESS_FORMS,
        'is_used_in_grid' => false,
        'is_visible_in_grid' => false,
        'is_filterable_in_grid' => false,
        'is_searchable_in_grid' => false,
    ]);
    if (isset($definition['validate_rules'])) {
        $attribute->setData('validate_rules', $definition['validate_rules']);
    }
    $attribute->save();
    $options = [];
    if ($definition['input'] === 'select') {
        foreach ($attribute->getSource()->getAllOptions(false) as $option) {
            $options[] = ['value' => (string) $option['value'], 'label' => (string) $option['label']];
        }
    }
    $out['attributes'][$code] = [
        'entity' => $definition['entity'],
        'id' => (int) $attribute->getId(),
        'label' => $definition['label'],
        'input' => $definition['input'],
        'required' => $definition['required'],
        'options' => $options,
    ];
}
$clearEav();
echo json_encode($out) . "\n";

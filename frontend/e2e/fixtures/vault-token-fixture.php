<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Stored PayPal account of the Braintree gateway for the live check of the Stored Payment Methods page
// (e2e/pw-fallback-pages.mjs). Runs inside php-fpm as www-data:
//   php /tmp/vault-token-fixture.php /var/www/html <customer email> --apply    one visible, active row in
//                                                              `vault_payment_token` for that customer: method
//                                                              `braintree_paypal`, type `account`, a gateway token no
//                                                              gateway knows, and the details the token renderer of
//                                                              the gateway module reads (`payerEmail`). A row left by
//                                                              an earlier apply is replaced.
//   php /tmp/vault-token-fixture.php /var/www/html <customer email> --remove   deletes the fixture rows of that customer.
// The last output line is a JSON object: {"applied": true, "public_hash": ..., "payer_email": ...}, or
// {"applied": false, "reason": ...} when the PayPal_Braintree module is not enabled or the customer does not
// exist; {"removed": <rows>} for --remove. Nothing is sent to a gateway: the row only renders.
declare(strict_types=1);
$root = $argv[1] ?? '/var/www/html';
$email = $argv[2] ?? '';
$apply = in_array('--apply', $argv, true);
$remove = in_array('--remove', $argv, true);
if ($apply === $remove || $email === '' || str_starts_with($email, '--')) {
    echo json_encode(['applied' => false, 'reason' => 'usage: vault-token-fixture.php <root> <customer email> --apply | --remove']) . "\n";
    exit(2);
}
require $root . '/app/bootstrap.php';
$bootstrap = \Magento\Framework\App\Bootstrap::create($root, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');
$resource = $om->get(\Magento\Framework\App\ResourceConnection::class);
$db = $resource->getConnection();
$tokenTable = $resource->getTableName('vault_payment_token');
// Every row of the fixture carries this gateway token prefix.
$marker = 'hyperion-e2e-paypal-';

$customer = $db->fetchRow(
    $db->select()->from($resource->getTableName('customer_entity'), ['entity_id', 'website_id'])->where('email = ?', $email)->limit(1)
);
$deleteRows = static function () use ($db, $tokenTable, $marker, $customer): int {
    if (!$customer) {
        return 0;
    }
    return (int) $db->delete($tokenTable, ['customer_id = ?' => (int) $customer['entity_id'], 'gateway_token LIKE ?' => $marker . '%']);
};

if ($remove) {
    echo json_encode(['removed' => $deleteRows()]) . "\n";
    exit(0);
}
if (!$om->get(\Magento\Framework\Module\Manager::class)->isEnabled('PayPal_Braintree')) {
    echo json_encode(['applied' => false, 'reason' => 'the PayPal_Braintree module is not enabled']) . "\n";
    exit(0);
}
if (!$customer) {
    echo json_encode(['applied' => false, 'reason' => 'no customer with the email ' . $email]) . "\n";
    exit(0);
}
$deleteRows();
$payerEmail = 'payer.' . $email;
$gatewayToken = $marker . bin2hex(random_bytes(6));
$details = json_encode(['payerEmail' => $payerEmail]);
$publicHash = hash('sha256', $customer['entity_id'] . '|braintree_paypal|account|' . $gatewayToken . '|' . $details);
$db->insert($tokenTable, [
    'customer_id' => (int) $customer['entity_id'],
    'website_id' => (int) $customer['website_id'],
    'public_hash' => $publicHash,
    'payment_method_code' => 'braintree_paypal',
    'type' => 'account',
    'expires_at' => gmdate('Y-m-d H:i:s', time() + 365 * 86400),
    'gateway_token' => $gatewayToken,
    'details' => $details,
    'is_active' => 1,
    'is_visible' => 1,
]);
echo json_encode(['applied' => true, 'public_hash' => $publicHash, 'payer_email' => $payerEmail]) . "\n";

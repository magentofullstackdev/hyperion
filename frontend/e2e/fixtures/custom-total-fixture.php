<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// Custom quote total for the live check of totals the theme does not know
// (e2e/pw-cart-features.mjs --with-custom-total). It is a test aid that lives only in the Magento
// install it is applied to, never in a Composer package. Runs inside php-fpm as www-data:
//   php /tmp/custom-total-fixture.php /var/www/html --apply    writes the module HyperionTest_CustomTotal under
//                                                              app/code/HyperionTest/CustomTotal (a quote total collector
//                                                              declared in etc/sales.xml: code `hyperion_test_fee`, title
//                                                              "Test fee", 2.50 in the base currency on every quote with
//                                                              items, collected between the tax and the grand total; its
//                                                              fetch() makes it a row of the cart totals and a segment of
//                                                              the REST totals), enables it, runs setup:upgrade and
//                                                              setup:di:compile and flushes the cache.
//   php /tmp/custom-total-fixture.php /var/www/html --remove   disables the module, deletes its directory, runs
//                                                              setup:upgrade and setup:di:compile and flushes the cache.
// Both calls are idempotent (apply over an applied fixture rewrites the files and compiles again; remove without
// the module only reports it). The storefront answers errors while the compilation runs: never use it on a store
// that serves visitors. The last output line is a JSON object: {"applied": true} or {"removed": true}, or the
// same key false with a `reason` and the output of the command that failed.
declare(strict_types=1);

const MODULE_NAME = 'HyperionTest_CustomTotal';
const TOTAL_CODE = 'hyperion_test_fee';

$root = rtrim($argv[1] ?? '/var/www/html', '/');
$apply = in_array('--apply', $argv, true);
$remove = in_array('--remove', $argv, true);
if ($apply === $remove) {
    echo json_encode(['applied' => false, 'removed' => false, 'reason' => 'pass exactly one of --apply and --remove']) . "\n";
    exit(2);
}
if (!is_file($root . '/bin/magento')) {
    echo json_encode(['applied' => false, 'removed' => false, 'reason' => 'no Magento install at ' . $root]) . "\n";
    exit(2);
}
$moduleDir = $root . '/app/code/HyperionTest/CustomTotal';
$vendorDir = dirname($moduleDir);
$key = $apply ? 'applied' : 'removed';

// Runs one bin/magento command; a failure ends the script with the command's output in the answer.
$magento = static function (string $command) use ($root, $key): void {
    $output = [];
    $exit = 0;
    exec('cd ' . escapeshellarg($root) . ' && ' . escapeshellarg(PHP_BINARY) . ' bin/magento ' . $command . ' 2>&1', $output, $exit);
    if ($exit !== 0) {
        echo json_encode([$key => false, 'reason' => 'bin/magento ' . $command . ' exited ' . $exit, 'output' => array_slice($output, -15)]) . "\n";
        exit(1);
    }
};
$deleteTree = static function (string $path) use (&$deleteTree): void {
    if (!is_dir($path)) {
        return;
    }
    foreach (array_diff((array) scandir($path), ['.', '..']) as $entry) {
        $child = $path . '/' . $entry;
        is_dir($child) ? $deleteTree($child) : unlink($child);
    }
    rmdir($path);
};
$isEnabled = static function () use ($root): bool {
    $config = is_file($root . '/app/etc/config.php') ? include $root . '/app/etc/config.php' : [];
    return (int) ($config['modules'][MODULE_NAME] ?? 0) === 1;
};

if ($remove) {
    if (!is_dir($moduleDir) && !$isEnabled()) {
        echo json_encode(['removed' => true, 'note' => 'the module was not installed']) . "\n";
        exit(0);
    }
    if (is_dir($moduleDir) && $isEnabled()) {
        $magento('module:disable ' . MODULE_NAME);
    }
    $deleteTree($moduleDir);
    // The directories the apply created go too when nothing else lives in them.
    foreach ([$vendorDir, dirname($vendorDir)] as $emptied) {
        if (is_dir($emptied) && count((array) scandir($emptied)) === 2) {
            rmdir($emptied);
        }
    }
    $magento('setup:upgrade --keep-generated');
    $magento('setup:di:compile');
    $magento('cache:flush');
    echo json_encode(['removed' => true]) . "\n";
    exit(0);
}

$files = [
    'registration.php' => <<<'PHP'
<?php
declare(strict_types=1);

use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::MODULE, 'HyperionTest_CustomTotal', __DIR__);

PHP,
    'etc/module.xml' => <<<'XML'
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Module/etc/module.xsd">
    <module name="HyperionTest_CustomTotal">
        <sequence>
            <module name="Magento_Quote"/>
            <module name="Magento_Sales"/>
            <module name="Magento_Tax"/>
        </sequence>
    </module>
</config>

XML,
    // Collected after the tax (450) and the FPT tax (460), before the grand total (550).
    'etc/sales.xml' => <<<'XML'
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Sales:etc/sales.xsd">
    <section name="quote">
        <group name="totals">
            <item name="hyperion_test_fee" instance="HyperionTest\CustomTotal\Model\Total\TestFee" sort_order="500"/>
        </group>
    </section>
</config>

XML,
    'Model/Total/TestFee.php' => <<<'PHP'
<?php
declare(strict_types=1);

namespace HyperionTest\CustomTotal\Model\Total;

use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Quote\Api\Data\ShippingAssignmentInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;
use Magento\Quote\Model\Quote\Address\Total\AbstractTotal;

/**
 * A flat fee on every quote with items: part of the grand total, a row of
 * the cart totals and a segment of the REST totals. The amount is not
 * stored on the address, so fetch() computes it again.
 */
class TestFee extends AbstractTotal
{
    private const BASE_AMOUNT = 2.50;

    public function __construct(private readonly PriceCurrencyInterface $priceCurrency)
    {
        $this->setCode('hyperion_test_fee');
    }

    public function collect(Quote $quote, ShippingAssignmentInterface $shippingAssignment, Total $total): self
    {
        parent::collect($quote, $shippingAssignment, $total);
        if (!count($shippingAssignment->getItems())) {
            return $this;
        }
        $total->setTotalAmount($this->getCode(), $this->amount($quote));
        $total->setBaseTotalAmount($this->getCode(), self::BASE_AMOUNT);

        return $this;
    }

    public function fetch(Quote $quote, Total $total): array
    {
        if ((int) $quote->getItemsCount() === 0) {
            return [];
        }

        return ['code' => $this->getCode(), 'title' => __('Test fee'), 'value' => $this->amount($quote)];
    }

    private function amount(Quote $quote): float
    {
        return (float) $this->priceCurrency->convertAndRound(self::BASE_AMOUNT, $quote->getStore());
    }
}

PHP,
];
foreach ($files as $relative => $content) {
    $path = $moduleDir . '/' . $relative;
    if (!is_dir(dirname($path)) && !mkdir(dirname($path), 0775, true) && !is_dir(dirname($path))) {
        echo json_encode(['applied' => false, 'reason' => 'cannot create ' . dirname($path)]) . "\n";
        exit(1);
    }
    if (file_put_contents($path, $content) === false) {
        echo json_encode(['applied' => false, 'reason' => 'cannot write ' . $path]) . "\n";
        exit(1);
    }
}
$magento('module:enable ' . MODULE_NAME);
$magento('setup:upgrade --keep-generated');
$magento('setup:di:compile');
$magento('cache:flush');
echo json_encode(['applied' => true, 'module' => MODULE_NAME, 'code' => TOTAL_CODE, 'base_amount' => 2.5, 'title' => 'Test fee']) . "\n";

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\System\Message;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\AuthorizationInterface;
use Magento\Framework\Notification\MessageInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use Magentofullstackdev\HyperionCheckout\Model\System\Message\UnsupportedPaymentMethods;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The admin system message about hidden payment methods: shown to allowed
 * users for store views with the Hyperion checkout on, a list of at most ten
 * pairs, an identity that changes with the list.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\System\Message\UnsupportedPaymentMethods
 */
class UnsupportedPaymentMethodsTest extends TestCase
{
    private const REPORT = [
        1 => ['methods' => ['amazon' => 'Amazon Pay', 'adyen' => 'Adyen'], 'checked_at' => 'now'],
        2 => ['methods' => ['amazon' => 'Amazon Pay'], 'checked_at' => 'now'],
        3 => ['methods' => ['klarna' => 'Klarna'], 'checked_at' => 'now'],
    ];

    public function testShowsThePairsOfStoreViewsWithTheCheckoutOn(): void
    {
        $message = $this->message(self::REPORT, [1, 2]);

        self::assertTrue($message->isDisplayed());
        self::assertSame(MessageInterface::SEVERITY_MAJOR, $message->getSeverity());
        self::assertSame(
            'Hyperion Checkout: 2 active payment method(s) have no checkout renderer and are hidden from shoppers:'
            . ' amazon (Default), adyen (Default), amazon (Italiano). Details: Stores > Configuration >'
            . ' Hyperion Theme > Checkout.',
            $message->getText()
        );
    }

    public function testHiddenWhenTheCheckoutIsOffEverywhere(): void
    {
        self::assertFalse($this->message(self::REPORT, [])->isDisplayed());
    }

    public function testHiddenFromUsersWithoutTheConfigurationResource(): void
    {
        self::assertFalse($this->message(self::REPORT, [1, 2, 3], false)->isDisplayed());
    }

    public function testHiddenWhenNothingIsHidden(): void
    {
        self::assertFalse($this->message([1 => ['methods' => [], 'checked_at' => 'now']], [1])->isDisplayed());
    }

    public function testListsTenPairsAndCountsTheRest(): void
    {
        $methods = [];
        for ($i = 1; $i <= 13; $i++) {
            $methods[sprintf('method_%02d', $i)] = 'Method ' . $i;
        }
        $text = $this->message([1 => ['methods' => $methods, 'checked_at' => 'now']], [1])->getText();

        self::assertStringContainsString('13 active payment method(s)', $text);
        self::assertStringContainsString('method_10 (Default) and 3 more.', $text);
        self::assertStringNotContainsString('method_11', $text);
    }

    public function testTheIdentityChangesWithTheList(): void
    {
        $first = $this->message(self::REPORT, [1])->getIdentity();
        $same = $this->message(self::REPORT, [1])->getIdentity();
        $changed = $this->message(self::REPORT, [1, 3])->getIdentity();

        self::assertSame($first, $same);
        self::assertNotSame($first, $changed);
    }

    /**
     * @param array<int, array{methods: array<string, string>, checked_at: string}> $rows
     * @param int[] $enabledStores
     */
    private function message(array $rows, array $enabledStores, bool $allowed = true): UnsupportedPaymentMethods
    {
        $report = $this->createStub(UnsupportedMethodsReport::class);
        $report->method('getAll')->willReturn($rows);
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(
            static fn(string $path, string $scope, int $storeId): bool => in_array($storeId, $enabledStores, true)
        );
        $stores = [];
        foreach ([1 => 'Default', 2 => 'Italiano', 3 => 'Deutsch'] as $id => $name) {
            $store = $this->createStub(Store::class);
            $store->method('getName')->willReturn($name);
            $stores[$id] = $store;
        }
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStores')->willReturn($stores);
        $authorization = $this->createStub(AuthorizationInterface::class);
        $authorization->method('isAllowed')->willReturn($allowed);

        return new UnsupportedPaymentMethods(
            $report,
            $scopeConfig,
            $storeManager,
            $authorization,
            $this->createStub(LoggerInterface::class)
        );
    }
}

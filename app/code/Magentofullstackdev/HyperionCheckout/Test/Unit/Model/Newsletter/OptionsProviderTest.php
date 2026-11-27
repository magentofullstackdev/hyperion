<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Newsletter;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\Config;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\OptionsProvider;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\SubscriptionBridge;
use Magentofullstackdev\HyperionCheckout\Model\OrderComment\Config as OrderCommentConfig;
use Magentofullstackdev\HyperionCheckout\Model\OrderComment\OptionsProvider as OrderCommentOptions;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Newsletter\OptionsProvider
 * @covers \Magentofullstackdev\HyperionCheckout\Model\OrderComment\OptionsProvider
 */
class OptionsProviderTest extends TestCase
{
    private function provider(
        bool $enabled = true,
        bool $available = true,
        bool $loggedIn = false,
        bool $guestsAllowed = true,
        bool $subscribed = false,
        bool $checked = false
    ): OptionsProvider {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnMap([
            [Config::XML_PATH_ENABLED, 'store', 1, $enabled],
            [Config::XML_PATH_CHECKED_BY_DEFAULT, 'store', 1, $checked],
        ]);
        $bridge = $this->createStub(SubscriptionBridge::class);
        $bridge->method('isAvailable')->willReturn($available);
        $bridge->method('isGuestSubscriptionAllowed')->willReturn($guestsAllowed);
        $bridge->method('isCustomerSubscribed')->willReturn($subscribed);
        $store = $this->createStub(StoreInterface::class);
        $store->method('getWebsiteId')->willReturn(1);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $session = $this->createStub(CustomerSession::class);
        $session->method('isLoggedIn')->willReturn($loggedIn);
        $session->method('getCustomerId')->willReturn($loggedIn ? 42 : null);
        return new OptionsProvider(new Config($scopeConfig), $bridge, $session, $storeManager);
    }

    private function quote(): CartInterface
    {
        $quote = $this->createStub(CartInterface::class);
        $quote->method('getStoreId')->willReturn(1);
        return $quote;
    }

    public function testAGuestWhoMaySubscribeGetsAnUncheckedBox(): void
    {
        self::assertSame(['checked' => false], $this->provider()->getOptions($this->quote()));
    }

    public function testTheBoxStartsTickedOnlyWhenTheStoreSaysSo(): void
    {
        self::assertSame(['checked' => true], $this->provider(checked: true)->getOptions($this->quote()));
    }

    public function testACustomerWhoIsNotSubscribedGetsTheBox(): void
    {
        self::assertSame(['checked' => false], $this->provider(loggedIn: true)->getOptions($this->quote()));
    }

    /**
     * @return array<string, array{0: array<string, bool>}>
     */
    public static function skipped(): array
    {
        return [
            'feature off' => [['enabled' => false]],
            'newsletter module unavailable' => [['available' => false]],
            'guest when guests may not subscribe' => [['guestsAllowed' => false]],
            'customer already subscribed' => [['loggedIn' => true, 'subscribed' => true]],
        ];
    }

    /**
     * @param array<string, bool> $state
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('skipped')]
    public function testTheEntryIsSkippedWhenTheOptInDoesNotApply(array $state): void
    {
        $this->expectException(SkipExtensionException::class);

        $this->provider(...$state)->getOptions($this->quote());
    }

    public function testTheOrderCommentEntryCarriesTheMaximumLengthOrIsSkipped(): void
    {
        $on = $this->createStub(ScopeConfigInterface::class);
        $on->method('isSetFlag')->willReturn(true);
        $on->method('getValue')->willReturn('300');
        self::assertSame(['maxLength' => 300], (new OrderCommentOptions(new OrderCommentConfig($on)))->getOptions($this->quote()));

        $off = $this->createStub(ScopeConfigInterface::class);
        $off->method('isSetFlag')->willReturn(false);
        $this->expectException(SkipExtensionException::class);
        (new OrderCommentOptions(new OrderCommentConfig($off)))->getOptions($this->quote());
    }
}

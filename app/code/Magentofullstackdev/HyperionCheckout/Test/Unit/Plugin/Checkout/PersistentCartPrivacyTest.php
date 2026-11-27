<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Plugin\Checkout;

use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Persistent\Helper\Session as PersistentSessionHelper;
use Magentofullstackdev\HyperionCheckout\Plugin\Checkout\PersistentCartPrivacy;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Checkout\PersistentCartPrivacy
 */
class PersistentCartPrivacyTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private static function coreConfig(): array
    {
        return [
            'formKey' => 'abc',
            'isCustomerLoggedIn' => false,
            'customerData' => [],
            'quoteData' => [
                'entity_id' => 'maskedQuoteId0123456789abcdefABCD',
                'is_virtual' => 0,
                'quote_currency_code' => 'EUR',
                'base_currency_code' => 'USD',
                'base_to_quote_rate' => '0.92',
                'customer_id' => '7',
                'customer_email' => 'roni_cost@example.com',
                'customer_firstname' => 'Veronica',
                'customer_lastname' => 'Costello',
                'customer_dob' => '1973-12-15',
                'items_qty' => 2,
                'extension_attributes' => ['shipping_assignments' => [['shipping' => ['address' => ['telephone' => '1']]]]],
            ],
            'validatedEmailValue' => 'roni_cost@example.com',
            'shippingAddressFromData' => ['street' => ['6146 Honey Bluff Parkway'], 'telephone' => '(555) 229-3326'],
            'billingAddressFromData' => ['street' => ['6146 Honey Bluff Parkway']],
            'isShippingAddressFromDataValid' => true,
            'isBillingAddressFromDataValid' => true,
            'storeCode' => 'default',
        ];
    }

    private function plugin(
        bool $loggedIn,
        bool $moduleEnabled,
        ?bool $persistent,
        ?ObjectManagerInterface $objectManager = null
    ): PersistentCartPrivacy {
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturn($moduleEnabled);
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn($loggedIn);
        if ($objectManager === null) {
            $helper = $this->createStub(PersistentSessionHelper::class);
            $helper->method('isPersistent')->willReturn((bool) $persistent);
            $objectManager = $this->createStub(ObjectManagerInterface::class);
            $objectManager->method('get')->willReturn($helper);
        }
        return new PersistentCartPrivacy(
            $moduleManager,
            $objectManager,
            $customerSession,
            $this->createStub(LoggerInterface::class)
        );
    }

    private function subject(): CompositeConfigProvider
    {
        return $this->createStub(CompositeConfigProvider::class);
    }

    public function testAShopperWithoutAPersistentSessionKeepsTheConfiguration(): void
    {
        $result = $this->plugin(false, true, false)->afterGetConfig($this->subject(), self::coreConfig());

        self::assertSame(self::coreConfig(), $result);
    }

    public function testASignedInCustomerWithAPersistentSessionKeepsTheConfiguration(): void
    {
        $result = $this->plugin(true, true, true)->afterGetConfig($this->subject(), self::coreConfig());

        self::assertSame(self::coreConfig(), $result);
    }

    public function testARememberedNotSignedInShopperGetsNoPersonalData(): void
    {
        $result = $this->plugin(false, true, true)->afterGetConfig($this->subject(), self::coreConfig());

        foreach (PersistentCartPrivacy::REMOVED_KEYS as $key) {
            self::assertArrayNotHasKey($key, $result);
        }
        self::assertSame([
            'entity_id' => 'maskedQuoteId0123456789abcdefABCD',
            'is_virtual' => 0,
            'quote_currency_code' => 'EUR',
            'base_currency_code' => 'USD',
            'base_to_quote_rate' => '0.92',
        ], $result['quoteData']);
        self::assertStringNotContainsString('roni_cost', (string) json_encode($result));
        self::assertStringNotContainsString('Honey Bluff', (string) json_encode($result));
        self::assertSame('abc', $result['formKey']);
        self::assertSame('default', $result['storeCode']);
        self::assertSame([], $result['customerData']);
    }

    public function testWithoutThePersistentModuleTheHelperIsNeverResolved(): void
    {
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects(self::never())->method('get');

        $result = $this->plugin(false, false, null, $objectManager)
            ->afterGetConfig($this->subject(), self::coreConfig());

        self::assertSame(self::coreConfig(), $result);
    }

    public function testAnUnreadablePersistentSessionStripsTheCustomerKeysAndLogs(): void
    {
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturn(true);
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn(false);
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willThrowException(new \RuntimeException('boom'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $plugin = new PersistentCartPrivacy($moduleManager, $objectManager, $customerSession, $logger);
        $result = $plugin->afterGetConfig($this->subject(), self::coreConfig());

        foreach (PersistentCartPrivacy::REMOVED_KEYS as $key) {
            self::assertArrayNotHasKey($key, $result);
        }
        self::assertSame(PersistentCartPrivacy::QUOTE_DATA_ALLOWED, array_keys($result['quoteData']));
        self::assertSame('abc', $result['formKey']);
    }

    public function testASignedInCustomerNeverReachesThePersistentState(): void
    {
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturn(true);
        $customerSession = $this->createStub(CustomerSession::class);
        $customerSession->method('isLoggedIn')->willReturn(true);
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects(self::never())->method('get');

        $plugin = new PersistentCartPrivacy(
            $moduleManager,
            $objectManager,
            $customerSession,
            $this->createStub(LoggerInterface::class)
        );

        self::assertSame(self::coreConfig(), $plugin->afterGetConfig($this->subject(), self::coreConfig()));
    }
}

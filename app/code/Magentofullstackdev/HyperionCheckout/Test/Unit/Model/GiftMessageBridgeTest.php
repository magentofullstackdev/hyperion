<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model;

use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magentofullstackdev\HyperionCheckout\Model\GiftMessageBridge;
use PHPUnit\Framework\TestCase;

/**
 * The checkout gets core's gift message configuration with every stored
 * message reduced to its id, sender, recipient and text.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\GiftMessageBridge
 */
class GiftMessageBridgeTest extends TestCase
{
    private const PROVIDER = 'Magento\GiftMessage\Model\GiftMessageConfigProvider';

    protected function setUp(): void
    {
        if (!class_exists('Magento\GiftMessage\Helper\Message') || !class_exists(self::PROVIDER)) {
            self::markTestSkipped('Magento_GiftMessage is not installed.');
        }
    }

    /**
     * A message as core's provider relays it (`MessageInterface::getData()`).
     *
     * @return array<string, string>
     */
    private static function stored(string $id, string $text): array
    {
        return [
            'gift_message_id' => $id,
            'customer_id' => '1',
            'sender' => 'Veronica Costello',
            'recipient' => 'Ann',
            'message' => $text,
        ];
    }

    /**
     * @param array<string, mixed> $config what core's provider answers
     */
    private function bridge(array $config): GiftMessageBridge
    {
        $modules = $this->createStub(ModuleManager::class);
        $modules->method('isEnabled')->willReturn(true);
        $provider = new class ($config) {
            /**
             * @param array<string, mixed> $config
             */
            public function __construct(private readonly array $config)
            {
            }

            /**
             * @return array<string, mixed>
             */
            public function getConfig(): array
            {
                return $this->config;
            }
        };
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willReturnCallback(
            static fn (string $class) => $class === self::PROVIDER ? $provider : throw new \LogicException($class)
        );

        return new GiftMessageBridge($modules, $objectManager);
    }

    public function testStoredMessagesKeepTheirTextsAndLoseTheAuthorsCustomerId(): void
    {
        $config = $this->bridge([
            'giftMessage' => [
                'orderLevel' => self::stored('33', 'Happy birthday'),
                'itemLevel' => [
                    '5173' => ['is_available' => true, 'message' => self::stored('34', 'For the trip')],
                    '5174' => ['is_available' => false],
                    '5175' => [],
                ],
            ],
            'isOrderLevelGiftOptionsEnabled' => true,
            'isItemLevelGiftOptionsEnabled' => true,
            'priceFormat' => ['pattern' => '$%s'],
            'storeCode' => 'en_us',
            'isCustomerLoggedIn' => false,
            'formKey' => 'abc',
            'baseUrl' => 'https://shop.test/',
        ])->getCheckoutConfig();

        self::assertSame(
            [
                'giftMessage' => [
                    'orderLevel' => [
                        'gift_message_id' => '33',
                        'sender' => 'Veronica Costello',
                        'recipient' => 'Ann',
                        'message' => 'Happy birthday',
                    ],
                    'itemLevel' => [
                        '5173' => [
                            'is_available' => true,
                            'message' => [
                                'gift_message_id' => '34',
                                'sender' => 'Veronica Costello',
                                'recipient' => 'Ann',
                                'message' => 'For the trip',
                            ],
                        ],
                        '5174' => ['is_available' => false],
                        '5175' => [],
                    ],
                ],
                'isOrderLevelGiftOptionsEnabled' => true,
                'isItemLevelGiftOptionsEnabled' => true,
            ],
            $config
        );
    }

    public function testACartWithoutStoredMessagesIsRelayedAsCoreBuiltIt(): void
    {
        $giftMessage = ['orderLevel' => true, 'itemLevel' => true];

        self::assertSame(
            ['giftMessage' => $giftMessage, 'isItemLevelGiftOptionsEnabled' => false],
            $this->bridge(['giftMessage' => $giftMessage, 'isItemLevelGiftOptionsEnabled' => false])
                ->getCheckoutConfig()
        );
    }

    public function testNothingIsRelayedWhileTheModuleIsDisabled(): void
    {
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects(self::never())->method('get');
        $modules = $this->createStub(ModuleManager::class);
        $modules->method('isEnabled')->willReturn(false);

        self::assertSame([], (new GiftMessageBridge($modules, $objectManager))->getCheckoutConfig());
    }
}

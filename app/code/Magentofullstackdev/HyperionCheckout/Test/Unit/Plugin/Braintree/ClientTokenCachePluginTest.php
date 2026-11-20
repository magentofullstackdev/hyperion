<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Plugin\Braintree;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Plugin\Braintree\ClientTokenCachePlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Braintree\ClientTokenCachePlugin
 */
class ClientTokenCachePluginTest extends TestCase
{
    private const SHARED_PARAMS = ['merchantAccountId' => 'store_eur'];

    /**
     * @var int
     */
    private int $gatewayCalls = 0;

    protected function setUp(): void
    {
        $this->gatewayCalls = 0;
    }

    public function testEqualParamsAskTheGatewayOnce(): void
    {
        $plugin = $this->createPlugin($this->emptyCache());
        $proceed = $this->gateway('token-a');

        $tokens = [];
        for ($i = 0; $i < 3; $i++) {
            $tokens[] = $plugin->aroundGenerate($this->subject(), $proceed, self::SHARED_PARAMS);
        }

        self::assertSame(['token-a', 'token-a', 'token-a'], $tokens);
        self::assertSame(1, $this->gatewayCalls);
    }

    public function testDifferentParamsAskTheGatewaySeparately(): void
    {
        $plugin = $this->createPlugin($this->emptyCache());
        $proceed = $this->gateway('token-a', 'token-b');

        $first = $plugin->aroundGenerate($this->subject(), $proceed, ['merchantAccountId' => 'store_eur']);
        $second = $plugin->aroundGenerate($this->subject(), $proceed, ['merchantAccountId' => 'store_usd']);
        $empty = $plugin->aroundGenerate($this->subject(), $proceed, []);

        self::assertSame('token-a', $first);
        self::assertSame('token-b', $second);
        self::assertSame('token-b', $empty);
        self::assertSame(3, $this->gatewayCalls);
    }

    public function testCachedTokenIsReturnedWithoutTheGateway(): void
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn('cached-token');
        $plugin = $this->createPlugin($cache);

        $token = $plugin->aroundGenerate($this->subject(), $this->gateway('fresh-token'), self::SHARED_PARAMS);

        self::assertSame('cached-token', $token);
        self::assertSame(0, $this->gatewayCalls);
    }

    public function testFreshTokenIsSavedWithTheConfigTagForThirtyMinutes(): void
    {
        $cache = $this->createMock(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $cache->expects(self::once())
            ->method('save')
            ->with(
                'token-a',
                self::stringStartsWith(ClientTokenCachePlugin::CACHE_KEY_PREFIX),
                [Config::CACHE_TAG],
                1800
            )
            ->willReturn(true);
        $plugin = $this->createPlugin($cache);

        $plugin->aroundGenerate($this->subject(), $this->gateway('token-a'), self::SHARED_PARAMS);
        $plugin->aroundGenerate($this->subject(), $this->gateway('token-a'), self::SHARED_PARAMS);

        self::assertSame(1, $this->gatewayCalls);
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function privateParamsProvider(): array
    {
        return [
            'customer token' => [['customerId' => '12345', 'merchantAccountId' => 'store_eur']],
            'customer token without merchant account' => [['customerId' => '12345']],
            'other gateway option' => [['merchantAccountId' => 'store_eur', 'options' => ['verifyCard' => true]]],
        ];
    }

    /**
     * @param array<string, mixed> $params
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('privateParamsProvider')]
    public function testPrivateTokenNeverTouchesTheAppCacheButIsReusedInTheRequest(array $params): void
    {
        $cache = $this->createMock(CacheInterface::class);
        $cache->expects(self::never())->method('load');
        $cache->expects(self::never())->method('save');
        $plugin = $this->createPlugin($cache);
        $proceed = $this->gateway('customer-token');

        $first = $plugin->aroundGenerate($this->subject(), $proceed, $params);
        $second = $plugin->aroundGenerate($this->subject(), $proceed, $params);

        self::assertSame('customer-token', $first);
        self::assertSame('customer-token', $second);
        self::assertSame(1, $this->gatewayCalls);
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function unusableTokenProvider(): array
    {
        return [
            'empty string after a gateway error' => [''],
            'null' => [null],
            'false' => [false],
            'array' => [['token']],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('unusableTokenProvider')]
    public function testUnusableTokenIsNeverSaved(mixed $result): void
    {
        $cache = $this->createMock(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $cache->expects(self::never())->method('save');
        $plugin = $this->createPlugin($cache);
        $proceed = $this->gateway($result);

        $first = $plugin->aroundGenerate($this->subject(), $proceed, self::SHARED_PARAMS);
        $second = $plugin->aroundGenerate($this->subject(), $proceed, self::SHARED_PARAMS);

        self::assertSame($result, $first);
        self::assertSame($result, $second);
        self::assertSame(1, $this->gatewayCalls);
    }

    public function testStoreEnvironmentAndMerchantSeparateTheKeys(): void
    {
        $keys = [];
        $cache = $this->createMock(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $cache->expects(self::exactly(6))
            ->method('save')
            ->willReturnCallback(static function (string $data, string $key) use (&$keys): bool {
                $keys[] = $key;

                return true;
            });

        $variants = [
            [1, 'sandbox', 'merchant_a', 'merchant_a'],
            [2, 'sandbox', 'merchant_a', 'merchant_a'],
            [1, 'sandbox', 'merchant_b', 'merchant_a'],
            [1, 'production', 'merchant_a', 'merchant_a'],
            [1, 'sandbox', 'merchant_a', 'merchant_live_b'],
            [1, 'sandbox', 'merchant_a', 'merchant_a'],
        ];
        foreach ($variants as [$storeId, $environment, $configuredMerchant, $liveMerchant]) {
            $plugin = $this->createPlugin($cache, $storeId, $environment, $configuredMerchant);
            $plugin->aroundGenerate(
                $this->subject($environment, $liveMerchant),
                $this->gateway('token'),
                self::SHARED_PARAMS
            );
        }

        self::assertCount(6, $keys);
        self::assertCount(5, array_unique(array_slice($keys, 0, 5)));
        self::assertSame($keys[0], $keys[5]);
    }

    public function testARotatedPublicKeyGetsItsOwnCacheKey(): void
    {
        $keys = [];
        $cache = $this->createMock(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $cache->expects(self::exactly(2))
            ->method('save')
            ->willReturnCallback(static function (string $data, string $key) use (&$keys): bool {
                $keys[] = $key;

                return true;
            });

        foreach (['public_a', 'public_b'] as $publicKey) {
            $this->createPlugin($cache)->aroundGenerate(
                $this->subject('sandbox', 'merchant_a', $publicKey),
                $this->gateway('token'),
                self::SHARED_PARAMS
            );
        }

        self::assertNotSame($keys[0], $keys[1]);
        self::assertStringNotContainsString('public_a', $keys[0]);
    }

    public function testProductionReadsTheProductionMerchantId(): void
    {
        $keys = [];
        $cache = $this->createMock(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $cache->expects(self::exactly(3))
            ->method('save')
            ->willReturnCallback(static function (string $data, string $key) use (&$keys): bool {
                $keys[] = $key;

                return true;
            });

        $configs = [
            ['merchant_id' => 'live_a', 'sandbox_merchant_id' => 'test_a'],
            ['merchant_id' => 'live_a', 'sandbox_merchant_id' => 'test_b'],
            ['merchant_id' => 'live_b', 'sandbox_merchant_id' => 'test_a'],
        ];
        foreach ($configs as $config) {
            $plugin = $this->createPluginWithConfig($cache, 1, [
                ClientTokenCachePlugin::PATH_ENVIRONMENT => 'production',
                ClientTokenCachePlugin::PATH_MERCHANT_ID => $config['merchant_id'],
                ClientTokenCachePlugin::PATH_SANDBOX_MERCHANT_ID => $config['sandbox_merchant_id'],
            ]);
            $plugin->aroundGenerate($this->subject('production', 'live'), $this->gateway('token'), self::SHARED_PARAMS);
        }

        self::assertSame($keys[0], $keys[1]);
        self::assertNotSame($keys[0], $keys[2]);
    }

    public function testParamOrderDoesNotChangeTheKey(): void
    {
        $plugin = $this->createPlugin($this->emptyCache());
        $proceed = $this->gateway('customer-token');

        $plugin->aroundGenerate($this->subject(), $proceed, ['customerId' => '7', 'merchantAccountId' => 'eur']);
        $plugin->aroundGenerate($this->subject(), $proceed, ['merchantAccountId' => 'eur', 'customerId' => '7']);

        self::assertSame(1, $this->gatewayCalls);
    }

    public function testCacheFailureFallsBackToTheGatewayAndLogs(): void
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willThrowException(new \RuntimeException('cache backend down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning');
        $plugin = $this->createPlugin($cache, 1, 'sandbox', 'merchant_a', $logger);

        $proceed = $this->gateway('token-a');

        $first = $plugin->aroundGenerate($this->subject(), $proceed, self::SHARED_PARAMS);
        $second = $plugin->aroundGenerate($this->subject(), $proceed, self::SHARED_PARAMS);

        self::assertSame('token-a', $first);
        self::assertSame('token-a', $second);
        self::assertSame(1, $this->gatewayCalls);
    }

    private function emptyCache(): CacheInterface
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $cache->method('save')->willReturn(true);

        return $cache;
    }

    /**
     * A `$proceed` that answers the given results in order and counts its calls.
     */
    private function gateway(mixed ...$results): \Closure
    {
        return function (array $params) use ($results): mixed {
            $index = min($this->gatewayCalls, count($results) - 1);
            $this->gatewayCalls++;

            return $results[$index];
        };
    }

    private function subject(
        string $environment = 'sandbox',
        string $merchantId = 'merchant_a',
        string $publicKey = 'public_a'
    ): object {
        return new class ($environment, $merchantId, $publicKey) {
            public function __construct(
                private readonly string $env,
                private readonly string $merchant,
                private readonly string $public
            ) {
            }

            public function publicKey(?string $value = null): string
            {
                return $this->public;
            }

            public function environment(?string $value = null): string
            {
                return $this->env;
            }

            public function merchantId(?string $value = null): string
            {
                return $this->merchant;
            }
        };
    }

    private function createPlugin(
        CacheInterface $cache,
        int $storeId = 1,
        string $environment = 'sandbox',
        string $merchantId = 'merchant_a',
        ?LoggerInterface $logger = null
    ): ClientTokenCachePlugin {
        return $this->createPluginWithConfig(
            $cache,
            $storeId,
            [
                ClientTokenCachePlugin::PATH_ENVIRONMENT => $environment,
                ClientTokenCachePlugin::PATH_MERCHANT_ID => $merchantId,
                ClientTokenCachePlugin::PATH_SANDBOX_MERCHANT_ID => $merchantId,
            ],
            $logger
        );
    }

    /**
     * @param array<string, string> $values
     */
    private function createPluginWithConfig(
        CacheInterface $cache,
        int $storeId,
        array $values,
        ?LoggerInterface $logger = null
    ): ClientTokenCachePlugin {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(
            static fn (string $path): ?string => $values[$path] ?? null
        );
        $store = $this->createStub(StoreInterface::class);
        $store->method('getId')->willReturn($storeId);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        return new ClientTokenCachePlugin(
            $cache,
            $scopeConfig,
            $storeManager,
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }
}

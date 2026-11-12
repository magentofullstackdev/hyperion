<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Security;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magentofullstackdev\HyperionCore\Model\Security\ClientAddress;
use Magentofullstackdev\HyperionCore\Model\Security\RateLimiter;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\Model\Security\RateLimiter
 */
class RateLimiterTest extends TestCase
{
    /** @var array<string, string> */
    private array $store = [];
    /** @var ScopeConfigInterface&Stub */
    private ScopeConfigInterface $scopeConfig;
    /** @var ClientAddress&Stub */
    private ClientAddress $clientAddress;
    private RateLimiter $limiter;

    protected function setUp(): void
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturnCallback(fn (string $id) => $this->store[$id] ?? false);
        $cache->method('save')->willReturnCallback(function (string $data, string $id, array $tags, $lifetime): bool {
            self::assertSame(RateLimiter::WINDOW_SECONDS * 2, $lifetime);
            self::assertSame([], $tags, 'a counter expires on its own and carries no cache tag');
            $this->store[$id] = $data;
            return true;
        });
        $this->scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $this->clientAddress = $this->createStub(ClientAddress::class);
        $this->clientAddress->method('get')->willReturn('203.0.113.9');
        $this->limiter = new RateLimiter($cache, $this->scopeConfig, $this->clientAddress, [
            'search_suggest' => 'hyperion/security/search_suggest_limit',
            'category_filter' => 'hyperion/security/catalog_filter_limit',
        ]);
    }

    public function testTheBudgetOfAGroupIsSpentAfterTheLimitWithinOneWindow(): void
    {
        $this->scopeConfig->method('isSetFlag')->willReturn(true);
        $this->scopeConfig->method('getValue')->willReturnMap([
            ['hyperion/security/search_suggest_limit', 'store', null, '3'],
            ['hyperion/security/catalog_filter_limit', 'store', null, '1'],
        ]);

        self::assertTrue($this->limiter->hit('search_suggest'));
        self::assertTrue($this->limiter->hit('search_suggest'));
        self::assertTrue($this->limiter->hit('search_suggest'));
        self::assertFalse($this->limiter->hit('search_suggest'), 'the 4th request of the window is refused');
        self::assertTrue($this->limiter->hit('category_filter'), 'groups own separate counters');
        self::assertFalse($this->limiter->hit('category_filter'));
        self::assertCount(2, $this->store);
    }

    public function testDisabledLimiterUnknownGroupAndZeroLimitAlwaysAllow(): void
    {
        $this->scopeConfig->method('isSetFlag')->willReturn(false);
        for ($i = 0; $i < 50; $i++) {
            self::assertTrue($this->limiter->hit('search_suggest'));
        }
        self::assertSame(0, $this->limiter->limit('search_suggest'));
        self::assertSame(0, $this->limiter->limit('no_such_group'));
        self::assertSame([], $this->store, 'nothing is counted while the limiter is off');
    }

    public function testAnUnknownClientIsNeverLimited(): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturn(true);
        $scopeConfig->method('getValue')->willReturn('1');
        $clientAddress = $this->createStub(ClientAddress::class);
        $clientAddress->method('get')->willReturn('');
        $cache = $this->createMock(CacheInterface::class);
        $cache->expects(self::never())->method('save');
        $limiter = new RateLimiter($cache, $scopeConfig, $clientAddress, ['g' => 'path']);

        self::assertTrue($limiter->hit('g'));
        self::assertTrue($limiter->hit('g'));
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalogMode\Test\Unit\Model;

use Magento\Customer\Model\Context as CustomerContext;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Http\Context as HttpContext;
use Magentofullstackdev\HyperionCatalogMode\Model\Config;
use Magentofullstackdev\HyperionCatalogMode\Model\Restriction;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCatalogMode\Model\Restriction
 */
class RestrictionTest extends TestCase
{
    /** @var Config&Stub */
    private Config $config;
    /** @var HttpContext&Stub */
    private HttpContext $httpContext;
    /** @var CustomerSession&Stub */
    private CustomerSession $session;
    private Restriction $restriction;

    protected function setUp(): void
    {
        $this->config = $this->createStub(Config::class);
        $this->httpContext = $this->createStub(HttpContext::class);
        $this->session = $this->createStub(CustomerSession::class);
        $this->restriction = $this->restriction();
    }

    /**
     * The config and the session are stubs unless the test hands in a mock
     * whose calls it verifies.
     */
    private function restriction(?Config $config = null, ?CustomerSession $session = null): Restriction
    {
        return new Restriction($config ?? $this->config, $this->httpContext, $session ?? $this->session);
    }

    public function testDisabledModeNeverRestricts(): void
    {
        $config = $this->createMock(Config::class);
        $config->method('isEnabled')->willReturn(false);
        $config->expects(self::never())->method('getAllowedGroupIds');

        self::assertFalse($this->restriction($config)->isRestricted());
    }

    public function testGroupFromTheHttpContextWins(): void
    {
        $this->config->method('isEnabled')->willReturn(true);
        $this->config->method('getAllowedGroupIds')->willReturn([2]);
        $this->httpContext->method('getValue')->willReturnCallback(
            static fn (string $name) => $name === CustomerContext::CONTEXT_GROUP ? '2' : null
        );
        $session = $this->createMock(CustomerSession::class);
        $session->expects(self::never())->method('getCustomerGroupId');

        self::assertFalse($this->restriction(null, $session)->isRestricted());
    }

    public function testSessionGroupIsTheFallback(): void
    {
        $this->config->method('isEnabled')->willReturn(true);
        $this->config->method('getAllowedGroupIds')->willReturn([1, 2]);
        $this->httpContext->method('getValue')->willReturn(null);
        $this->session->method('getCustomerGroupId')->willReturn(0);

        self::assertTrue($this->restriction->isRestricted());
    }

    public function testNoAllowedGroupMeansNobodyBuys(): void
    {
        $this->config->method('isEnabled')->willReturn(true);
        $this->config->method('getAllowedGroupIds')->willReturn([]);
        $this->httpContext->method('getValue')->willReturn('1');

        self::assertTrue($this->restriction->isRestricted());
    }

    public function testMessageFollowsTheSessionWhenTheContextIsSilent(): void
    {
        $this->httpContext->method('getValue')->willReturn(null);
        $this->session->method('isLoggedIn')->willReturnOnConsecutiveCalls(false, true);

        self::assertSame('Please log in to purchase items.', (string) $this->restriction->getMessage());
        self::assertSame('Your account is not allowed to purchase items.', (string) $this->restriction->getMessage());
    }

    public function testMessageFollowsTheHttpContextOnCacheablePages(): void
    {
        $this->httpContext->method('getValue')->willReturnCallback(
            static fn (string $name) => $name === CustomerContext::CONTEXT_AUTH ? true : null
        );
        $session = $this->createMock(CustomerSession::class);
        $session->expects(self::never())->method('isLoggedIn');

        self::assertSame('Your account is not allowed to purchase items.', (string) $this->restriction(null, $session)->getMessage());
    }
}

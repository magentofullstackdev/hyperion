<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Purchase;

use Magento\Framework\Phrase;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use Magentofullstackdev\HyperionCore\Model\Purchase\RestrictionInterface;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCore\Model\Purchase\Availability
 */
class AvailabilityTest extends TestCase
{
    /** @var LoggerInterface&Stub */
    private LoggerInterface $logger;

    protected function setUp(): void
    {
        $this->logger = $this->createStub(LoggerInterface::class);
    }

    public function testWithoutRulesEverybodyMayBuy(): void
    {
        $availability = new Availability($this->logger);

        self::assertTrue($availability->canPurchase());
        self::assertSame('', $availability->getMessage());
    }

    public function testFirstRestrictingRuleWinsAndIsEvaluatedOnce(): void
    {
        $allowing = $this->createMock(RestrictionInterface::class);
        $allowing->expects(self::once())->method('isRestricted')->willReturn(false);
        $allowing->expects(self::never())->method('getMessage');

        $restricting = $this->createMock(RestrictionInterface::class);
        $restricting->expects(self::once())->method('isRestricted')->willReturn(true);
        $restricting->method('getMessage')->willReturn(new Phrase('Please log in to purchase items.'));

        $later = $this->createMock(RestrictionInterface::class);
        $later->expects(self::never())->method('isRestricted');

        $availability = new Availability($this->logger, ['a' => $allowing, 'b' => $restricting, 'c' => $later]);

        self::assertFalse($availability->canPurchase());
        self::assertFalse($availability->canPurchase());
        self::assertSame('Please log in to purchase items.', $availability->getMessage());
    }

    public function testFailingRuleIsLoggedAndIgnored(): void
    {
        $broken = $this->createStub(RestrictionInterface::class);
        $broken->method('isRestricted')->willThrowException(new \RuntimeException('boom'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('"broken"'));

        $availability = new Availability($logger, ['broken' => $broken]);

        self::assertTrue($availability->canPurchase());
    }

    public function testRejectsForeignObjects(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        /** @phpstan-ignore-next-line the wrong type is the point of the test */
        new Availability($this->logger, ['x' => new \stdClass()]);
    }
}

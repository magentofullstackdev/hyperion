<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment;

use Magento\Framework\FlagManager;
use Magento\Framework\Stdlib\DateTime\DateTime;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use PHPUnit\Framework\TestCase;

/**
 * The stored report of hidden payment methods: written only when a store
 * view's list changed (or on request), read back with normalized types.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport
 */
class UnsupportedMethodsReportTest extends TestCase
{
    public function testWritesAStoreViewSeenForTheFirstTime(): void
    {
        $flags = $this->createMock(FlagManager::class);
        $flags->method('getFlagData')->willReturn(null);
        $flags->expects(self::once())->method('saveFlag')->with(
            UnsupportedMethodsReport::FLAG_CODE,
            [1 => ['methods' => [], 'checked_at' => '2030-01-01T00:00:00+00:00']]
        );

        self::assertTrue($this->report($flags)->save(1, []));
    }

    public function testDoesNotWriteAnUnchangedList(): void
    {
        $flags = $this->createMock(FlagManager::class);
        $flags->method('getFlagData')->willReturn([
            '1' => ['methods' => ['amazon' => 'Amazon Pay', 'adyen' => 'Adyen'], 'checked_at' => 'earlier'],
        ]);
        $flags->expects(self::never())->method('saveFlag');

        self::assertFalse($this->report($flags)->save(1, ['adyen' => 'Adyen', 'amazon' => 'Amazon Pay']));
    }

    public function testWritesAChangedListAndKeepsTheOtherStoreViews(): void
    {
        $flags = $this->createMock(FlagManager::class);
        $flags->method('getFlagData')->willReturn([
            '1' => ['methods' => ['amazon' => 'Amazon Pay'], 'checked_at' => 'earlier'],
            '2' => ['methods' => [], 'checked_at' => 'earlier'],
        ]);
        $flags->expects(self::once())->method('saveFlag')->with(
            UnsupportedMethodsReport::FLAG_CODE,
            [
                1 => ['methods' => [], 'checked_at' => '2030-01-01T00:00:00+00:00'],
                2 => ['methods' => [], 'checked_at' => 'earlier'],
            ]
        );

        self::assertTrue($this->report($flags)->save(1, []));
    }

    public function testAForcedSaveRewritesAnUnchangedList(): void
    {
        $flags = $this->createMock(FlagManager::class);
        $flags->method('getFlagData')->willReturn(['1' => ['methods' => [], 'checked_at' => 'earlier']]);
        $flags->expects(self::once())->method('saveFlag');

        self::assertTrue($this->report($flags)->save(1, [], true));
    }

    public function testReadsBackNormalizedRowsAndSkipsMalformedOnes(): void
    {
        $flags = $this->createStub(FlagManager::class);
        $flags->method('getFlagData')->willReturn([
            '2' => ['methods' => ['amazon' => 'Amazon Pay'], 'checked_at' => 'later'],
            'default' => ['methods' => []],
            '1' => 'garbage',
        ]);

        self::assertSame(
            [2 => ['methods' => ['amazon' => 'Amazon Pay'], 'checked_at' => 'later']],
            $this->report($flags)->getAll()
        );
    }

    public function testClearDeletesTheFlag(): void
    {
        $flags = $this->createMock(FlagManager::class);
        $flags->expects(self::once())->method('deleteFlag')->with(UnsupportedMethodsReport::FLAG_CODE);

        $this->report($flags)->clear();
    }

    private function report(FlagManager $flags): UnsupportedMethodsReport
    {
        $dateTime = $this->createStub(DateTime::class);
        $dateTime->method('gmtDate')->willReturn('2030-01-01T00:00:00+00:00');
        return new UnsupportedMethodsReport($flags, $dateTime);
    }
}

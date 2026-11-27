<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Htmx;

use Magentofullstackdev\HyperionCore\Model\Htmx\HeaderStatePool;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The registered header fragments: sorted, normalized, and an incomplete
 * entry is reported once instead of disappearing silently.
 *
 * @covers \Magentofullstackdev\HyperionCore\Model\Htmx\HeaderStatePool
 */
class HeaderStatePoolTest extends TestCase
{
    public function testFragmentsComeInSortOrderWithAnEmptyTargetByDefault(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('warning');
        $pool = new HeaderStatePool($logger, [
            'wishlist' => ['handle' => 'h_wishlist', 'block' => 'b.wishlist', 'sort_order' => '20'],
            'account' => ['handle' => 'h_account', 'block' => 'b.account', 'target_id' => 'menu', 'sort_order' => 10],
        ]);

        self::assertSame(
            [
                ['handle' => 'h_account', 'block' => 'b.account', 'target_id' => 'menu'],
                ['handle' => 'h_wishlist', 'block' => 'b.wishlist', 'target_id' => ''],
            ],
            $pool->getFragments()
        );
    }

    public function testEachIncompleteEntryIsSkippedWithOneWarning(): void
    {
        $warnings = [];
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::exactly(3))->method('warning')->willReturnCallback(
            static function (string $message) use (&$warnings): void {
                $warnings[] = $message;
            }
        );
        $pool = new HeaderStatePool($logger, [
            'no_handle' => ['block' => 'b.one'],
            'no_block' => ['handle' => 'h_two', 'block' => ''],
            'not_an_array' => 'h_three',
            'good' => ['handle' => 'h_good', 'block' => 'b.good'],
        ]);

        $first = $pool->getFragments();
        $second = $pool->getFragments();

        self::assertSame([['handle' => 'h_good', 'block' => 'b.good', 'target_id' => '']], $first);
        self::assertSame($first, $second);
        self::assertStringContainsString('"no_handle"', $warnings[0]);
        self::assertStringContainsString('"no_block"', $warnings[1]);
        self::assertStringContainsString('"not_an_array"', $warnings[2]);
    }
}

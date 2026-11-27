<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\ViewModel;

use Magento\Framework\Serialize\Serializer\Json;
use Magentofullstackdev\HyperionCheckout\Model\Payment\ExpressButtonPool;
use Magentofullstackdev\HyperionCheckout\ViewModel\ExpressButtons;
use Magentofullstackdev\HyperionCore\ViewModel\Purchase;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * An express slot reserves the height of its buttons plus the gaps, carries
 * their configuration as JSON, and is empty when the visitor may not buy.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\ViewModel\ExpressButtons
 */
class ExpressButtonsTest extends TestCase
{
    public function testTheSlotReservesTheButtonsAndTheGapsBetweenThem(): void
    {
        $slot = $this->viewModel(true, [$this->button('a', 45), $this->button('b', 104)])->getSlot('cart');

        self::assertSame(45 + 8 + 104, $slot['reservedHeight']);
        self::assertSame(['a', 'b'], array_column($slot['buttons'], 'id'));
        $decoded = json_decode($slot['json'], false, 512, JSON_THROW_ON_ERROR);
        self::assertSame('a', $decoded[0]->id);
    }

    public function testOneButtonReservesItsOwnHeight(): void
    {
        self::assertSame(163, $this->viewModel(true, [$this->button('a', 163)])->getSlot('product')['reservedHeight']);
    }

    public function testEmptyOptionsAndPhrasesTravelAsObjects(): void
    {
        $json = $this->viewModel(true, [$this->button('a', 45)])->getSlot('cart')['json'];

        self::assertStringContainsString('"options":{}', $json);
        self::assertStringContainsString('"phrases":{}', $json);
    }

    public function testNoButtonWhenTheVisitorMayNotPurchase(): void
    {
        $pool = $this->createMock(ExpressButtonPool::class);
        $pool->expects(self::never())->method('getButtons');

        $slot = $this->viewModel(false, [], $pool)->getSlot('product');

        self::assertSame(['buttons' => [], 'json' => '', 'reservedHeight' => 0], $slot);
    }

    public function testNoButtonRegisteredMeansAnEmptySlot(): void
    {
        self::assertSame(
            ['buttons' => [], 'json' => '', 'reservedHeight' => 0],
            $this->viewModel(true, [])->getSlot('minicart')
        );
    }

    public function testAFailingPoolLeavesAnEmptySlotAndLogs(): void
    {
        $pool = $this->createStub(ExpressButtonPool::class);
        $pool->method('getButtons')->willThrowException(new \RuntimeException('broken'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $slot = $this->viewModel(true, [], $pool, $logger)->getSlot('cart');

        self::assertSame(0, $slot['reservedHeight']);
        self::assertSame('', $slot['json']);
    }

    /**
     * @return array<string, mixed>
     */
    private function button(string $id, int $height): array
    {
        return [
            'id' => $id,
            'tag' => 'vendor-' . $id,
            'moduleUrl' => 'https://shop.test/static/' . $id . '.js',
            'builtin' => null,
            'apiVersion' => '1',
            'reservedHeight' => $height,
            'sortOrder' => 0,
            'options' => [],
            'phrases' => [],
            'redirectHosts' => [],
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $buttons
     */
    private function viewModel(
        bool $canPurchase,
        array $buttons,
        ?ExpressButtonPool $pool = null,
        ?LoggerInterface $logger = null
    ): ExpressButtons {
        if ($pool === null) {
            $pool = $this->createStub(ExpressButtonPool::class);
            $pool->method('getButtons')->willReturn($buttons);
        }
        $purchase = $this->createStub(Purchase::class);
        $purchase->method('canPurchase')->willReturn($canPurchase);

        return new ExpressButtons($pool, $purchase, new Json(), $logger ?? $this->createStub(LoggerInterface::class));
    }
}

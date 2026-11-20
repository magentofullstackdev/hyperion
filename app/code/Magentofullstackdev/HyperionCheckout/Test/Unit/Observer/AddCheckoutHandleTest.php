<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Observer;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Event\Observer;
use Magento\Framework\View\Layout\ProcessorInterface;
use Magento\Framework\View\LayoutInterface;
use Magentofullstackdev\HyperionCheckout\Controller\Index\Index;
use Magentofullstackdev\HyperionCheckout\Observer\AddCheckoutHandle;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * The Lit checkout handle joins the layout update of the checkout page
 * before the handles are loaded, and only while the feature flag is on.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Observer\AddCheckoutHandle
 */
class AddCheckoutHandleTest extends TestCase
{
    /** @var ProcessorInterface&MockObject */
    private ProcessorInterface $update;

    protected function setUp(): void
    {
        $this->update = $this->createMock(ProcessorInterface::class);
    }

    public function testTheCheckoutPageGetsTheHandleOnceWhileTheFlagIsOn(): void
    {
        $this->update->expects(self::once())->method('addHandle')->with(Index::HYPERION_HANDLE);

        $this->observer(true)->execute($this->event('checkout_index_index'));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function otherActionProvider(): array
    {
        return [
            'cart page' => ['checkout_cart_index'],
            'success page' => ['checkout_onepage_success'],
            'mini-cart fragment' => ['hyperion_minicart_fragment'],
            'header state fragment' => ['hyperion_header_state'],
            'home page' => ['cms_index_index'],
        ];
    }

    #[DataProvider('otherActionProvider')]
    public function testAnotherActionGetsNoHandle(string $fullActionName): void
    {
        $this->update->expects(self::never())->method('addHandle');

        $this->observer(true)->execute($this->event($fullActionName));
    }

    public function testWithoutTheFlagTheCheckoutPageKeepsCoresHandles(): void
    {
        $this->update->expects(self::never())->method('addHandle');

        $this->observer(false)->execute($this->event('checkout_index_index'));
    }

    public function testAnEventWithoutALayoutIsIgnored(): void
    {
        $this->update->expects(self::never())->method('addHandle');

        $this->observer(true)->execute(new Observer(['full_action_name' => 'checkout_index_index']));
    }

    private function observer(bool $flag): AddCheckoutHandle
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnMap([
            [Index::CONFIG_ENABLED, 'store', null, $flag],
        ]);

        return new AddCheckoutHandle($scopeConfig);
    }

    private function event(string $fullActionName): Observer
    {
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getUpdate')->willReturn($this->update);

        return new Observer(['full_action_name' => $fullActionName, 'layout' => $layout]);
    }
}

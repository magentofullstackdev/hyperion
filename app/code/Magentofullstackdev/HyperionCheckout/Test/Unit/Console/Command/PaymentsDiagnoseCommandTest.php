<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Console\Command;

use Magento\Framework\App\State;
use Magento\Framework\Console\Cli;
use Magento\Framework\ObjectManager\ConfigLoaderInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Console\Command\PaymentsDiagnoseCommand;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethods;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;

/**
 * `hyperion:checkout:payments`: the frontend DI configuration is loaded
 * before the pool is read, one row per active method, the report rewritten
 * for the store views checked.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Console\Command\PaymentsDiagnoseCommand
 */
class PaymentsDiagnoseCommandTest extends TestCase
{
    public function testListsEveryActiveMethodAndRewritesTheReport(): void
    {
        $inspector = $this->createStub(UnsupportedMethods::class);
        $inspector->method('inspect')->willReturn([
            ['code' => 'checkmo', 'title' => 'Check / Money order', 'checkout' => true, 'entry' => [
                'id' => 'offline', 'type' => 'element', 'builtin' => 'offline', 'tag' => null,
            ]],
            ['code' => 'amazon', 'title' => 'Amazon Pay', 'checkout' => true, 'entry' => null],
            ['code' => 'admin_only', 'title' => 'Admin only', 'checkout' => false, 'entry' => null],
        ]);
        $report = $this->createMock(UnsupportedMethodsReport::class);
        $report->expects(self::once())->method('save')->with(1, ['amazon' => 'Amazon Pay'], true);

        $loader = $this->createMock(ConfigLoaderInterface::class);
        $loader->expects(self::once())->method('load')->with('frontend')->willReturn(['frontend' => 'config']);
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects(self::once())->method('configure')->with(['frontend' => 'config']);
        $objectManager->method('get')->willReturnMap([
            [UnsupportedMethods::class, $inspector],
            [UnsupportedMethodsReport::class, $report],
        ]);

        $tester = new CommandTester($this->command($loader, $objectManager));
        $status = $tester->execute([]);
        $display = $tester->getDisplay();

        self::assertSame(Cli::RETURN_SUCCESS, $status);
        self::assertStringContainsString('built-in offline', $display);
        self::assertStringContainsString('no renderer', $display);
        self::assertStringContainsString('not offered in checkout', $display);
        self::assertStringContainsString('1 method(s) without a renderer', $display);
    }

    public function testAnUnknownStoreCodeFails(): void
    {
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects(self::once())->method('configure');
        $objectManager->expects(self::never())->method('get');

        $loader = $this->createStub(ConfigLoaderInterface::class);
        $loader->method('load')->willReturn([]);
        $tester = new CommandTester($this->command($loader, $objectManager));

        self::assertSame(Cli::RETURN_FAILURE, $tester->execute(['--store' => 'nowhere']));
        self::assertStringContainsString('Unknown store view code "nowhere"', $tester->getDisplay());
    }

    private function command(ConfigLoaderInterface $loader, ObjectManagerInterface $objectManager): PaymentsDiagnoseCommand
    {
        $state = $this->createMock(State::class);
        $state->expects(self::once())->method('setAreaCode')->with('frontend');
        $store = $this->createStub(Store::class);
        $store->method('getId')->willReturn(1);
        $store->method('getCode')->willReturn('default');
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStores')->willReturn([1 => $store]);

        return new PaymentsDiagnoseCommand($state, $loader, $objectManager, $storeManager);
    }
}

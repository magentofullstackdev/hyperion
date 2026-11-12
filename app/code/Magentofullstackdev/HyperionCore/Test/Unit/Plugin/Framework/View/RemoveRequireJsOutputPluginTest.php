<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Framework\View;

use Magento\Framework\View\Layout;
use Magentofullstackdev\HyperionCore\Plugin\Framework\View\RemoveRequireJsOutputPlugin;
use PHPUnit\Framework\TestCase;

class RemoveRequireJsOutputPluginTest extends TestCase
{
    public function testThePersistentInitScriptIsTakenOutOfThePageOutput(): void
    {
        $layout = $this->createMock(Layout::class);
        $layout->expects($this->once())
            ->method('removeOutputElement')
            ->with('persistent_initial_configs')
            ->willReturnSelf();

        (new RemoveRequireJsOutputPlugin())->beforeGetOutput($layout);
    }
}

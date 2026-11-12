<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Test\Unit\Setup\Patch\Data;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Config\Storage\WriterInterface;
use Magentofullstackdev\HyperionSampleData\Setup\Patch\Data\SetSampleStoreName;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class SetSampleStoreNameTest extends TestCase
{
    public function testAStoreWithoutANameGetsTheSampleName(): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn(null);
        $writer = $this->createMock(WriterInterface::class);
        $writer->expects(self::once())->method('save')->with('general/store_information/name', 'HYPERION');

        (new SetSampleStoreName($scopeConfig, $writer, $this->createStub(LoggerInterface::class)))->apply();
    }

    public function testAStoreThatHasANameKeepsIt(): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn('Acme Outdoor');
        $writer = $this->createMock(WriterInterface::class);
        $writer->expects(self::never())->method('save');

        (new SetSampleStoreName($scopeConfig, $writer, $this->createStub(LoggerInterface::class)))->apply();
    }

    public function testAFailureIsLoggedAndDoesNotStopTheSetup(): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willThrowException(new \RuntimeException('no config'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $patch = new SetSampleStoreName($scopeConfig, $this->createStub(WriterInterface::class), $logger);

        self::assertSame($patch, $patch->apply());
    }
}

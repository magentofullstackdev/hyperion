<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model;

use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magentofullstackdev\HyperionCore\Model\ViewModelRegistry;
use Magentofullstackdev\HyperionCore\ViewModel\TemplateLogger;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ViewModelRegistryTest extends TestCase
{
    /** @var ObjectManagerInterface&Stub */
    private ObjectManagerInterface $objectManager;

    /** @var ModuleManager&Stub */
    private ModuleManager $moduleManager;

    /** @var LoggerInterface&MockObject */
    private LoggerInterface $logger;

    private ViewModelRegistry $registry;

    protected function setUp(): void
    {
        $this->objectManager = $this->createStub(ObjectManagerInterface::class);
        $this->moduleManager = $this->createStub(ModuleManager::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->registry = $this->registry();
    }

    /**
     * The object manager is a stub unless the test hands in a mock whose
     * calls it verifies; the logger is always verified.
     */
    private function registry(?ObjectManagerInterface $objectManager = null): ViewModelRegistry
    {
        return new ViewModelRegistry($objectManager ?? $this->objectManager, $this->moduleManager, $this->logger);
    }

    public function testOptionalReturnsTheViewModelOfAnEnabledModule(): void
    {
        $viewModel = new TemplateLogger($this->logger);
        $this->moduleManager->method('isEnabled')->willReturn(true);
        $this->objectManager->method('get')->willReturn($viewModel);
        $this->logger->expects($this->never())->method('error');

        $this->assertSame($viewModel, $this->registry->optional(TemplateLogger::class));
    }

    public function testOptionalIsSilentWhenTheModuleIsNotEnabled(): void
    {
        $this->moduleManager->method('isEnabled')->willReturn(false);
        $objectManager = $this->createMock(ObjectManagerInterface::class);
        $objectManager->expects($this->never())->method('get');
        $this->logger->expects($this->never())->method('error');

        $this->assertNull($this->registry($objectManager)->optional(TemplateLogger::class));
    }

    public function testOptionalIsSilentWhenTheModuleIsNotInstalled(): void
    {
        $this->moduleManager->method('isEnabled')->willReturn(false);
        $this->logger->expects($this->never())->method('error');

        /** @phpstan-ignore-next-line the class is deliberately missing */
        $this->assertNull($this->registry->optional('Acme\\Missing\\ViewModel\\Thing'));
    }

    public function testOptionalLogsAMissingClassOfAnEnabledModule(): void
    {
        $this->moduleManager->method('isEnabled')->willReturn(true);
        $this->logger->expects($this->once())->method('error')
            ->with($this->stringContains('does not exist'));

        /** @phpstan-ignore-next-line the class is deliberately missing */
        $this->assertNull($this->registry->optional('Magentofullstackdev\\HyperionCore\\ViewModel\\Typo'));
    }

    public function testOptionalLogsAConstructionFailureOfAnEnabledModule(): void
    {
        $failure = new \RuntimeException('Missing argument $foo');
        $this->moduleManager->method('isEnabled')->willReturn(true);
        $this->objectManager->method('get')->willThrowException($failure);
        $this->logger->expects($this->once())->method('error')
            ->with($this->stringContains('could not be built'), ['exception' => $failure]);

        $this->assertNull($this->registry->optional(TemplateLogger::class));
    }

    public function testOptionalLogsAClassThatIsNotAViewModel(): void
    {
        $this->objectManager->method('get')->willReturn(new \stdClass());
        $this->logger->expects($this->once())->method('error')
            ->with($this->stringContains('must implement'));

        /** @phpstan-ignore-next-line not a view model on purpose */
        $this->assertNull($this->registry->optional(\stdClass::class));
    }

    public function testRequireThrowsForAClassThatIsNotAViewModel(): void
    {
        $this->objectManager->method('get')->willReturn(new \stdClass());
        $this->logger->expects($this->never())->method('error');
        $this->expectException(\RuntimeException::class);

        /** @phpstan-ignore-next-line not a view model on purpose */
        $this->registry->require(\stdClass::class);
    }
}

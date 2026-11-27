<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Framework\View\TemplateEngine;

use Magento\Framework\View\Element\BlockInterface;
use Magento\Framework\View\TemplateEngine\Php;
use Magentofullstackdev\HyperionCore\Model\Design\ThemeScope;
use Magentofullstackdev\HyperionCore\Model\ViewModelRegistry;
use Magentofullstackdev\HyperionCore\Plugin\Framework\View\TemplateEngine\PhpPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The template variables: `$hyperionViewModels` always, `$viewModels` under
 * the Hyperion theme or where nobody else set it.
 *
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Framework\View\TemplateEngine\PhpPlugin
 */
class PhpPluginTest extends TestCase
{
    private ViewModelRegistry $registry;

    protected function setUp(): void
    {
        $this->registry = $this->createStub(ViewModelRegistry::class);
    }

    public function testBothVariablesHoldTheRegistryWhenNothingElseSetViewModels(): void
    {
        $scope = $this->createMock(ThemeScope::class);
        $scope->expects(self::never())->method('isHyperionActive');

        $dictionary = $this->render($scope, ['product' => 'x']);

        self::assertSame($this->registry, $dictionary['viewModels']);
        self::assertSame($this->registry, $dictionary['hyperionViewModels']);
        self::assertSame('x', $dictionary['product']);
    }

    public function testAForeignRegistryIsKeptUnderAnotherTheme(): void
    {
        $foreign = new \stdClass();
        $scope = $this->createMock(ThemeScope::class);
        $scope->expects(self::once())->method('isHyperionActive')->willReturn(false);

        $dictionary = $this->render($scope, ['viewModels' => $foreign]);

        self::assertSame($foreign, $dictionary['viewModels']);
        self::assertSame($this->registry, $dictionary['hyperionViewModels']);
    }

    public function testAForeignRegistryIsReplacedUnderTheHyperionTheme(): void
    {
        $scope = $this->createMock(ThemeScope::class);
        $scope->expects(self::once())->method('isHyperionActive')->willReturn(true);

        $dictionary = $this->render($scope, ['viewModels' => new \stdClass()]);

        self::assertSame($this->registry, $dictionary['viewModels']);
    }

    public function testAFailingThemeScopeKeepsTheForeignRegistryAndIsLogged(): void
    {
        $foreign = new \stdClass();
        $scope = $this->createStub(ThemeScope::class);
        $scope->method('isHyperionActive')->willThrowException(new \RuntimeException('no design'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('no design'));

        $dictionary = $this->render($scope, ['viewModels' => $foreign], $logger);

        self::assertSame($foreign, $dictionary['viewModels']);
        self::assertSame($this->registry, $dictionary['hyperionViewModels']);
    }

    /**
     * @param array<string, mixed> $dictionary
     * @return array<string, mixed>
     */
    private function render(ThemeScope $scope, array $dictionary, ?LoggerInterface $logger = null): array
    {
        $plugin = new PhpPlugin($this->registry, $scope, $logger ?? $this->createStub(LoggerInterface::class));
        $block = $this->createStub(BlockInterface::class);

        [$returnedBlock, $file, $result] = $plugin->beforeRender($this->createStub(Php::class), $block, 'a.phtml', $dictionary);
        self::assertSame($block, $returnedBlock);
        self::assertSame('a.phtml', $file);

        return $result;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Model\Design;

use Magento\Framework\App\State as AppState;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Phrase;
use Magento\Framework\View\Design\ThemeInterface;
use Magento\Framework\View\DesignInterface;
use Magentofullstackdev\HyperionCore\Model\Design\ThemeScope;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Whether the current storefront renders with the Hyperion theme or a child of it.
 *
 * @covers \Magentofullstackdev\HyperionCore\Model\Design\ThemeScope
 */
class ThemeScopeTest extends TestCase
{
    public function testTheHyperionThemeIsActive(): void
    {
        $scope = $this->scope('frontend', $this->chain(['Magentofullstackdev/hyperion']));

        self::assertTrue($scope->isHyperionActive());
    }

    public function testAChildThemeOfHyperionIsActive(): void
    {
        $scope = $this->scope('frontend', $this->chain(['Vendor/child', 'Magentofullstackdev/hyperion']));

        self::assertTrue($scope->isHyperionActive());
    }

    public function testLumaIsNotActive(): void
    {
        $scope = $this->scope('frontend', $this->chain(['Magento/luma', 'Magento/blank']));

        self::assertFalse($scope->isHyperionActive());
    }

    public function testAThemeListedInTheThemesArgumentIsActive(): void
    {
        $scope = $this->scope('frontend', $this->chain(['Vendor/standalone']), ['Vendor/standalone']);

        self::assertTrue($scope->isHyperionActive());
    }

    public function testTheAdminAreaIsNeverActive(): void
    {
        $design = $this->createMock(DesignInterface::class);
        $design->expects(self::never())->method('getDesignTheme');
        $state = $this->createStub(AppState::class);
        $state->method('getAreaCode')->willReturn('adminhtml');

        self::assertFalse((new ThemeScope($design, $state, $this->createStub(LoggerInterface::class)))->isHyperionActive());
    }

    public function testARequestWithoutAnAreaIsNotActive(): void
    {
        $state = $this->createStub(AppState::class);
        $state->method('getAreaCode')->willThrowException(new LocalizedException(new Phrase('Area code is not set')));

        $scope = new ThemeScope(
            $this->createStub(DesignInterface::class),
            $state,
            $this->createStub(LoggerInterface::class)
        );

        self::assertFalse($scope->isHyperionActive());
    }

    public function testTheAnswerIsReadOncePerThemeUntilTheStateIsReset(): void
    {
        $theme = $this->createMock(ThemeInterface::class);
        $theme->method('getId')->willReturn(4);
        $theme->method('getFullPath')->willReturn('frontend/Magentofullstackdev/hyperion');
        $theme->method('getThemePath')->willReturn('Magentofullstackdev/hyperion');
        $theme->expects(self::exactly(2))->method('getInheritedThemes')->willReturnCallback(
            static fn () => [$theme]
        );
        $scope = $this->scope('frontend', $theme);

        self::assertTrue($scope->isHyperionActive());
        self::assertTrue($scope->isHyperionActive());
        $scope->_resetState();
        self::assertTrue($scope->isHyperionActive());
    }

    public function testACallerListIsMatchedAgainstTheThemeChain(): void
    {
        $scope = $this->scope('frontend', $this->chain(['Vendor/child', 'Vendor/base']));

        self::assertTrue($scope->matchesCurrentTheme(['Vendor/base']));
        self::assertFalse($scope->matchesCurrentTheme(['Magentofullstackdev/hyperion']));
        self::assertFalse($scope->matchesCurrentTheme([]));
    }

    public function testABrokenThemeChainIsLoggedAndNotActive(): void
    {
        $theme = $this->createStub(ThemeInterface::class);
        $theme->method('getInheritedThemes')->willThrowException(new \RuntimeException('parent theme missing'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('parent theme missing'));
        $design = $this->createStub(DesignInterface::class);
        $design->method('getDesignTheme')->willReturn($theme);
        $state = $this->createStub(AppState::class);
        $state->method('getAreaCode')->willReturn('frontend');

        self::assertFalse((new ThemeScope($design, $state, $logger))->isHyperionActive());
    }

    /**
     * The current theme first, then its parents, as ThemeInterface::getInheritedThemes() lists them
     * (that method returns the chain from the root; the order does not matter to the scope).
     *
     * @param string[] $paths
     */
    private function chain(array $paths): ThemeInterface
    {
        $themes = [];
        foreach ($paths as $i => $path) {
            $theme = $this->createStub(ThemeInterface::class);
            $theme->method('getThemePath')->willReturn($path);
            $theme->method('getId')->willReturn($i + 1);
            $theme->method('getFullPath')->willReturn('frontend/' . $path);
            $themes[] = $theme;
        }
        $current = $themes[0];
        $current->method('getInheritedThemes')->willReturn(array_reverse($themes));

        return $current;
    }

    /**
     * @param string[]|null $themes
     */
    private function scope(string $area, ThemeInterface $theme, ?array $themes = null): ThemeScope
    {
        $design = $this->createStub(DesignInterface::class);
        $design->method('getDesignTheme')->willReturn($theme);
        $state = $this->createStub(AppState::class);
        $state->method('getAreaCode')->willReturn($area);
        $logger = $this->createStub(LoggerInterface::class);

        return $themes === null
            ? new ThemeScope($design, $state, $logger)
            : new ThemeScope($design, $state, $logger, $themes);
    }
}

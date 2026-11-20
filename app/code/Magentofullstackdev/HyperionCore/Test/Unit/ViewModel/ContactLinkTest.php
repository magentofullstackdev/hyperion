<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\ViewModel;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\UrlInterface;
use Magentofullstackdev\HyperionCore\ViewModel\ContactLink;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\ViewModel\ContactLink
 */
class ContactLinkTest extends TestCase
{
    /**
     * @return array<string, array{bool, bool, bool}>
     */
    public static function availabilityProvider(): array
    {
        return [
            'module on, setting on' => [true, true, true],
            'module on, setting off' => [true, false, false],
            'module off, setting on' => [false, true, false],
        ];
    }

    #[DataProvider('availabilityProvider')]
    public function testTheLinkIsAvailableOnlyWithTheModuleAndItsSettingOn(
        bool $moduleEnabled,
        bool $settingOn,
        bool $expected
    ): void {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(
            static fn (string $path): bool => $path === 'contact/contact/enabled' && $settingOn
        );
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturnCallback(
            static fn (string $module): bool => $module === 'Magento_Contact' && $moduleEnabled
        );

        $link = new ContactLink($scopeConfig, $moduleManager, $this->createStub(UrlInterface::class));

        self::assertSame($expected, $link->isAvailable());
    }

    public function testTheUrlIsTheContactRoute(): void
    {
        $url = $this->createStub(UrlInterface::class);
        $url->method('getUrl')->willReturnCallback(
            static fn (string $route): string => 'https://store.test/' . $route . '/'
        );

        $link = new ContactLink(
            $this->createStub(ScopeConfigInterface::class),
            $this->createStub(ModuleManager::class),
            $url
        );

        self::assertSame('https://store.test/contact/', $link->getUrl());
    }
}

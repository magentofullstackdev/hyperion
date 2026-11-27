<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Framework\View\DesignInterface;
use Magento\MediaStorage\Helper\File\Storage\Database as DbFileStorageHelper;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionNavigation\Model\LogoResolver;
use Magentofullstackdev\HyperionNavigation\Model\StoreBrand;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The logo size attributes are the box the header and footer draw: the configured
 * aspect ratio at the drawn height, or the default box.
 *
 * @covers \Magentofullstackdev\HyperionNavigation\Model\LogoResolver
 */
class LogoResolverTest extends TestCase
{
    /**
     * @return array<string, array{mixed, mixed, array{width: int, height: int}}>
     */
    public static function dimensionsProvider(): array
    {
        return [
            'nothing configured' => [null, null, ['width' => 140, 'height' => 40]],
            'only the width' => ['300', null, ['width' => 140, 'height' => 40]],
            'only the height' => [null, '60', ['width' => 140, 'height' => 40]],
            'zero values' => ['0', '0', ['width' => 140, 'height' => 40]],
            'wide logo' => ['300', '60', ['width' => 200, 'height' => 40]],
            'square logo' => ['80', '80', ['width' => 40, 'height' => 40]],
            'drawn size configured' => ['189', '64', ['width' => 118, 'height' => 40]],
        ];
    }

    /**
     * @param mixed $width
     * @param mixed $height
     * @param array{width: int, height: int} $expected
     */
    #[DataProvider('dimensionsProvider')]
    public function testLogoDimensionsKeepTheConfiguredAspectRatioAtTheDrawnHeight(
        mixed $width,
        mixed $height,
        array $expected
    ): void {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(
            static fn (string $path): mixed => match ($path) {
                'design/header/logo_width' => $width,
                'design/header/logo_height' => $height,
                default => null,
            }
        );

        self::assertSame($expected, $this->resolver($scopeConfig)->getLogoDimensions());
    }

    public function testAConfigurationFailureIsLoggedAndGivesTheDefaultBox(): void
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willThrowException(new \RuntimeException('config down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('config down'));

        self::assertSame(
            ['width' => 140, 'height' => 40],
            $this->resolver($scopeConfig, $logger)->getLogoDimensions()
        );
    }

    private function resolver(ScopeConfigInterface $scopeConfig, ?LoggerInterface $logger = null): LogoResolver
    {
        return new LogoResolver(
            $this->createStub(StoreManagerInterface::class),
            $scopeConfig,
            $this->createStub(AssetRepository::class),
            $this->createStub(DesignInterface::class),
            $this->createStub(Filesystem::class),
            $this->createStub(DbFileStorageHelper::class),
            $logger ?? $this->createStub(LoggerInterface::class),
            $this->createStub(ComponentRegistrarInterface::class),
            $this->createStub(FileDriver::class),
            $this->createStub(StoreBrand::class)
        );
    }
}

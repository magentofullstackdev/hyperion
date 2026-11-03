<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\ViewModel;

use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Directory\ReadInterface;
use Magento\Framework\UrlInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Service\CompanionScheduler;
use Magentofullstackdev\HyperionImage\ViewModel\ImageConfig;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionImage\ViewModel\ImageConfig
 */
class ImageConfigTest extends TestCase
{
    private const MEDIA_URL = 'https://shop.test/media/';
    private const RELATIVE = 'catalog/product/cache/0a1b2c/m/b/mb01-blue-0.jpg';

    private string $root;
    private string $source;
    /** @var Config&Stub */
    private Config $config;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/hyperion-imageconfig-' . bin2hex(random_bytes(4));
        $this->source = $this->root . '/' . self::RELATIVE;
        mkdir(dirname($this->source), 0777, true);
        file_put_contents($this->source, 'jpg');

        $this->config = $this->createStub(Config::class);
        $this->config->method('isEnabled')->willReturn(true);
        $this->config->method('isWebpEnabled')->willReturn(true);
        $this->config->method('isAvifEnabled')->willReturn(false);
    }

    protected function tearDown(): void
    {
        foreach ([$this->source . '.webp', $this->source] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        $dir = dirname($this->source);
        while ($dir !== $this->root && is_dir($dir)) {
            rmdir($dir);
            $dir = dirname($dir);
        }
        if (is_dir($this->root)) {
            rmdir($this->root);
        }
    }

    private function makeViewModel(CompanionScheduler $scheduler): ImageConfig
    {
        $directory = $this->createStub(ReadInterface::class);
        $directory->method('getAbsolutePath')->willReturnCallback(
            fn (string $path): string => $this->root . '/' . $path
        );
        $filesystem = $this->createStub(Filesystem::class);
        $filesystem->method('getDirectoryRead')->willReturn($directory);

        $store = $this->createStub(Store::class);
        $store->method('getBaseUrl')->willReturnCallback(
            static fn (string $type): string => $type === UrlInterface::URL_TYPE_MEDIA ? self::MEDIA_URL : 'https://shop.test/'
        );
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        return new ImageConfig(
            $this->config,
            $filesystem,
            $storeManager,
            $this->createStub(LoggerInterface::class),
            $scheduler
        );
    }

    /**
     * @return CompanionScheduler&MockObject
     */
    private function scheduledTimes(int $times): CompanionScheduler
    {
        $scheduler = $this->createMock(CompanionScheduler::class);
        $scheduler->expects(self::exactly($times))->method('scheduleOnceIfMissing')->with($this->source);

        return $scheduler;
    }

    public function testMissingCompanionSchedulesTheConversionOncePerRequest(): void
    {
        $viewModel = $this->makeViewModel($this->scheduledTimes(1));
        $url = self::MEDIA_URL . self::RELATIVE;

        self::assertFalse($viewModel->hasWebpCompanion($url));
        // Memoised: the second ask of the same render neither stats nor schedules again.
        self::assertFalse($viewModel->hasWebpCompanion($url));
    }

    public function testExistingCompanionIsReportedAndNothingScheduled(): void
    {
        file_put_contents($this->source . '.webp', 'webp');
        $viewModel = $this->makeViewModel($this->scheduledTimes(0));

        self::assertTrue($viewModel->hasWebpCompanion(self::MEDIA_URL . self::RELATIVE));
        self::assertSame(self::MEDIA_URL . self::RELATIVE . '.webp', $viewModel->getWebpUrl(self::MEDIA_URL . self::RELATIVE));
    }

    public function testDisabledFormatNeverSchedules(): void
    {
        self::assertFalse($this->makeViewModel($this->scheduledTimes(0))->hasAvifCompanion(self::MEDIA_URL . self::RELATIVE));
    }

    public function testUrlOutsideTheMediaRootIsNotOurs(): void
    {
        $viewModel = $this->makeViewModel($this->scheduledTimes(0));

        self::assertFalse($viewModel->hasWebpCompanion('https://cdn.example/catalog/product/cache/0a1b2c/m/b/mb01-blue-0.jpg'));
        self::assertFalse($viewModel->hasWebpCompanion(self::MEDIA_URL . '../etc/env.php'));
    }
}

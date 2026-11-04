<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Service;

use Magento\Framework\App\CacheInterface;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;
use Magentofullstackdev\HyperionImage\Model\PathResolver;
use Magentofullstackdev\HyperionImage\Model\Variants;
use Magentofullstackdev\HyperionImage\Service\CompanionScheduler;
use Magentofullstackdev\HyperionImage\Service\ConversionService;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * @covers \Magentofullstackdev\HyperionImage\Service\CompanionScheduler
 */
class CompanionSchedulerTest extends TestCase
{
    private string $root;
    private string $source;
    /** @var Config&Stub */
    private Config $config;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/hyperion-companion-' . bin2hex(random_bytes(4));
        $dir = $this->root . '/catalog/product/cache/0a1b2c/m/b';
        mkdir($dir, 0777, true);
        $this->source = $dir . '/mb01-blue-0.jpg';
        file_put_contents($this->source, 'jpg');
        $this->config = $this->createStub(Config::class);
        $this->config->method('isEnabled')->willReturn(true);
        $this->config->method('isWebpEnabled')->willReturn(true);
        $this->config->method('isAvifEnabled')->willReturn(false);
    }

    protected function tearDown(): void
    {
        foreach ([$this->source . '.webp', $this->source . '.avif', $this->source] as $file) {
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

    private function makeScheduler(
        ?ConversionService $service = null,
        ?CacheInterface $cache = null,
        ?LoggerInterface $logger = null
    ): CompanionScheduler {
        return new CompanionScheduler(
            $this->config,
            new PathResolver(),
            $service ?? $this->createStub(ConversionService::class),
            $cache ?? $this->createStub(CacheInterface::class),
            $logger ?? $this->createStub(LoggerInterface::class),
            new Variants($this->config, new PathResolver(), new WebpFormat(), new AvifFormat())
        );
    }

    /**
     * @return ConversionService&\PHPUnit\Framework\MockObject\MockObject
     */
    private function dispatchedTimes(int $times): ConversionService
    {
        $service = $this->createMock(ConversionService::class);
        $service->expects(self::exactly($times))->method('dispatch')->with($this->source);

        return $service;
    }

    public function testMissingWebpIsReported(): void
    {
        self::assertSame([$this->source . '.webp'], $this->makeScheduler()->getMissingCompanions($this->source));
    }

    public function testExistingCompanionIsNotMissing(): void
    {
        file_put_contents($this->source . '.webp', 'webp');
        self::assertSame([], $this->makeScheduler()->getMissingCompanions($this->source));
    }

    public function testAvifIsReportedOnlyWhenEnabled(): void
    {
        $config = $this->createStub(Config::class);
        $config->method('isEnabled')->willReturn(true);
        $config->method('isWebpEnabled')->willReturn(true);
        $config->method('isAvifEnabled')->willReturn(true);
        $this->config = $config;
        file_put_contents($this->source . '.webp', 'webp');

        self::assertSame([$this->source . '.avif'], $this->makeScheduler()->getMissingCompanions($this->source));
    }

    public function testAContentImageMissesItsVariantsToo(): void
    {
        $this->config->method('isVariantsEnabled')->willReturn(true);
        $this->config->method('getVariantWidths')->willReturn([640, 960]);
        mkdir($this->root . '/wysiwyg', 0777, true);
        $banner = $this->root . '/wysiwyg/hero.png';
        $image = imagecreatetruecolor(800, 300);
        imagepng($image, $banner);
        file_put_contents($banner . '.webp', 'webp');
        try {
            self::assertSame(
                [$banner . '.w640.webp'],
                $this->makeScheduler()->getMissingCompanions($banner),
                'the companion exists, the 640 variant is missing, 960 is wider than the source'
            );
        } finally {
            unlink($banner . '.webp');
            unlink($banner);
            rmdir($this->root . '/wysiwyg');
        }
    }

    public function testMissingSourceHasNoMissingCompanions(): void
    {
        unlink($this->source);
        self::assertSame([], $this->makeScheduler()->getMissingCompanions($this->source));
    }

    public function testPathOutsideTheAllowListIsIgnored(): void
    {
        $foreign = $this->root . '/avatar.jpg';
        file_put_contents($foreign, 'jpg');
        try {
            self::assertSame([], $this->makeScheduler()->getMissingCompanions($foreign));
        } finally {
            unlink($foreign);
        }
    }

    public function testDisabledModuleSchedulesNothing(): void
    {
        $config = $this->createStub(Config::class);
        $config->method('isEnabled')->willReturn(false);
        $this->config = $config;

        self::assertFalse($this->makeScheduler($this->dispatchedTimes(0))->scheduleIfMissing($this->source));
    }

    public function testScheduleIfMissingDispatchesWhenTheCompanionIsMissing(): void
    {
        self::assertTrue($this->makeScheduler($this->dispatchedTimes(1))->scheduleIfMissing($this->source));
    }

    public function testScheduleIfMissingSkipsAConvertedSource(): void
    {
        file_put_contents($this->source . '.webp', 'webp');
        self::assertFalse($this->makeScheduler($this->dispatchedTimes(0))->scheduleIfMissing($this->source));
    }

    public function testScheduleOnceDispatchesAndSetsTheFlag(): void
    {
        $cache = $this->createMock(CacheInterface::class);
        $cache->expects(self::once())->method('load')->willReturn(false);
        $cache->expects(self::once())->method('save')->with(
            '1',
            self::stringStartsWith('HYPERION_IMAGE_SCHEDULED_'),
            [CompanionScheduler::CACHE_TAG],
            86400
        );
        $scheduler = $this->makeScheduler($this->dispatchedTimes(1), $cache);

        self::assertTrue($scheduler->scheduleOnceIfMissing($this->source));
        // Same process: no second cache round trip, no second dispatch.
        self::assertFalse($scheduler->scheduleOnceIfMissing($this->source));
    }

    public function testScheduleOnceHonoursTheFlagOfAnEarlierProcess(): void
    {
        $cache = $this->createMock(CacheInterface::class);
        $cache->expects(self::once())->method('load')->willReturn('1');
        $cache->expects(self::never())->method('save');

        self::assertFalse($this->makeScheduler($this->dispatchedTimes(0), $cache)->scheduleOnceIfMissing($this->source));
    }

    public function testScheduleOnceSkipsAConvertedSourceWithoutTouchingTheCache(): void
    {
        file_put_contents($this->source . '.webp', 'webp');
        $cache = $this->createMock(CacheInterface::class);
        $cache->expects(self::never())->method('load');

        self::assertFalse($this->makeScheduler($this->dispatchedTimes(0), $cache)->scheduleOnceIfMissing($this->source));
    }

    public function testScheduleOnceLogsAndReturnsFalseWhenTheCacheFails(): void
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willThrowException(new RuntimeException('redis down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(self::stringContains('redis down'));

        self::assertFalse($this->makeScheduler($this->dispatchedTimes(0), $cache, $logger)->scheduleOnceIfMissing($this->source));
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Plugin\MediaStorage\Service\ImageResize;

use Generator;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Directory\ReadInterface;
use Magento\MediaStorage\Service\ImageResize;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Plugin\MediaStorage\Service\ImageResize\ScheduleCompanionsPlugin;
use Magentofullstackdev\HyperionImage\Service\CompanionScheduler;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * @covers \Magentofullstackdev\HyperionImage\Plugin\MediaStorage\Service\ImageResize\ScheduleCompanionsPlugin
 */
class ScheduleCompanionsPluginTest extends TestCase
{
    private const MEDIA = '/var/www/html/pub/media/';
    private const CACHE = 'catalog/product/cache';
    private const IMAGE = '/m/b/mb01-blue-0.jpg';

    /**
     * Cache directories of the fixture: the image exists in two of the
     * three hash directories, the third holds other images only; a stray
     * file in the cache root is not a directory.
     */
    private const ENTRIES = [
        self::CACHE . '/aaa111',
        self::CACHE . '/bbb222',
        self::CACHE . '/ccc333',
        self::CACHE . '/.gitkeep',
    ];
    private const FILES = [
        self::CACHE . '/aaa111' . self::IMAGE,
        self::CACHE . '/bbb222' . self::IMAGE,
    ];

    /** @var Config&Stub */
    private Config $config;
    /** @var ImageResize&Stub */
    private ImageResize $subject;

    protected function setUp(): void
    {
        $this->config = $this->createStub(Config::class);
        $this->config->method('isEnabled')->willReturn(true);
        $this->subject = $this->createStub(ImageResize::class);
    }

    /**
     * @return Filesystem&Stub
     */
    private function mediaDirectory(): Filesystem
    {
        $directory = $this->createStub(ReadInterface::class);
        $directory->method('isDirectory')->willReturnCallback(
            static fn (string $path): bool => $path === self::CACHE
                || in_array($path, array_slice(self::ENTRIES, 0, 3), true)
        );
        $directory->method('read')->willReturn(self::ENTRIES);
        $directory->method('isFile')->willReturnCallback(
            static fn (string $path): bool => in_array($path, self::FILES, true)
        );
        $directory->method('getAbsolutePath')->willReturnCallback(
            static fn (string $path): string => self::MEDIA . $path
        );
        $filesystem = $this->createStub(Filesystem::class);
        $filesystem->method('getDirectoryRead')->willReturn($directory);

        return $filesystem;
    }

    private function makePlugin(CompanionScheduler $scheduler, ?LoggerInterface $logger = null): ScheduleCompanionsPlugin
    {
        return new ScheduleCompanionsPlugin(
            $this->config,
            $this->mediaDirectory(),
            $scheduler,
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    /**
     * @return CompanionScheduler&MockObject
     */
    private function schedulerAskedForEveryCacheFile(): CompanionScheduler
    {
        $scheduler = $this->createMock(CompanionScheduler::class);
        $scheduler->expects(self::exactly(2))->method('scheduleIfMissing')->with(
            self::callback(static fn (string $path): bool => in_array(
                $path,
                [self::MEDIA . self::FILES[0], self::MEDIA . self::FILES[1]],
                true
            ))
        )->willReturn(true);

        return $scheduler;
    }

    /**
     * @return CompanionScheduler&MockObject
     */
    private function schedulerNeverAsked(): CompanionScheduler
    {
        $scheduler = $this->createMock(CompanionScheduler::class);
        $scheduler->expects(self::never())->method('scheduleIfMissing');

        return $scheduler;
    }

    public function testAfterResizeFromImageNameSchedulesEveryCacheFileOfTheImage(): void
    {
        $plugin = $this->makePlugin($this->schedulerAskedForEveryCacheFile());

        self::assertNull($plugin->afterResizeFromImageName($this->subject, null, self::IMAGE));
    }

    public function testImageNameWithoutLeadingSlashIsNormalised(): void
    {
        $plugin = $this->makePlugin($this->schedulerAskedForEveryCacheFile());

        $plugin->afterResizeFromImageName($this->subject, null, ltrim(self::IMAGE, '/'));
    }

    public function testDisabledModuleSchedulesNothing(): void
    {
        $config = $this->createStub(Config::class);
        $config->method('isEnabled')->willReturn(false);
        $this->config = $config;

        $this->makePlugin($this->schedulerNeverAsked())->afterResizeFromImageName($this->subject, null, self::IMAGE);
    }

    public function testTraversalInTheImageNameSchedulesNothing(): void
    {
        $this->makePlugin($this->schedulerNeverAsked())
            ->afterResizeFromImageName($this->subject, null, '/../../etc/env.php');
    }

    public function testUnknownImageSchedulesNothing(): void
    {
        $this->makePlugin($this->schedulerNeverAsked())
            ->afterResizeFromImageName($this->subject, null, '/n/o/nowhere.jpg');
    }

    public function testAfterResizeFromThemesYieldsTheEntriesUnchangedAndSchedulesTheResizedOnes(): void
    {
        $scheduler = $this->createMock(CompanionScheduler::class);
        $scheduler->expects(self::exactly(2))->method('scheduleIfMissing')->willReturn(true);
        $plugin = $this->makePlugin($scheduler);

        $inner = (static function (): Generator {
            yield ['filename' => self::IMAGE, 'error' => ''] => 2;
            yield ['filename' => '/g/o/gone.jpg', 'error' => 'Cannot resize image'] => 2;
        })();

        $wrapped = $plugin->afterResizeFromThemes($this->subject, $inner);
        // The command reads the total before iterating.
        self::assertSame(2, $wrapped->current());

        $seen = [];
        foreach ($wrapped as $info => $count) {
            $seen[] = [$info, $count];
        }
        self::assertSame(
            [
                [['filename' => self::IMAGE, 'error' => ''], 2],
                [['filename' => '/g/o/gone.jpg', 'error' => 'Cannot resize image'], 2],
            ],
            $seen
        );
    }

    public function testASchedulingFailureIsLoggedAndTheResultStillReturned(): void
    {
        $scheduler = $this->createStub(CompanionScheduler::class);
        $scheduler->method('scheduleIfMissing')->willThrowException(new RuntimeException('queue gone'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning')->with(self::stringContains('queue gone'));

        self::assertSame(
            'result',
            $this->makePlugin($scheduler, $logger)->afterResizeFromImageName($this->subject, 'result', self::IMAGE)
        );
    }
}

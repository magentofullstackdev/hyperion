<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Test\Unit\Model;

use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Directory\WriteInterface;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Module\Dir\Reader as ModuleDirReader;
use Magentofullstackdev\HyperionSampleData\Model\LumaStylesheetReplacer;
use PHPUnit\Framework\TestCase;

class LumaStylesheetReplacerTest extends TestCase
{
    private const FIXTURE = '/* Hyperion: replaces the Luma sample data stylesheet */';

    /** @var WriteInterface&\PHPUnit\Framework\MockObject\MockObject */
    private WriteInterface $media;
    private LumaStylesheetReplacer $replacer;

    protected function setUp(): void
    {
        $this->media = $this->createMock(WriteInterface::class);
        $filesystem = $this->createStub(Filesystem::class);
        $filesystem->method('getDirectoryWrite')->willReturnMap([[DirectoryList::MEDIA, Filesystem\DriverPool::FILE, $this->media]]);
        $moduleDir = $this->createStub(ModuleDirReader::class);
        $moduleDir->method('getModuleDir')->willReturn('/app/code/Magentofullstackdev/HyperionSampleData');
        $driver = $this->createStub(FileDriver::class);
        $driver->method('fileGetContents')->willReturn(self::FIXTURE);
        $this->replacer = new LumaStylesheetReplacer($filesystem, $moduleDir, $driver);
    }

    public function testWithoutTheLumaFileNothingIsWritten(): void
    {
        $this->media->expects(self::once())->method('isFile')->with('styles.css')->willReturn(false);
        $this->media->expects(self::never())->method('writeFile');
        self::assertFalse($this->replacer->replace());
    }

    public function testTheLumaFileIsReplacedByTheFixture(): void
    {
        $this->media->expects(self::once())->method('isFile')->willReturn(true);
        $this->media->expects(self::once())->method('readFile')->willReturn('.block-promo{float:left}');
        $this->media->expects(self::once())->method('writeFile')->with('styles.css', self::FIXTURE)->willReturn(strlen(self::FIXTURE));
        self::assertTrue($this->replacer->replace());
    }

    public function testTheFixtureIsNotWrittenTwice(): void
    {
        $this->media->expects(self::once())->method('isFile')->willReturn(true);
        $this->media->expects(self::once())->method('readFile')->willReturn(self::FIXTURE);
        $this->media->expects(self::never())->method('writeFile');
        self::assertFalse($this->replacer->replace());
    }
}

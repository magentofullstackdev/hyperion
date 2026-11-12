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
use Psr\Log\LoggerInterface;

class LumaStylesheetReplacerTest extends TestCase
{
    private const FIXTURE = '/* Hyperion: replaces the Luma sample data stylesheet */';
    private const LUMA_CMS = '.block-promo{float:left}.block-promo-wrapper .block-promo{float:left}'
        . '.privacy-policy .block-collapsible-nav{width:22.3%;float:left}';
    private const LUMA_THEME = '.contact-info-number{display:block}._rwd_width_float{width:100% !important}';

    /** @var string[] the media files that exist */
    private array $files = [];
    private string $content = '';

    /** @var array<int, array{0: string, 1: string}> every writeFile() call */
    private array $writes = [];

    /** @var array<int, array{0: string, 1: string}> every copyFile() call */
    private array $copies = [];

    /** @var string[] */
    private array $infoLines = [];

    public function testWithoutTheLumaFileNothingIsWritten(): void
    {
        self::assertFalse($this->replacer()->replace());
        self::assertSame([], $this->writes);
        self::assertSame([], $this->copies);
    }

    public function testTheLumaFileIsBackedUpAndReplacedByTheFixture(): void
    {
        $this->files = ['styles.css'];
        $this->content = self::LUMA_CMS . self::LUMA_THEME;

        self::assertTrue($this->replacer()->replace());
        self::assertSame([['styles.css', 'styles.css.luma.bak']], $this->copies);
        self::assertSame([['styles.css', self::FIXTURE]], $this->writes);
    }

    public function testEachSampleFixtureAloneIsRecognized(): void
    {
        $this->files = ['styles.css'];
        $this->content = self::LUMA_CMS;
        self::assertTrue($this->replacer()->replace(), 'the CMS sample data part');

        $this->content = self::LUMA_THEME;
        self::assertTrue($this->replacer()->replace(), 'the theme sample data part');
    }

    public function testAnExistingBackupIsNotOverwritten(): void
    {
        $this->files = ['styles.css', 'styles.css.luma.bak'];
        $this->content = self::LUMA_CMS;

        self::assertTrue($this->replacer()->replace());
        self::assertSame([], $this->copies, 'the first backup holds the original file');
        self::assertCount(1, $this->writes);
    }

    public function testAMerchantStylesheetIsLeftAloneAndReported(): void
    {
        $this->files = ['styles.css'];
        $this->content = '.my-banner{float:left}.contact-info-number{color:red}';

        self::assertFalse($this->replacer()->replace());
        self::assertSame([], $this->writes);
        self::assertSame([], $this->copies);
        self::assertCount(1, $this->infoLines);
        self::assertStringContainsString('not the Luma sample data stylesheet', $this->infoLines[0]);
    }

    public function testTheFixtureIsNotWrittenTwice(): void
    {
        $this->files = ['styles.css'];
        $this->content = self::FIXTURE;

        self::assertFalse($this->replacer()->replace());
        self::assertSame([], $this->writes);
        self::assertSame([], $this->copies);
        self::assertSame([], $this->infoLines);
    }

    private function replacer(): LumaStylesheetReplacer
    {
        $media = $this->createStub(WriteInterface::class);
        $media->method('isFile')->willReturnCallback(fn ($path): bool => in_array($path, $this->files, true));
        $media->method('readFile')->willReturnCallback(fn (): string => $this->content);
        $media->method('copyFile')->willReturnCallback(function ($path, $destination): bool {
            $this->copies[] = [$path, $destination];

            return true;
        });
        $media->method('writeFile')->willReturnCallback(function ($path, $content): int {
            $this->writes[] = [$path, $content];

            return strlen($content);
        });
        $filesystem = $this->createStub(Filesystem::class);
        $filesystem->method('getDirectoryWrite')
            ->willReturnMap([[DirectoryList::MEDIA, Filesystem\DriverPool::FILE, $media]]);
        $moduleDir = $this->createStub(ModuleDirReader::class);
        $moduleDir->method('getModuleDir')->willReturn('/app/code/Magentofullstackdev/HyperionSampleData');
        $driver = $this->createStub(FileDriver::class);
        $driver->method('fileGetContents')->willReturn(self::FIXTURE);
        $logger = $this->createStub(LoggerInterface::class);
        $logger->method('info')->willReturnCallback(function ($message): void {
            $this->infoLines[] = (string) $message;
        });

        return new LumaStylesheetReplacer($filesystem, $moduleDir, $driver, $logger);
    }
}

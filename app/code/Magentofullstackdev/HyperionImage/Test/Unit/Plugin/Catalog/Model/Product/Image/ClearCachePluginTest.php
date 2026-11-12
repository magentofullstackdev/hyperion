<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Plugin\Catalog\Model\Product\Image;

use FilesystemIterator;
use Magento\Catalog\Model\Product\Image as ProductImage;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Directory\WriteInterface;
use Magentofullstackdev\HyperionImage\Plugin\Catalog\Model\Product\Image\ClearCachePlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * @covers \Magentofullstackdev\HyperionImage\Plugin\Catalog\Model\Product\Image\ClearCachePlugin
 */
class ClearCachePluginTest extends TestCase
{
    private const CACHE = 'catalog/product/cache';

    private string $mediaRoot;

    protected function setUp(): void
    {
        $this->mediaRoot = sys_get_temp_dir() . '/hyperion-clear-cache-' . bin2hex(random_bytes(6));
        mkdir($this->mediaRoot, 0777, true);
    }

    protected function tearDown(): void
    {
        if (!is_dir($this->mediaRoot)) {
            return;
        }
        $entries = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->mediaRoot, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($entries as $entry) {
            $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
        }
        rmdir($this->mediaRoot);
    }

    public function testCompanionsUnderTheProductCacheAreDeleted(): void
    {
        $webp = $this->createFile(self::CACHE . '/aaa111/m/b/mb01-blue-0.jpg.webp');
        $avif = $this->createFile(self::CACHE . '/bbb222/m/b/mb01-blue-0.jpg.avif');

        $this->createPlugin()->afterClearCache($this->createStub(ProductImage::class), null);

        self::assertFileDoesNotExist($webp);
        self::assertFileDoesNotExist($avif);
    }

    public function testFilesThatAreNotCompanionsStayInTheProductCache(): void
    {
        $jpg = $this->createFile(self::CACHE . '/aaa111/m/b/mb01-blue-0.jpg');
        $this->createFile(self::CACHE . '/aaa111/m/b/mb01-blue-0.jpg.webp');

        $this->createPlugin()->afterClearCache($this->createStub(ProductImage::class), null);

        self::assertFileExists($jpg);
    }

    public function testWebpOutsideTheProductCacheIsNotDeleted(): void
    {
        $this->createFile(self::CACHE . '/aaa111/m/b/mb01-blue-0.jpg.webp');
        $original = $this->createFile('catalog/product/m/b/mb01-blue-0.webp');
        $cms = $this->createFile('wysiwyg/banner.jpg.webp');
        $category = $this->createFile('catalog/category/hero.avif');

        $this->createPlugin()->afterClearCache($this->createStub(ProductImage::class), null);

        self::assertFileExists($original);
        self::assertFileExists($cms);
        self::assertFileExists($category);
    }

    public function testMissingCacheDirectoryIsANoOp(): void
    {
        $outside = $this->createFile('wysiwyg/banner.jpg.webp');

        $result = $this->createPlugin()->afterClearCache($this->createStub(ProductImage::class), 'result');

        self::assertSame('result', $result);
        self::assertFileExists($outside);
        self::assertDirectoryDoesNotExist($this->mediaRoot . '/' . self::CACHE);
    }

    public function testResultPassesThrough(): void
    {
        $this->createFile(self::CACHE . '/aaa111/m/b/mb01-blue-0.jpg.webp');
        $result = new \stdClass();

        self::assertSame(
            $result,
            $this->createPlugin()->afterClearCache($this->createStub(ProductImage::class), $result)
        );
    }

    public function testResultPassesThroughWhenTheMediaDirectoryCannotBeOpened(): void
    {
        $filesystem = $this->createStub(Filesystem::class);
        $filesystem->method('getDirectoryWrite')->willThrowException(new \RuntimeException('not writable'));
        $plugin = new ClearCachePlugin($filesystem, $this->createStub(LoggerInterface::class));

        self::assertNull($plugin->afterClearCache($this->createStub(ProductImage::class), null));
    }

    /**
     * Plugin over a media directory double that answers from the temporary tree.
     */
    private function createPlugin(): ClearCachePlugin
    {
        $root = $this->mediaRoot;
        $mediaDirectory = $this->createStub(WriteInterface::class);
        $mediaDirectory->method('isDirectory')->willReturnCallback(
            static fn ($path = null): bool => is_dir($root . '/' . (string) $path)
        );
        $mediaDirectory->method('getAbsolutePath')->willReturnCallback(
            static fn ($path = null): string => $root . '/' . (string) $path
        );
        $filesystem = $this->createStub(Filesystem::class);
        $filesystem->method('getDirectoryWrite')->willReturnCallback(
            static fn (string $code): ?WriteInterface => $code === DirectoryList::MEDIA ? $mediaDirectory : null
        );

        return new ClearCachePlugin($filesystem, $this->createStub(LoggerInterface::class));
    }

    /**
     * @return string absolute path of the file created under the media root
     */
    private function createFile(string $relativePath): string
    {
        $path = $this->mediaRoot . '/' . $relativePath;
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0777, true);
        }
        file_put_contents($path, 'x');

        return $path;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Block;

use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\View\Element\Template\Context;
use Magentofullstackdev\HyperionCore\Block\AssetManifest;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The critical CSS reader: the tokens sheet without a type, the page type
 * sheet with one, nothing (and one warning) for a type the manifest does
 * not list, one read per entry and request.
 *
 * @covers \Magentofullstackdev\HyperionCore\Block\AssetManifest
 */
class AssetManifestTest extends TestCase
{
    private const THEME_PATH = '/srv/theme';

    private const MANIFEST = [
        'src/css/source/critical.css' => ['file' => 'assets/critical.A.css', 'src' => 'src/css/source/critical.css'],
        'src/css/critical/category.css' => ['file' => 'assets/critical-category.B.css', 'src' => 'src/css/critical/category.css'],
        'src/js/entry.js' => ['file' => 'assets/entry.C.js', 'name' => 'entry', 'isEntry' => true, 'css' => ['assets/entry.D.css']],
    ];

    private const FILES = [
        self::THEME_PATH . '/web/manifest.json' => '',
        self::THEME_PATH . '/web/assets/critical.A.css' => ':root{--color-primary:37 99 235}',
        self::THEME_PATH . '/web/assets/critical-category.B.css' => '.page-header{position:sticky}',
    ];

    public function testWithoutATypeTheTokensSheetIsRead(): void
    {
        $block = $this->block($this->fileDriver());

        self::assertSame(':root{--color-primary:37 99 235}', $block->getCriticalCss());
    }

    public function testATypeReadsThePageSheet(): void
    {
        $block = $this->block($this->fileDriver());

        self::assertSame('.page-header{position:sticky}', $block->getCriticalCss('category'));
        self::assertSame(':root{--color-primary:37 99 235}', $block->getCriticalCss(), 'the two entries are cached apart');
    }

    public function testAnUnknownTypeIsEmptyAndWarnsOnce(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())
            ->method('warning')
            ->with(self::stringContains('critical CSS'), ['entry' => 'critical-cart']);
        $block = $this->block($this->fileDriver(), $logger);

        self::assertSame('', $block->getCriticalCss('cart'));
        self::assertSame('', $block->getCriticalCss('cart'), 'the miss is cached like a hit');
    }

    public function testEachEntryIsReadOncePerRequest(): void
    {
        $driver = $this->createMock(FileDriver::class);
        $driver->method('isExists')
            ->willReturnCallback(static fn (string $path): bool => array_key_exists($path, self::FILES));
        $driver->expects(self::exactly(3))
            ->method('fileGetContents')
            ->willReturnCallback(static fn (string $path): string => self::contents($path));
        $block = $this->block($driver);

        $block->getCriticalCss('category');
        $block->getCriticalCss('category');
        $block->getCriticalCss();
        $block->getCriticalCss();
        // The manifest, the category sheet and the tokens sheet: three reads.
    }

    /** A driver that only answers: the read-count test builds its own mock. */
    private function fileDriver(): FileDriver&Stub
    {
        $driver = $this->createStub(FileDriver::class);
        $driver->method('isExists')
            ->willReturnCallback(static fn (string $path): bool => array_key_exists($path, self::FILES));
        $driver->method('fileGetContents')
            ->willReturnCallback(static fn (string $path): string => self::contents($path));
        return $driver;
    }

    private static function contents(string $path): string
    {
        if ($path === self::THEME_PATH . '/web/manifest.json') {
            return json_encode(self::MANIFEST, JSON_THROW_ON_ERROR);
        }
        return self::FILES[$path] ?? '';
    }

    private function block(FileDriver $driver, ?LoggerInterface $logger = null): AssetManifest
    {
        $registrar = $this->createStub(ComponentRegistrarInterface::class);
        $registrar->method('getPath')->willReturn(self::THEME_PATH);

        return new AssetManifest(
            $this->templateContext(),
            $registrar,
            $driver,
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    /**
     * The block context with a stub for every constructor argument (the unit
     * test helper's ObjectManager would hand out mocks, which PHPUnit expects
     * to carry expectations).
     */
    private function templateContext(): Context
    {
        $arguments = [];
        foreach ((new \ReflectionClass(Context::class))->getConstructor()?->getParameters() ?? [] as $parameter) {
            $type = $parameter->getType();
            if ($type instanceof \ReflectionNamedType && !$type->isBuiltin()) {
                /** @var class-string $class */
                $class = $type->getName();
                $arguments[$parameter->getName()] = $this->createStub($class);
            } elseif ($parameter->isDefaultValueAvailable()) {
                $arguments[$parameter->getName()] = $parameter->getDefaultValue();
            } else {
                self::fail(sprintf('No stub for the context argument $%s.', $parameter->getName()));
            }
        }

        return new Context(...$arguments);
    }
}

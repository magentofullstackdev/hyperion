<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Model;

use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;
use Magentofullstackdev\HyperionImage\Model\PathResolver;
use Magentofullstackdev\HyperionImage\Model\Variants;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

class VariantsTest extends TestCase
{
    private string $root;
    private string $banner;
    /** @var Config&Stub */
    private Config $config;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/hyperion-variants-' . bin2hex(random_bytes(4));
        mkdir($this->root . '/wysiwyg', 0777, true);
        $this->banner = $this->root . '/wysiwyg/hero.png';
        imagepng(imagecreatetruecolor(800, 300), $this->banner);
        $this->config = $this->createStub(Config::class);
        $this->config->method('isEnabled')->willReturn(true);
        $this->config->method('isWebpEnabled')->willReturn(true);
        $this->config->method('isAvifEnabled')->willReturn(false);
        $this->config->method('getVariantWidths')->willReturn([640, 960]);
    }

    protected function tearDown(): void
    {
        unlink($this->banner);
        rmdir($this->root . '/wysiwyg');
        rmdir($this->root);
    }

    private function variants(bool $enabled = true): Variants
    {
        $this->config->method('isVariantsEnabled')->willReturn($enabled);

        return new Variants($this->config, new PathResolver(), new WebpFormat(), new AvifFormat());
    }

    public function testOnlyTheWidthsBelowTheSourceWidthAreGenerated(): void
    {
        self::assertSame([640], $this->variants()->widthsFor($this->banner));
        self::assertSame([$this->banner . '.w640.webp'], $this->variants()->pathsFor($this->banner));
    }

    public function testACatalogImageOrAMissingFileGetsNoVariant(): void
    {
        $variants = $this->variants();
        self::assertSame([], $variants->widthsFor($this->root . '/catalog/product/cache/0a/m/b/mb01.jpg'));
        self::assertSame([], $variants->widthsFor($this->root . '/wysiwyg/missing.jpg'));
    }

    public function testTheSettingSwitchesTheVariantsOff(): void
    {
        self::assertSame([], $this->variants(false)->widthsFor($this->banner));
    }

    public function testEveryPossibleVariantIsListedForACleanUp(): void
    {
        self::assertSame(
            [
                $this->banner . '.w640.webp',
                $this->banner . '.w640.avif',
                $this->banner . '.w960.webp',
                $this->banner . '.w960.avif',
            ],
            $this->variants()->allPossiblePaths($this->banner),
            'both formats and every configured width, whatever the source width'
        );
        self::assertSame([], $this->variants()->allPossiblePaths($this->root . '/catalog/category/banner.jpg'));
    }
}

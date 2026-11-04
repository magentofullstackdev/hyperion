<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Model;

use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;
use Magentofullstackdev\HyperionImage\Model\PathResolver;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the path-resolver convention.
 *
 * @covers \Magentofullstackdev\HyperionImage\Model\PathResolver
 */
class PathResolverTest extends TestCase
{
    private PathResolver $resolver;

    protected function setUp(): void
    {
        $this->resolver = new PathResolver();
    }

    public function testResolveAppendsExtensionForWebp(): void
    {
        $source = '/var/www/html/pub/media/catalog/product/cache/abc/foo/bar.jpg';
        self::assertSame(
            $source . '.webp',
            $this->resolver->resolve($source, new WebpFormat())
        );
    }

    public function testResolveAppendsExtensionForAvif(): void
    {
        $source = '/var/www/html/pub/media/catalog/product/cache/abc/foo/bar.jpg';
        self::assertSame(
            $source . '.avif',
            $this->resolver->resolve($source, new AvifFormat())
        );
    }

    public function testIsConvertibleSourceAcceptsCachedJpg(): void
    {
        self::assertTrue(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/catalog/product/cache/x/y/foo.jpg'
            )
        );
    }

    public function testIsConvertibleSourceAcceptsCachedPng(): void
    {
        self::assertTrue(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/catalog/product/cache/x/y/foo.png'
            )
        );
    }

    public function testIsConvertibleSourceAcceptsWysiwyg(): void
    {
        self::assertTrue(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/wysiwyg/banner.jpg'
            )
        );
    }

    public function testIsConvertibleSourceAcceptsCategoryBanner(): void
    {
        self::assertTrue(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/catalog/category/hero.jpg'
            )
        );
    }

    public function testIsConvertibleSourceRejectsNonAllowListedPath(): void
    {
        // Files outside allow-listed media subdirectories (customer
        // avatars, downloadable products, admin uploads) must be skipped.
        self::assertFalse(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/customer/avatar.jpg'
            )
        );
        self::assertFalse(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/downloadable/files/file.jpg'
            )
        );
    }

    public function testIsConvertibleSourceRejectsNonImageExtension(): void
    {
        self::assertFalse(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/catalog/product/cache/x/y/foo.txt'
            )
        );
    }

    public function testIsConvertibleSourceIsCaseInsensitiveOnExtension(): void
    {
        self::assertTrue(
            $this->resolver->isConvertibleSource(
                '/var/www/html/pub/media/catalog/product/cache/x/y/foo.JPG'
            )
        );
    }

    public function testResolveVariantNamesTheWidthBetweenSourceAndFormat(): void
    {
        self::assertSame(
            '/media/wysiwyg/hero.jpg.w640.webp',
            $this->resolver->resolveVariant('/media/wysiwyg/hero.jpg', new WebpFormat(), 640)
        );
    }

    public function testVariantsAreForContentImagesOnly(): void
    {
        self::assertTrue($this->resolver->supportsVariants('/media/wysiwyg/home/hero.jpg'));
        self::assertFalse($this->resolver->supportsVariants('/media/catalog/product/cache/0a/m/b/mb01.jpg'));
        self::assertFalse($this->resolver->supportsVariants('/media/catalog/category/banner.jpg'));
        self::assertFalse($this->resolver->supportsVariants('/media/wysiwyg/vector.svg'));
    }

    public function testGetCompanionPathsReturnsBothFormats(): void
    {
        $source = '/var/www/html/pub/media/catalog/product/cache/x/y/foo.jpg';
        self::assertSame(
            [$source . '.webp', $source . '.avif'],
            $this->resolver->getCompanionPaths($source)
        );
    }
}

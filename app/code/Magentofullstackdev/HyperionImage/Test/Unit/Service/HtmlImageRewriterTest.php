<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Service;

use Magentofullstackdev\HyperionImage\Service\HtmlImageRewriter;
use Magentofullstackdev\HyperionImage\ViewModel\ImageConfig;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionImage\Service\HtmlImageRewriter
 */
class HtmlImageRewriterTest extends TestCase
{
    /** @var ImageConfig&Stub */
    private ImageConfig $imageConfig;
    private HtmlImageRewriter $rewriter;

    protected function setUp(): void
    {
        $this->imageConfig = $this->createStub(ImageConfig::class);
        $this->rewriter = new HtmlImageRewriter($this->imageConfig);
    }

    public function testEmptyHtmlReturnsUnchanged(): void
    {
        self::assertSame('', $this->rewriter->rewrite(''));
    }

    public function testHtmlWithoutImgReturnsUnchanged(): void
    {
        $html = '<div class="banner">No images here</div>';
        self::assertSame($html, $this->rewriter->rewrite($html));
    }

    public function testReturnsUnchangedWhenAllFormatsDisabled(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(false);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);

        $html = '<img src="https://example.com/media/wysiwyg/banner.jpg" alt="">';
        self::assertSame(
            '<img src="https://example.com/media/wysiwyg/banner.jpg" alt="" fetchpriority="high">',
            $this->rewriter->rewrite($html),
            'no picture wrap, only the priority hint of the first image'
        );
    }

    public function testWrapsImgWithWebpSourceWhenCompanionExists(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(true);
        $this->imageConfig->method('getWebpUrl')
            ->willReturn('https://example.com/media/wysiwyg/banner.jpg.webp');
        $this->imageConfig->method('hasAvifCompanion')->willReturn(false);

        $html = '<img src="https://example.com/media/wysiwyg/banner.jpg" alt="">';
        $result = $this->rewriter->rewrite($html);

        self::assertStringContainsString('<picture>', $result);
        self::assertStringContainsString(
            '<source type="image/webp" srcset="https://example.com/media/wysiwyg/banner.jpg.webp">',
            $result
        );
        self::assertStringContainsString('<img src="https://example.com/media/wysiwyg/banner.jpg"', $result);
        self::assertStringContainsString('</picture>', $result);
    }

    public function testWrapsImgWithBothAvifAndWebpWhenBothExist(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(true);
        $this->imageConfig->method('hasAvifCompanion')->willReturn(true);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(true);
        $this->imageConfig->method('getAvifUrl')->willReturn('https://x.test/a.jpg.avif');
        $this->imageConfig->method('getWebpUrl')->willReturn('https://x.test/a.jpg.webp');

        $result = $this->rewriter->rewrite('<img src="https://x.test/a.jpg" alt="">');

        // AVIF must come BEFORE WebP -- browser picks the first matching <source>.
        $avifPos = strpos($result, 'image/avif');
        $webpPos = strpos($result, 'image/webp');
        self::assertNotFalse($avifPos);
        self::assertNotFalse($webpPos);
        self::assertLessThan($webpPos, $avifPos, 'AVIF source must appear before WebP source');
    }

    public function testDoesNotEmitSourceWhenCompanionMissing(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(false);
        $this->imageConfig->method('hasAvifCompanion')->willReturn(false);

        $html = '<img src="https://x.test/missing.jpg">';
        $result = $this->rewriter->rewrite($html);

        // No companions exist -> don't wrap (no point in <picture> with no <source>).
        self::assertStringNotContainsString('<picture>', $result);
        self::assertSame('<img src="https://x.test/missing.jpg" fetchpriority="high">', $result);
    }

    public function testDoesNotDoubleWrapImgAlreadyInsidePicture(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(true);
        $this->imageConfig->method('getWebpUrl')->willReturn('https://x.test/a.jpg.webp');
        $this->imageConfig->method('hasAvifCompanion')->willReturn(false);

        $html = '<picture><source type="image/webp" srcset="x.webp"><img src="https://x.test/a.jpg"></picture>';
        $result = $this->rewriter->rewrite($html);

        // Pre-existing <picture> stays at exactly one wrapping.
        self::assertSame(1, substr_count($result, '<picture>'));
        self::assertSame(1, substr_count($result, '</picture>'));
    }

    public function testHandlesSingleQuotedSrcAttribute(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(true);
        $this->imageConfig->method('getWebpUrl')
            ->willReturn('https://x.test/single.jpg.webp');
        $this->imageConfig->method('hasAvifCompanion')->willReturn(false);

        $html = "<img src='https://x.test/single.jpg' alt='banner'>";
        $result = $this->rewriter->rewrite($html);

        self::assertStringContainsString('<picture>', $result);
        self::assertStringContainsString('image/webp', $result);
    }

    public function testWrapsMultipleImgsInSameHtml(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(true);
        $this->imageConfig->method('getWebpUrl')->willReturnCallback(
            static fn (string $url): string => $url . '.webp'
        );
        $this->imageConfig->method('hasAvifCompanion')->willReturn(false);

        $html = '<div>'
            . '<img src="https://x.test/a.jpg">'
            . '<img src="https://x.test/b.jpg">'
            . '</div>';
        $result = $this->rewriter->rewrite($html);

        self::assertSame(2, substr_count($result, '<picture>'));
        self::assertSame(2, substr_count($result, '</picture>'));
        self::assertStringContainsString('a.jpg.webp', $result);
        self::assertStringContainsString('b.jpg.webp', $result);
    }

    public function testTheFirstContentImageOfTheRequestGetsThePriorityHint(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(false);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('getIntrinsicSize')->willReturn(null);

        $first = $this->rewriter->rewrite('<p><img src="/media/a.jpg" alt="" width="10" height="5" /><img src="/media/b.jpg"></p>');
        self::assertSame(
            '<p><img src="/media/a.jpg" alt="" width="10" height="5" fetchpriority="high" /><img src="/media/b.jpg"></p>',
            $first,
            'the first image of the first block gets the hint, the second image does not'
        );
        self::assertSame(
            '<img src="/media/c.jpg">',
            $this->rewriter->rewrite('<img src="/media/c.jpg">'),
            'a later block of the same request renders unchanged'
        );
    }

    public function testAnImageThatOptsOutKeepsTheHintFromEveryOtherImage(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(false);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('getIntrinsicSize')->willReturn(null);

        $html = '<img src="/media/a.jpg" loading="lazy"><img src="/media/b.jpg">';
        self::assertSame($html, $this->rewriter->rewrite($html), 'lazy first image: no hint anywhere');

        $rewriter = new HtmlImageRewriter($this->imageConfig);
        $html = '<img src="/media/a.jpg" fetchpriority="low">';
        self::assertSame($html, $rewriter->rewrite($html), 'an explicit priority is kept');
    }

    public function testThePriorityHintAndThePictureWrapTogether(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(true);
        $this->imageConfig->method('hasAvifCompanion')->willReturn(false);
        $this->imageConfig->method('getWebpUrl')->willReturn('/media/hero.jpg.webp');
        $this->imageConfig->method('getIntrinsicSize')->willReturn([1280, 460]);

        self::assertSame(
            '<picture><source type="image/webp" srcset="/media/hero.jpg.webp">'
            . '<img src="/media/hero.jpg" alt="" width="1280" height="460" fetchpriority="high"></picture>',
            $this->rewriter->rewrite('<img src="/media/hero.jpg" alt="">')
        );
    }

    public function testAddsIntrinsicSizeToLocalImagesWithoutDimensions(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(false);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('getIntrinsicSize')->willReturnCallback(
            static fn (string $url): ?array => $url === 'https://shop.test/media/wysiwyg/a.jpg' ? [640, 480] : null
        );
        $html = '<p><img src="https://shop.test/media/wysiwyg/a.jpg" alt="" /> <img src="https://cdn.other/b.jpg" alt="b"></p>';

        self::assertSame(
            '<p><img src="https://shop.test/media/wysiwyg/a.jpg" alt="" width="640" height="480" fetchpriority="high" /> <img src="https://cdn.other/b.jpg" alt="b"></p>',
            $this->rewriter->rewrite($html)
        );
    }

    public function testKeepsImagesThatCarryADimension(): void
    {
        $imageConfig = $this->createMock(ImageConfig::class);
        $imageConfig->method('isWebpEnabled')->willReturn(false);
        $imageConfig->method('isAvifEnabled')->willReturn(false);
        $imageConfig->expects(self::never())->method('getIntrinsicSize');
        $html = '<img src="https://shop.test/media/wysiwyg/a.jpg" width="100"><img height="20" src="https://shop.test/media/wysiwyg/b.jpg">';

        self::assertSame(
            '<img src="https://shop.test/media/wysiwyg/a.jpg" width="100" fetchpriority="high"><img height="20" src="https://shop.test/media/wysiwyg/b.jpg">',
            (new HtmlImageRewriter($imageConfig))->rewrite($html)
        );
    }

    public function testSizesAndPictureWrapTogether(): void
    {
        $this->imageConfig->method('isWebpEnabled')->willReturn(true);
        $this->imageConfig->method('isAvifEnabled')->willReturn(false);
        $this->imageConfig->method('getIntrinsicSize')->willReturn([10, 20]);
        $this->imageConfig->method('hasWebpCompanion')->willReturn(true);
        $this->imageConfig->method('getWebpUrl')->willReturn('https://shop.test/media/wysiwyg/a.jpg.webp');

        self::assertSame(
            '<picture><source type="image/webp" srcset="https://shop.test/media/wysiwyg/a.jpg.webp"><img src="https://shop.test/media/wysiwyg/a.jpg" width="10" height="20" fetchpriority="high"></picture>',
            $this->rewriter->rewrite('<img src="https://shop.test/media/wysiwyg/a.jpg">')
        );
    }
}

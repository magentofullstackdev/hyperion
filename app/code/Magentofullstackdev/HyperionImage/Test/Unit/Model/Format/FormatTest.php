<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Model\Format;

use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;
use PHPUnit\Framework\TestCase;

/**
 * Tests pin the format value objects against the contract the
 * encoder layer relies on (extension + mime type + Imagick format
 * id). Regressions here would silently route messages to the
 * wrong encoder backend.
 *
 * @covers \Magentofullstackdev\HyperionImage\Model\Format\WebpFormat
 * @covers \Magentofullstackdev\HyperionImage\Model\Format\AvifFormat
 */
class FormatTest extends TestCase
{
    public function testWebpFormatMembers(): void
    {
        $format = new WebpFormat();
        self::assertSame('webp', $format->getName());
        self::assertSame('webp', $format->getExtension());
        self::assertSame('image/webp', $format->getMimeType());
        self::assertSame('WEBP', $format->getImagickFormat());
    }

    public function testAvifFormatMembers(): void
    {
        $format = new AvifFormat();
        self::assertSame('avif', $format->getName());
        self::assertSame('avif', $format->getExtension());
        self::assertSame('image/avif', $format->getMimeType());
        self::assertSame('AVIF', $format->getImagickFormat());
    }
}

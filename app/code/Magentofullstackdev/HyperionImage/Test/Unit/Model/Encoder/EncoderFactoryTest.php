<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Model\Encoder;

use Magentofullstackdev\HyperionImage\Exception\EncoderException;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Encoder\EncoderFactory;
use Magentofullstackdev\HyperionImage\Model\Encoder\GdEncoder;
use Magentofullstackdev\HyperionImage\Model\Encoder\ImagickEncoder;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * Tests cover the preference-resolution logic of the factory. The
 * encoders themselves are mocked -- `supports()` is a pure capability
 * probe with no side effects, so a stub is faithful to behavior.
 *
 * @covers \Magentofullstackdev\HyperionImage\Model\Encoder\EncoderFactory
 */
class EncoderFactoryTest extends TestCase
{
    /** @var Config&Stub */
    private Config $config;
    /** @var ImagickEncoder&Stub */
    private ImagickEncoder $imagick;
    /** @var GdEncoder&Stub */
    private GdEncoder $gd;
    private EncoderFactory $factory;
    private WebpFormat $webp;

    protected function setUp(): void
    {
        $this->config = $this->createStub(Config::class);
        $this->imagick = $this->createStub(ImagickEncoder::class);
        $this->gd = $this->createStub(GdEncoder::class);
        $this->factory = new EncoderFactory($this->config, $this->imagick, $this->gd);
        $this->webp = new WebpFormat();
    }

    public function testAutoPrefersImagickWhenSupportsBoth(): void
    {
        $this->config->method('getEncoderPreference')->willReturn(Config::ENCODER_AUTO);
        $this->imagick->method('supports')->willReturn(true);
        $this->gd->method('supports')->willReturn(true);

        self::assertSame($this->imagick, $this->factory->get($this->webp));
    }

    public function testAutoFallsBackToGdWhenImagickUnsupported(): void
    {
        $this->config->method('getEncoderPreference')->willReturn(Config::ENCODER_AUTO);
        $this->imagick->method('supports')->willReturn(false);
        $this->gd->method('supports')->willReturn(true);

        self::assertSame($this->gd, $this->factory->get($this->webp));
    }

    public function testAutoThrowsWhenNeitherSupports(): void
    {
        $this->config->method('getEncoderPreference')->willReturn(Config::ENCODER_AUTO);
        $this->imagick->method('supports')->willReturn(false);
        $this->gd->method('supports')->willReturn(false);

        $this->expectException(EncoderException::class);
        $this->factory->get($this->webp);
    }

    public function testForceImagickThrowsWhenNotSupported(): void
    {
        $this->config->method('getEncoderPreference')->willReturn(Config::ENCODER_IMAGICK);
        $this->imagick->method('supports')->willReturn(false);

        $this->expectException(EncoderException::class);
        $this->factory->get($this->webp);
    }

    public function testForceGdReturnsGdWhenSupported(): void
    {
        $this->config->method('getEncoderPreference')->willReturn(Config::ENCODER_GD);
        $this->gd->method('supports')->willReturn(true);

        self::assertSame($this->gd, $this->factory->get($this->webp));
    }

    public function testForceGdThrowsWhenNotSupported(): void
    {
        $this->config->method('getEncoderPreference')->willReturn(Config::ENCODER_GD);
        $this->gd->method('supports')->willReturn(false);

        $this->expectException(EncoderException::class);
        $this->factory->get($this->webp);
    }
}

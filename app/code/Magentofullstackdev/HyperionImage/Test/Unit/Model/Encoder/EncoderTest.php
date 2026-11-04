<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Model\Encoder;

use Magentofullstackdev\HyperionImage\Exception\EncoderException;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Encoder\EncoderInterface;
use Magentofullstackdev\HyperionImage\Model\Encoder\GdEncoder;
use Magentofullstackdev\HyperionImage\Model\Encoder\ImagickEncoder;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * Runs the real GD and Imagick extensions (each dataset is skipped when
 * its extension is not loaded) on files of a few bytes in the system
 * temp directory: the pixel budget must refuse a declared canvas before
 * any pixel is decoded, and no `<target>.tmp` may survive a failed
 * encode.
 *
 * @covers \Magentofullstackdev\HyperionImage\Model\Encoder\GdEncoder
 * @covers \Magentofullstackdev\HyperionImage\Model\Encoder\ImagickEncoder
 */
class EncoderTest extends TestCase
{
    private const GD = 'gd';
    private const IMAGICK = 'imagick';

    private string $scratch = '';
    private int $maxPixels = Config::DEFAULT_MAX_PIXELS;
    /** @var Config&Stub */
    private Config $config;
    private WebpFormat $webp;

    protected function setUp(): void
    {
        $this->scratch = sys_get_temp_dir() . '/hyperion-encoder-' . bin2hex(random_bytes(6));
        if (!mkdir($this->scratch, 0700) && !is_dir($this->scratch)) {
            self::fail('Cannot create the scratch directory ' . $this->scratch);
        }
        $this->maxPixels = Config::DEFAULT_MAX_PIXELS;
        $this->config = $this->createStub(Config::class);
        $this->config->method('getMaxPixels')->willReturnCallback(fn (): int => $this->maxPixels);
        $this->webp = new WebpFormat();
    }

    protected function tearDown(): void
    {
        if ($this->scratch === '' || !is_dir($this->scratch)) {
            return;
        }
        $entries = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->scratch, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($entries as $entry) {
            $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
        }
        rmdir($this->scratch);
    }

    /**
     * The canvas a bomb declares per encoder: Imagick stays below the
     * 16000 px width and height policy of a stock ImageMagick so the
     * refusal is ours and not the delegate's.
     */
    private const BOMB_SIDE = [self::GD => 30000, self::IMAGICK => 8000];

    /** The message of a truncated source per encoder. */
    private const TRUNCATED_MESSAGE = [self::GD => 'Cannot read image', self::IMAGICK => 'Imagick failed for'];

    /** The message of an unwritable target per encoder. */
    private const UNWRITABLE_MESSAGE = [self::GD => 'GD encode failed', self::IMAGICK => 'Imagick failed for'];

    /**
     * @return array<string, array{string}>
     */
    public static function encoders(): array
    {
        return [
            'gd' => [self::GD],
            'imagick' => [self::IMAGICK],
        ];
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testOversizedHeaderIsRefusedBeforeDecoding(string $kind): void
    {
        $encoder = $this->encoder($kind);
        $bombSide = self::BOMB_SIDE[$kind];
        // Up to 900 MP declared in about 70 bytes: decoding it would need gigabytes.
        $source = $this->writeDeclaredPng('bomb.png', $bombSide, $bombSide);
        $target = $this->path('bomb.png.webp');

        try {
            $encoder->encode($source, $target, $this->webp, 80);
            self::fail('An EncoderException was expected.');
        } catch (EncoderException $e) {
            self::assertStringContainsString('pixel budget', $e->getMessage());
            self::assertStringContainsString($bombSide . ' x ' . $bombSide, $e->getMessage());
        }
        self::assertFileDoesNotExist($target);
        self::assertFileDoesNotExist($target . '.tmp');
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testBudgetFollowsTheConfiguration(string $kind): void
    {
        $encoder = $this->encoder($kind);
        $this->maxPixels = 1000;
        $source = $this->writeDeclaredPng('medium.png', 40, 40);

        $this->expectException(EncoderException::class);
        $this->expectExceptionMessage('1600 > 1000');
        $encoder->encode($source, $this->path('medium.png.webp'), $this->webp, 80);
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testZeroBudgetDisablesTheCheck(string $kind): void
    {
        $encoder = $this->webpEncoder($kind);
        $this->maxPixels = 0;
        $source = $this->writeRealPng('tiny.png');
        $target = $this->path('tiny.png.webp');

        self::assertTrue($encoder->encode($source, $target, $this->webp, 80));
        self::assertFileExists($target);
        self::assertFileDoesNotExist($target . '.tmp');
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testTinyImageWithinTheDefaultBudgetIsEncoded(string $kind): void
    {
        $encoder = $this->webpEncoder($kind);
        $source = $this->writeRealPng('tiny.png');
        $target = $this->path('tiny.png.webp');

        self::assertTrue($encoder->encode($source, $target, $this->webp, 80));
        self::assertFileExists($target);
        self::assertSame(IMAGETYPE_WEBP, (int) (getimagesize($target)[2] ?? 0));
        self::assertFileDoesNotExist($target . '.tmp');
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testTruncatedFileIsRefused(string $kind): void
    {
        $encoder = $this->encoder($kind);
        $source = $this->writeTruncatedPng('cut.png');
        $target = $this->path('cut.png.webp');

        try {
            $encoder->encode($source, $target, $this->webp, 80);
            self::fail('An EncoderException was expected.');
        } catch (EncoderException $e) {
            self::assertStringContainsString(self::TRUNCATED_MESSAGE[$kind], $e->getMessage());
        }
        self::assertFileDoesNotExist($target);
        self::assertFileDoesNotExist($target . '.tmp');
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testMissingSourceIsRefused(string $kind): void
    {
        $encoder = $this->encoder($kind);

        $this->expectException(EncoderException::class);
        $this->expectExceptionMessage('Source file not found');
        $encoder->encode($this->path('absent.png'), $this->path('absent.png.webp'), $this->webp, 80);
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testNoTempFileSurvivesAnUnwritableTarget(string $kind): void
    {
        $encoder = $this->webpEncoder($kind);
        $source = $this->writeRealPng('tiny.png');
        // A target under a regular file: nothing can be written there, for
        // root as well as for an ordinary user.
        $file = $this->path('not-a-directory');
        file_put_contents($file, 'x');
        $target = $file . '/tiny.png.webp';

        try {
            $encoder->encode($source, $target, $this->webp, 80);
            self::fail('An EncoderException was expected.');
        } catch (EncoderException $e) {
            self::assertStringContainsString(self::UNWRITABLE_MESSAGE[$kind], $e->getMessage());
        }
        self::assertFileDoesNotExist($target . '.tmp');
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testNoTempFileSurvivesARefusedRename(string $kind): void
    {
        $encoder = $this->webpEncoder($kind);
        $source = $this->writeRealPng('tiny.png');
        // The target is a directory with a file inside, so the `.tmp`
        // sibling is written in full and `rename()` is what fails.
        $target = $this->path('tiny.png.webp');
        mkdir($target, 0700);
        file_put_contents($target . '/keep', 'x');

        try {
            $encoder->encode($source, $target, $this->webp, 80);
            self::fail('An EncoderException was expected.');
        } catch (EncoderException $e) {
            self::assertStringContainsString('Atomic rename failed', $e->getMessage());
        }
        self::assertFileDoesNotExist($target . '.tmp');
        self::assertFileExists($target . '/keep');
    }

    /**
     * @dataProvider encoders
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('encoders')]
    public function testAMaxWidthScalesTheImageDownKeepingTheRatio(string $kind): void
    {
        $encoder = $this->webpEncoder($kind);
        $image = imagecreatetruecolor(40, 20);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 20, 120, 200));
        $source = $this->path('wide.png');
        imagepng($image, $source);

        self::assertTrue($encoder->encode($source, $this->path('wide.png.w20.webp'), $this->webp, 80, 20));
        self::assertTrue($encoder->encode($source, $this->path('wide.png.webp'), $this->webp, 80, 400));

        $variant = getimagesize($this->path('wide.png.w20.webp'));
        $full = getimagesize($this->path('wide.png.webp'));
        self::assertSame([20, 10], [$variant[0], $variant[1]], 'half the width, the ratio kept');
        self::assertSame([40, 20], [$full[0], $full[1]], 'a larger max width leaves the size alone');
    }

    private function encoder(string $kind): EncoderInterface
    {
        if (!extension_loaded($kind)) {
            self::markTestSkipped('The ' . $kind . ' extension is not loaded.');
        }

        return $kind === self::GD ? new GdEncoder($this->config) : new ImagickEncoder($this->config);
    }

    private function webpEncoder(string $kind): EncoderInterface
    {
        $encoder = $this->encoder($kind);
        if (!$encoder->supports($this->webp)) {
            self::markTestSkipped('No WebP support in ' . $kind . ' on this build.');
        }

        return $encoder;
    }

    private function path(string $name): string
    {
        return $this->scratch . '/' . $name;
    }

    /**
     * A syntactically valid PNG of about 70 bytes whose IHDR declares the
     * given canvas: what a decompression bomb looks like to a header
     * reader. The IDAT holds the deflate stream of one empty row, so
     * nothing but the header is trustworthy.
     */
    private function writeDeclaredPng(string $name, int $width, int $height): string
    {
        $ihdr = pack('NN', $width, $height) . "\x08\x02\x00\x00\x00";
        $idat = (string) gzcompress("\x00\x00\x00\x00", 9);
        $png = "\x89PNG\r\n\x1a\n"
            . $this->pngChunk('IHDR', $ihdr)
            . $this->pngChunk('IDAT', $idat)
            . $this->pngChunk('IEND', '');
        $path = $this->path($name);
        file_put_contents($path, $png);

        return $path;
    }

    /**
     * A real 2 x 2 opaque PNG rendered by GD, so both decoders accept it.
     */
    private function writeRealPng(string $name): string
    {
        $image = imagecreatetruecolor(2, 2);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 200, 30, 30));
        $path = $this->path($name);
        imagepng($image, $path);

        return $path;
    }

    /**
     * The first 20 bytes of a PNG: signature, IHDR length and type, no
     * dimensions. Neither header reader can make sense of it.
     */
    private function writeTruncatedPng(string $name): string
    {
        $path = $this->path($name);
        file_put_contents($path, "\x89PNG\r\n\x1a\n" . pack('N', 13) . 'IHDR' . "\x00\x00\x00\x00");

        return $path;
    }

    private function pngChunk(string $type, string $data): string
    {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    }
}

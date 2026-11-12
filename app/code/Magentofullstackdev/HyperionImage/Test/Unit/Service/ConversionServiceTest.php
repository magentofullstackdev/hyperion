<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Test\Unit\Service;

use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\ConversionRequest;
use Magentofullstackdev\HyperionImage\Model\Converter;
use Magentofullstackdev\HyperionImage\Queue\Publisher;
use Magentofullstackdev\HyperionImage\Service\ConversionRequestFactory;
use Magentofullstackdev\HyperionImage\Service\ConversionService;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionImage\Service\ConversionService
 */
class ConversionServiceTest extends TestCase
{
    private const SOURCE = '/var/www/html/pub/media/catalog/product/cache/0a1b2c/m/b/mb01-blue-0.jpg';

    public function testDispatchEncodesInlineInSyncMode(): void
    {
        $config = $this->createStub(Config::class);
        $config->method('getConversionMode')->willReturn(Config::MODE_SYNC);

        $converter = $this->createMock(Converter::class);
        $converter->expects(self::once())->method('convert')->with(self::SOURCE)->willReturn(['webp' => true]);
        $publisher = $this->createMock(Publisher::class);
        $publisher->expects(self::never())->method('publish');

        $service = new ConversionService($converter, $publisher, new ConversionRequestFactory(), $config);
        $service->dispatch(self::SOURCE);
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('queueModes')]
    public function testDispatchPublishesInQueueMode(string $mode): void
    {
        $config = $this->createStub(Config::class);
        $config->method('getConversionMode')->willReturn($mode);

        $converter = $this->createMock(Converter::class);
        $converter->expects(self::never())->method('convert');
        $publisher = $this->createMock(Publisher::class);
        $publisher->expects(self::once())->method('publish')->with(
            self::callback(static fn (ConversionRequest $request): bool => $request->getSourcePath() === self::SOURCE)
        );

        $service = new ConversionService($converter, $publisher, new ConversionRequestFactory(), $config);
        $service->dispatch(self::SOURCE);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function queueModes(): array
    {
        return [
            'queue' => [Config::MODE_QUEUE],
            'unknown value falls back to the queue' => ['something-else'],
        ];
    }
}

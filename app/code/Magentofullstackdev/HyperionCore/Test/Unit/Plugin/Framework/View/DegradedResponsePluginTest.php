<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Framework\View;

use Magento\Framework\App\Response\Http as HttpResponse;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\View\Layout;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionCore\Plugin\Framework\View\DegradedResponsePlugin;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Framework\View\DegradedResponsePlugin
 * @covers \Magentofullstackdev\HyperionCore\Model\CacheHeaders
 */
class DegradedResponsePluginTest extends TestCase
{
    public function testADegradedPageGetsTheNoCacheHeaders(): void
    {
        $degraded = new DegradedResponse();
        $degraded->mark();
        $response = $this->createMock(HttpResponse::class);
        $response->expects(self::once())->method('setNoCacheHeaders');

        $plugin = new DegradedResponsePlugin($degraded, $response);

        self::assertSame('<html>', $plugin->afterGetOutput($this->createStub(Layout::class), '<html>'));
    }

    public function testAHealthyPageKeepsItsHeaders(): void
    {
        $response = $this->createMock(HttpResponse::class);
        $response->expects(self::never())->method('setNoCacheHeaders');

        $plugin = new DegradedResponsePlugin(new DegradedResponse(), $response);

        self::assertSame('<html>', $plugin->afterGetOutput($this->createStub(Layout::class), '<html>'));
    }

    public function testADegradedFragmentNeverGetsThePublicHeaders(): void
    {
        $degraded = new DegradedResponse();
        $degraded->mark();
        $raw = $this->rawCollecting($headers);

        (new CacheHeaders($degraded))->applyPublic($raw, 3600);

        self::assertStringContainsString('no-store', $headers['Cache-Control']);
        self::assertArrayNotHasKey('X-Hyperion-Public-Cache', $headers);
    }

    public function testAHealthyFragmentIsPublic(): void
    {
        $raw = $this->rawCollecting($headers);

        (new CacheHeaders(new DegradedResponse()))->applyPublic($raw, 3600);

        self::assertSame('public, max-age=3600, s-maxage=3600', $headers['Cache-Control']);
    }

    /**
     * @param array<string, string>|null $headers
     */
    private function rawCollecting(?array &$headers): Raw
    {
        $headers = [];
        $raw = $this->createStub(Raw::class);
        $raw->method('setHeader')->willReturnCallback(
            static function (string $name, string $value) use (&$headers, $raw) {
                $headers[$name] = $value;
                return $raw;
            }
        );

        return $raw;
    }
}

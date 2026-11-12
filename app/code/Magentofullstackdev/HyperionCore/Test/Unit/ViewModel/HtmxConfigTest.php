<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\ViewModel;

use Magentofullstackdev\HyperionCore\Block\AssetManifest;
use Magentofullstackdev\HyperionCore\ViewModel\HtmxConfig;
use PHPUnit\Framework\TestCase;

class HtmxConfigTest extends TestCase
{
    public function testTheConfigKeepsNoHistorySnapshotAndReloadsOnAHistoryMiss(): void
    {
        $config = $this->decodeConfig();

        self::assertSame(0, $config['historyCacheSize']);
        self::assertTrue($config['refreshOnHistoryMiss']);
    }

    public function testTheConfigKeepsEvalScriptTagsAndInjectedIndicatorStylesOff(): void
    {
        $config = $this->decodeConfig();

        self::assertFalse($config['allowEval']);
        self::assertFalse($config['allowScriptTags']);
        self::assertFalse($config['includeIndicatorStyles']);
    }

    public function testTheScriptUrlComesFromTheAssetManifestEntryOfHtmx(): void
    {
        $manifest = $this->createMock(AssetManifest::class);
        $manifest->expects(self::once())
            ->method('getAssetUrl')
            ->with(HtmxConfig::MANIFEST_ENTRY)
            ->willReturn('https://store.test/static/assets/htmx.abc123.js');

        self::assertSame(
            'https://store.test/static/assets/htmx.abc123.js',
            (new HtmxConfig($manifest))->getScriptUrl()
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeConfig(): array
    {
        $viewModel = new HtmxConfig($this->createStub(AssetManifest::class));
        $config = json_decode($viewModel->getConfigJson(), true, 8, JSON_THROW_ON_ERROR);
        self::assertIsArray($config);

        return $config;
    }
}

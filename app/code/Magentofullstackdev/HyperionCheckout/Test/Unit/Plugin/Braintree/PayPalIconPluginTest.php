<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Plugin\Braintree;

use Magento\Framework\View\Asset\File;
use Magento\Payment\Model\CcConfig;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Plugin\Braintree\PayPalIconPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Plugin\Braintree\PayPalIconPlugin
 */
class PayPalIconPluginTest extends TestCase
{
    /**
     * A 3 x 2 pixel PNG.
     */
    private const PNG_3X2 = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAC0lEQVQI'
        . 'mWNgwAQAABQAAWX1h1kAAAAASUVORK5CYII=';

    private const ICON_URL = 'https://example.test/static/frontend/Vendor/theme/en_US/'
        . 'PayPal_Braintree/images/paypal.png';

    public function testSizeIsReadFromTheAssetContent(): void
    {
        $asset = $this->createStub(File::class);
        $asset->method('getUrl')->willReturn(self::ICON_URL);
        $asset->method('getContent')->willReturn((string) base64_decode(self::PNG_3X2, true));
        $ccConfig = $this->createStub(CcConfig::class);
        $ccConfig->method('createAsset')->willReturn($asset);
        $plugin = new PayPalIconPlugin($ccConfig, $this->storeManager(1), $this->createStub(LoggerInterface::class));

        $icon = $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());

        self::assertSame(['url' => self::ICON_URL, 'width' => 3, 'height' => 2], $icon);
    }

    public function testUnreadableContentFallsBackToTheDefaultSizeAndLogs(): void
    {
        $asset = $this->createStub(File::class);
        $asset->method('getUrl')->willReturn(self::ICON_URL);
        $asset->method('getContent')->willThrowException(new \RuntimeException('Unable to get content'));
        $ccConfig = $this->createStub(CcConfig::class);
        $ccConfig->method('createAsset')->willReturn($asset);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning');
        $plugin = new PayPalIconPlugin($ccConfig, $this->storeManager(1), $logger);

        $icon = $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());

        self::assertSame(['url' => self::ICON_URL, 'width' => 54, 'height' => 32], $icon);
    }

    public function testContentThatIsNotAnImageFallsBackToTheDefaultSizeAndLogs(): void
    {
        $asset = $this->createStub(File::class);
        $asset->method('getUrl')->willReturn(self::ICON_URL);
        $asset->method('getContent')->willReturn('not an image');
        $ccConfig = $this->createStub(CcConfig::class);
        $ccConfig->method('createAsset')->willReturn($asset);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning');
        $plugin = new PayPalIconPlugin($ccConfig, $this->storeManager(1), $logger);

        $icon = $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());

        self::assertSame(['url' => self::ICON_URL, 'width' => 54, 'height' => 32], $icon);
    }

    public function testUnresolvableAssetGivesAnEmptyUrlAndTheDefaultSize(): void
    {
        $ccConfig = $this->createStub(CcConfig::class);
        $ccConfig->method('createAsset')->willThrowException(new \LogicException('No theme'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning');
        $plugin = new PayPalIconPlugin($ccConfig, $this->storeManager(1), $logger);

        $icon = $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());

        self::assertSame(['url' => '', 'width' => 54, 'height' => 32], $icon);
    }

    public function testIconIsBuiltOncePerStore(): void
    {
        $asset = $this->createStub(File::class);
        $asset->method('getUrl')->willReturn(self::ICON_URL);
        $asset->method('getContent')->willReturn((string) base64_decode(self::PNG_3X2, true));
        $ccConfig = $this->createMock(CcConfig::class);
        $ccConfig->expects(self::once())
            ->method('createAsset')
            ->with(PayPalIconPlugin::FILE_ID)
            ->willReturn($asset);
        $plugin = new PayPalIconPlugin($ccConfig, $this->storeManager(1), $this->createStub(LoggerInterface::class));

        $first = $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());
        $second = $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());

        self::assertSame($first, $second);
    }

    public function testAnotherStoreBuildsItsOwnIcon(): void
    {
        $asset = $this->createStub(File::class);
        $asset->method('getUrl')->willReturn(self::ICON_URL);
        $asset->method('getContent')->willReturn((string) base64_decode(self::PNG_3X2, true));
        $ccConfig = $this->createMock(CcConfig::class);
        $ccConfig->expects(self::exactly(2))->method('createAsset')->willReturn($asset);
        $firstStore = $this->createStub(StoreInterface::class);
        $firstStore->method('getId')->willReturn(1);
        $secondStore = $this->createStub(StoreInterface::class);
        $secondStore->method('getId')->willReturn(2);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturnOnConsecutiveCalls($firstStore, $secondStore, $firstStore);
        $plugin = new PayPalIconPlugin($ccConfig, $storeManager, $this->createStub(LoggerInterface::class));

        $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());
        $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());
        $plugin->aroundGetPayPalIcon(new \stdClass(), $this->failingProceed());
    }

    private function storeManager(int $storeId): StoreManagerInterface
    {
        $store = $this->createStub(StoreInterface::class);
        $store->method('getId')->willReturn($storeId);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        return $storeManager;
    }

    /**
     * The original method must never run: it reads the icon over HTTP.
     */
    private function failingProceed(): \Closure
    {
        return static function (): array {
            self::fail('The original getPayPalIcon() must not be called.');
        };
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Plugin\Braintree;

use Magento\Payment\Model\CcConfig;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Measures the Braintree PayPal icon from its source file instead of over HTTP.
 *
 * Replaces `PayPal\Braintree\Gateway\Config\PayPal\Config::getPayPalIcon()`
 * (the Braintree module is optional: no import, no type hint on its classes).
 * The original downloads the image from the store's own public static URL to
 * read its size, which waits on the network on every checkout config build and
 * throws a TypeError on PHP 8 when the store cannot reach itself (container,
 * firewall, basic auth, self-signed certificate). Here the bytes come from the
 * view file the asset resolves to (`File::getContent()`, the module source
 * through the theme fallback, in developer and production mode alike) and the
 * size falls back to the shipped icon's 54 x 32 when they cannot be read.
 *
 * The answer is kept per store for the request: the URL carries the store's
 * theme, locale and base URL, the file read and its retries happen once.
 */
class PayPalIconPlugin
{
    public const FILE_ID = 'PayPal_Braintree::images/paypal.png';
    public const FALLBACK_WIDTH = 54;
    public const FALLBACK_HEIGHT = 32;

    /**
     * @var array<string, array{url: string, width: int, height: int}>
     */
    private array $icons = [];

    /**
     * @param CcConfig $ccConfig
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CcConfig $ccConfig,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Answer the icon URL and size without calling the original method.
     *
     * @param object $subject
     * @param callable $proceed
     * @return array{url: string, width: int, height: int}
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function aroundGetPayPalIcon(object $subject, callable $proceed): array
    {
        $memoKey = $this->memoKey();

        return $this->icons[$memoKey] ??= $this->buildIcon();
    }

    /**
     * Read the icon size from its source file.
     *
     * @return array{url: string, width: int, height: int}
     */
    private function buildIcon(): array
    {
        try {
            $asset = $this->ccConfig->createAsset(self::FILE_ID);
            $url = (string) $asset->getUrl();
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion: the Braintree PayPal icon could not be resolved.', ['exception' => $e]);

            return ['url' => '', 'width' => self::FALLBACK_WIDTH, 'height' => self::FALLBACK_HEIGHT];
        }

        try {
            $content = $asset->getContent();
            $size = $content !== '' ? getimagesizefromstring($content) : false;
            if (is_array($size) && $size[0] > 0 && $size[1] > 0) {
                return ['url' => $url, 'width' => (int) $size[0], 'height' => (int) $size[1]];
            }
            $this->logger->warning(
                'Hyperion: the Braintree PayPal icon is not a readable image, using its default size.',
                ['file' => self::FILE_ID]
            );
        } catch (\Throwable $e) {
            $this->logger->warning(
                'Hyperion: the Braintree PayPal icon could not be read, using its default size.',
                ['exception' => $e]
            );
        }

        return ['url' => $url, 'width' => self::FALLBACK_WIDTH, 'height' => self::FALLBACK_HEIGHT];
    }

    /**
     * Memo key: the current store, whose design and base URL shape the icon URL.
     *
     * @return string
     */
    private function memoKey(): string
    {
        try {
            return (string) $this->storeManager->getStore()->getId();
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion: no current store for the Braintree PayPal icon.', ['exception' => $e]);

            return '';
        }
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Central configuration reader for the HyperionImage module.
 *
 * Every consumer of admin-configurable values goes through this class
 * so the XML paths stay defined in one spot. Defaults mirror those in
 * `etc/config.xml` and are also re-stated as fallback literals here so
 * a missing config row never produces an unhelpful zero or empty
 * string.
 */
class Config
{
    public const XML_PATH_ENABLED = 'hyperion_image/general/enabled';
    public const XML_PATH_CONVERSION_MODE = 'hyperion_image/general/conversion_mode';
    public const XML_PATH_WEBP_ENABLED = 'hyperion_image/webp/enabled';
    public const XML_PATH_WEBP_QUALITY = 'hyperion_image/webp/quality';
    public const XML_PATH_WEBP_SKIP_IF_LARGER = 'hyperion_image/webp/skip_if_larger';
    public const XML_PATH_AVIF_ENABLED = 'hyperion_image/avif/enabled';
    public const XML_PATH_AVIF_QUALITY = 'hyperion_image/avif/quality';
    public const XML_PATH_AVIF_SKIP_IF_LARGER = 'hyperion_image/avif/skip_if_larger';
    public const XML_PATH_ENCODER_PREFERENCE = 'hyperion_image/encoder/preference';
    public const XML_PATH_INVALIDATE_ON_BATCH_END = 'hyperion_image/general/invalidate_on_batch_end';
    public const XML_PATH_MAX_PIXELS = 'hyperion_image/general/max_pixels';

    /** Decoding budget in pixels (width x height) when the config row is missing: 40 MP. */
    public const DEFAULT_MAX_PIXELS = 40000000;

    public const MODE_QUEUE = 'queue';
    public const MODE_SYNC = 'sync';

    public const ENCODER_AUTO = 'auto';
    public const ENCODER_IMAGICK = 'imagick';
    public const ENCODER_GD = 'gd';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    public function getConversionMode(): string
    {
        $value = (string) $this->scopeConfig->getValue(
            self::XML_PATH_CONVERSION_MODE,
            ScopeInterface::SCOPE_STORE
        );
        return $value !== '' ? $value : self::MODE_QUEUE;
    }

    public function isWebpEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_WEBP_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    public function getWebpQuality(): int
    {
        $value = (int) $this->scopeConfig->getValue(
            self::XML_PATH_WEBP_QUALITY,
            ScopeInterface::SCOPE_STORE
        );
        return $value > 0 ? $value : 82;
    }

    public function shouldSkipWebpIfLarger(): bool
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_WEBP_SKIP_IF_LARGER,
            ScopeInterface::SCOPE_STORE
        );
    }

    public function isAvifEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_AVIF_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    public function getAvifQuality(): int
    {
        $value = (int) $this->scopeConfig->getValue(
            self::XML_PATH_AVIF_QUALITY,
            ScopeInterface::SCOPE_STORE
        );
        return $value > 0 ? $value : 75;
    }

    public function shouldSkipAvifIfLarger(): bool
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_AVIF_SKIP_IF_LARGER,
            ScopeInterface::SCOPE_STORE
        );
    }

    public function getEncoderPreference(): string
    {
        $value = (string) $this->scopeConfig->getValue(
            self::XML_PATH_ENCODER_PREFERENCE,
            ScopeInterface::SCOPE_STORE
        );
        return $value !== '' ? $value : self::ENCODER_AUTO;
    }

    /**
     * Largest image (width x height, in pixels) the encoders decode. A
     * source above the budget is refused before any pixel is read, so a
     * decompression bomb (a tiny file whose header declares a huge
     * canvas) cannot exhaust the memory of the queue consumer. 0 disables
     * the limit.
     */
    public function getMaxPixels(): int
    {
        $value = $this->scopeConfig->getValue(self::XML_PATH_MAX_PIXELS, ScopeInterface::SCOPE_STORE);
        if ($value === null || $value === '') {
            return self::DEFAULT_MAX_PIXELS;
        }
        return max(0, (int) $value);
    }

    /**
     * True when the BatchInvalidator should invalidate the cache tags
     * of the affected products at the end of a CLI run or a queue
     * consumer run. Defaults ON.
     */
    public function isInvalidateOnBatchEndEnabled(): bool
    {
        $value = $this->scopeConfig->getValue(self::XML_PATH_INVALIDATE_ON_BATCH_END);
        if ($value === null) {
            return true;
        }
        return $this->scopeConfig->isSetFlag(self::XML_PATH_INVALIDATE_ON_BATCH_END);
    }
}

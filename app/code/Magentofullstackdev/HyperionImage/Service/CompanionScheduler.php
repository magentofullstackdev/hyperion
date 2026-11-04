<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Service;

use Magento\Framework\App\CacheInterface;
use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\PathResolver;
use Magentofullstackdev\HyperionImage\Model\Variants;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Schedules the conversion of a source image whose companion files
 * (`.webp`, `.avif`, per the enabled formats) are missing on disk.
 *
 * Two entry points:
 *   - `scheduleIfMissing()`: dispatch whenever at least one enabled
 *     companion is missing. Used after core's `ImageResize` service
 *     wrote cache files (`catalog:images:resize`, the product save
 *     observer, the resize consumer, `get.php`): the files are fresh,
 *     so every missing companion is worth a message.
 *   - `scheduleOnceIfMissing()`: the storefront safety net. A template
 *     that finds no companion for an image it renders calls it so the
 *     NEXT render (after the consumer ran and invalidated the product's
 *     cache tags) ships the `<source>`. It is deduplicated per process
 *     and, through a flag in the application cache, for 24 hours: a
 *     companion that can never exist (a WebP discarded by
 *     `skip_if_larger`, an encoder failure) costs one attempt a day, not
 *     one per render.
 *
 * Both honour the module switch, the path allow-list of `PathResolver`
 * and the existence of the source, and dispatch through
 * `ConversionService::dispatch()` (queue or sync per the admin mode).
 */
class CompanionScheduler
{
    public const CACHE_TAG = 'HYPERION_IMAGE';

    private const CACHE_KEY_PREFIX = 'HYPERION_IMAGE_SCHEDULED_';

    /** One attempt a day for a source whose companion never shows up. */
    private const CACHE_LIFETIME = 86400;

    /** @var array<string, true> sources handled in this process */
    private array $handled = [];

    public function __construct(
        private readonly Config $config,
        private readonly PathResolver $pathResolver,
        private readonly ConversionService $conversionService,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger,
        private readonly Variants $variants
    ) {
    }

    /**
     * Companion paths of the enabled formats that do not exist for the
     * given source. Empty when the module is off, the path is not a
     * convertible media image, the source itself is missing or every
     * enabled companion is in place.
     *
     * @return string[]
     */
    public function getMissingCompanions(string $sourcePath): array
    {
        if (!$this->config->isEnabled() || !$this->pathResolver->isConvertibleSource($sourcePath)) {
            return [];
        }
        if (!is_file($sourcePath)) {
            return [];
        }

        $missing = [];
        if ($this->config->isWebpEnabled() && !is_file($sourcePath . '.webp')) {
            $missing[] = $sourcePath . '.webp';
        }
        if ($this->config->isAvifEnabled() && !is_file($sourcePath . '.avif')) {
            $missing[] = $sourcePath . '.avif';
        }
        foreach ($this->variants->pathsFor($sourcePath) as $variant) {
            if (!is_file($variant)) {
                $missing[] = $variant;
            }
        }

        return $missing;
    }

    /**
     * Dispatch the conversion when at least one enabled companion is
     * missing. Returns true when a conversion was dispatched.
     */
    public function scheduleIfMissing(string $sourcePath): bool
    {
        if ($this->getMissingCompanions($sourcePath) === []) {
            return false;
        }
        $this->conversionService->dispatch($sourcePath);
        $this->handled[$sourcePath] = true;

        return true;
    }

    /**
     * `scheduleIfMissing()` at most once per process and once per
     * `CACHE_LIFETIME` across processes. Returns true when a conversion
     * was dispatched by this call.
     */
    public function scheduleOnceIfMissing(string $sourcePath): bool
    {
        if (isset($this->handled[$sourcePath])) {
            return false;
        }
        if ($this->getMissingCompanions($sourcePath) === []) {
            return false;
        }

        $cacheKey = self::CACHE_KEY_PREFIX . hash('sha256', $sourcePath);
        try {
            // The interface documents a string; a miss is false at runtime, so both read as ''.
            if ((string) $this->cache->load($cacheKey) !== '') {
                $this->handled[$sourcePath] = true;
                return false;
            }
            $this->conversionService->dispatch($sourcePath);
            $this->handled[$sourcePath] = true;
            $this->cache->save('1', $cacheKey, [self::CACHE_TAG], self::CACHE_LIFETIME);
        } catch (Throwable $e) {
            // A render must never fail because a companion could not be scheduled.
            $this->logger->warning(
                'HyperionImage: fallback scheduling failed for ' . $sourcePath . ': ' . $e->getMessage()
            );
            return false;
        }

        return true;
    }
}

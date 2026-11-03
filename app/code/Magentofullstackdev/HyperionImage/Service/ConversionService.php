<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Service;

use Magentofullstackdev\HyperionImage\Model\Config;
use Magentofullstackdev\HyperionImage\Model\Converter;
use Magentofullstackdev\HyperionImage\Queue\Publisher;

/**
 * High-level facade over the encoder pipeline. Used from four
 * call sites:
 *   - `ScheduleConversionPlugin` (after Magento writes a cached image)
 *   - `ScheduleCompanionsPlugin` (after core's ImageResize service ran)
 *   - `CompanionScheduler` (storefront fallback for a missing companion)
 *   - `Console\Command\ConvertCommand` (CLI batch)
 *
 * Each delegates to the same operations so policy changes (e.g.
 * swapping the queue for a thread pool) live in one place.
 */
class ConversionService
{
    public function __construct(
        private readonly Converter $converter,
        private readonly Publisher $publisher,
        private readonly ConversionRequestFactory $requestFactory,
        private readonly Config $config
    ) {
    }

    /**
     * Encode every enabled companion format inline. Blocks the
     * caller until done. Returns the per-format success map (see
     * `Converter::convert`).
     *
     * @return array<string, bool>
     */
    public function convertSync(string $sourcePath): array
    {
        return $this->converter->convert($sourcePath);
    }

    /**
     * Hand the conversion off to the queue. Returns immediately --
     * any failure during publish is logged by `Publisher`.
     */
    public function scheduleAsync(string $sourcePath): void
    {
        $request = $this->requestFactory->create($sourcePath);
        $this->publisher->publish($request);
    }

    /**
     * Convert according to the admin `conversion_mode`:
     *   - `queue` (default): publish; the cron-started consumer encodes.
     *   - `sync`: encode in-process (environments without cron).
     *
     * Every automatic trigger (the two plugins and the storefront
     * fallback) goes through here so the mode is honoured in one place.
     */
    public function dispatch(string $sourcePath): void
    {
        if ($this->config->getConversionMode() === Config::MODE_SYNC) {
            $this->convertSync($sourcePath);
            return;
        }
        $this->scheduleAsync($sourcePath);
    }
}

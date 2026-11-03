<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Queue;

use Magento\Framework\MessageQueue\PublisherInterface;
use Magentofullstackdev\HyperionImage\Api\Data\ConversionRequestInterface;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Thin wrapper around Magento's `PublisherInterface` that ships
 * `ConversionRequest` messages to the `hyperion.image.convert`
 * topic.
 *
 * Why a wrapper rather than calling `PublisherInterface` directly:
 *   - Centralises the topic name; renaming is one-file.
 *   - Catches publish failures (dead exchange, full DB queue) and
 *     logs without bubbling -- the catalog cache write succeeded,
 *     image generation just won't fire this round (the lazy
 *     fallback controller covers first render either way).
 */
class Publisher
{
    public const TOPIC = 'hyperion.image.convert';

    public function __construct(
        private readonly PublisherInterface $publisher,
        private readonly LoggerInterface $logger
    ) {
    }

    public function publish(ConversionRequestInterface $request): void
    {
        try {
            $this->publisher->publish(self::TOPIC, $request);
        } catch (Throwable $e) {
            $this->logger->warning(
                'HyperionImage: queue publish failed for ' . $request->getSourcePath()
                . ' -- ' . $e->getMessage()
            );
        }
    }
}

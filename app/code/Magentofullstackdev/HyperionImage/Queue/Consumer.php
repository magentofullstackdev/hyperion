<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Queue;

use Magentofullstackdev\HyperionImage\Api\Data\ConversionRequestInterface;
use Magentofullstackdev\HyperionImage\Cache\BatchInvalidator;
use Magentofullstackdev\HyperionImage\Model\Converter;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Async handler for `hyperion.image.convert` messages.
 *
 * Failure policy: never re-throw. The Converter logs encoder
 * exceptions internally; Consumer catches anything else (broken
 * source file, exhausted disk, OOM mid-encode) and writes a
 * single error log line. Re-throwing would push the message back
 * into the queue and a single corrupt source could storm the
 * worker indefinitely.
 *
 * Idempotency: `Converter::convert()` is itself idempotent --
 * already-existing companion files short-circuit. So if a message
 * is delivered twice, the second pass is a near-no-op (one stat
 * call per format).
 *
 * Cache invalidation: every converted file is recorded on the
 * `BatchInvalidator`; a shutdown hook invalidates the cache tags of
 * the products behind those files once, when the consumer process
 * exits. Nothing else is flushed.
 */
class Consumer
{
    private bool $shutdownRegistered = false;

    public function __construct(
        private readonly Converter $converter,
        private readonly BatchInvalidator $batchInvalidator,
        private readonly LoggerInterface $logger
    ) {
    }

    public function process(ConversionRequestInterface $request): void
    {
        // Register the shutdown flush once per consumer process --
        // not per message. If we registered in the constructor it'd
        // fire even when no messages were actually consumed (the
        // process can exit cleanly without `process()` ever being
        // called); registering on the first dispatch makes
        // "no work -> no flush" a natural property.
        if (!$this->shutdownRegistered) {
            $this->shutdownRegistered = true;
            register_shutdown_function([$this, 'flushBatchCacheOnShutdown']);
        }

        try {
            $results = $this->converter->convert($request->getSourcePath());
            if (in_array(true, $results, true)) {
                $this->batchInvalidator->recordConversion($request->getSourcePath());
            }
        } catch (Throwable $e) {
            $this->logger->error(
                'HyperionImage queue consumer failure: ' . $e->getMessage(),
                ['exception' => $e]
            );
            // Intentionally not rethrown -- see class doc.
        }
    }

    /**
     * Shutdown handler registered on the first message of the
     * consumer process. Public so PHP can invoke it as a callable;
     * not part of the consumer contract -- don't call from app code.
     */
    public function flushBatchCacheOnShutdown(): void
    {
        try {
            $this->batchInvalidator->flushIfDirty();
        } catch (Throwable $e) {
            // Shutdown handlers must never propagate -- log and exit.
            $this->logger->warning(
                'HyperionImage shutdown invalidator failure: ' . $e->getMessage()
            );
        }
    }
}

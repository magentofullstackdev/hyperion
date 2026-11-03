<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Model;

use Magentofullstackdev\HyperionImage\Exception\EncoderException;
use Magentofullstackdev\HyperionImage\Model\Encoder\EncoderFactory;
use Magentofullstackdev\HyperionImage\Model\Format\AvifFormat;
use Magentofullstackdev\HyperionImage\Model\Format\FormatInterface;
use Magentofullstackdev\HyperionImage\Model\Format\WebpFormat;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * High-level orchestrator for converting one source image to all
 * enabled companion formats (WebP, AVIF). Idempotent -- re-running
 * for an already-converted source is a no-op.
 *
 * Concurrency: each per-format encode acquires a non-blocking
 * `flock` on `<target>.lock` so two parallel queue consumers can't
 * stomp on the same file. The losing process exits cleanly without
 * an error -- the winner produces the file and any later request
 * sees it through the idempotency check.
 *
 * The plan defines this class to take per-format flags from
 * `Model\Config`. We honor `skip_if_larger`: if the encoded result
 * is bigger than the source, the file is removed so the storefront
 * keeps serving the smaller original.
 */
class Converter
{
    public function __construct(
        private readonly Config $config,
        private readonly PathResolver $pathResolver,
        private readonly EncoderFactory $encoderFactory,
        private readonly WebpFormat $webpFormat,
        private readonly AvifFormat $avifFormat,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Convert source image to all enabled companion formats.
     *
     * `true` means a NEW companion was encoded during this call.
     * `false` covers three skipped cases -- already existed
     * (idempotency hit), encoded result was bigger than source so
     * we discarded it, or the encoder failed. Callers that count
     * "actually new conversions" -- e.g. the CLI batch deciding
     * which products to invalidate -- read this map and skip the
     * no-op cases.
     *
     * @return array<string, bool> map of format slug -> newly-encoded?
     */
    public function convert(string $sourcePath): array
    {
        $results = [];

        if (!$this->config->isEnabled()) {
            return $results;
        }
        if (!$this->pathResolver->isConvertibleSource($sourcePath)) {
            return $results;
        }
        if (!file_exists($sourcePath)) {
            $this->logger->warning('HyperionImage: source missing for conversion: ' . $sourcePath);
            return $results;
        }

        $sourceSize = (int) filesize($sourcePath);
        if ($sourceSize <= 0) {
            return $results;
        }

        if ($this->config->isWebpEnabled()) {
            $results['webp'] = $this->convertSingle(
                $sourcePath,
                $this->webpFormat,
                $this->config->getWebpQuality(),
                $sourceSize,
                $this->config->shouldSkipWebpIfLarger()
            );
        }

        if ($this->config->isAvifEnabled()) {
            $results['avif'] = $this->convertSingle(
                $sourcePath,
                $this->avifFormat,
                $this->config->getAvifQuality(),
                $sourceSize,
                $this->config->shouldSkipAvifIfLarger()
            );
        }

        return $results;
    }

    private function convertSingle(
        string $sourcePath,
        FormatInterface $format,
        int $quality,
        int $sourceSize,
        bool $skipIfLarger
    ): bool {
        $targetPath = $this->pathResolver->resolve($sourcePath, $format);

        // Idempotency: a previous run already produced the target --
        // return false so the caller's "newly converted" tally
        // doesn't overcount cache-warm runs.
        if (file_exists($targetPath)) {
            return false;
        }

        $lockPath = $targetPath . '.lock';
        $lockHandle = $this->openLock($lockPath);
        if ($lockHandle === null) {
            $this->logger->warning('HyperionImage: cannot open lock: ' . $lockPath);
            return false;
        }

        if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
            // Another process is converting the same file -- back off cleanly.
            fclose($lockHandle);
            return false;
        }

        // Re-check after acquiring the lock -- a sibling worker may have
        // finished while we were waiting. Treat as "skipped, not newly
        // encoded" so dirty-state tracking stays accurate.
        if (file_exists($targetPath)) {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
            $this->safeUnlink($lockPath);
            return false;
        }

        try {
            $encoder = $this->encoderFactory->get($format);
            $encoder->encode($sourcePath, $targetPath, $format, $quality);

            if ($skipIfLarger && filesize($targetPath) >= $sourceSize) {
                $this->safeUnlink($targetPath);
                return false;
            }

            return true;
        } catch (EncoderException $e) {
            $this->logger->warning(
                'HyperionImage: ' . $format->getName() . ' conversion failed for '
                . $sourcePath . ': ' . $e->getMessage()
            );
            return false;
        } catch (Throwable $e) {
            $this->logger->error(
                'HyperionImage: unexpected error converting ' . $sourcePath . ': ' . $e->getMessage()
            );
            return false;
        } finally {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
            $this->safeUnlink($lockPath);
        }
    }

    /**
     * @return resource|null
     */
    private function openLock(string $path)
    {
        $previousHandler = set_error_handler(static fn (): bool => true);
        try {
            $handle = fopen($path, 'c');
        } finally {
            restore_error_handler();
        }
        return is_resource($handle) ? $handle : null;
    }

    private function safeUnlink(string $path): void
    {
        if (!file_exists($path)) {
            return;
        }
        $previousHandler = set_error_handler(static fn (): bool => true);
        try {
            unlink($path);
        } finally {
            restore_error_handler();
        }
    }
}

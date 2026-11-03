<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionImage\Console\Command;

use FilesystemIterator;
use Magento\Framework\App\Area;
use Magento\Framework\App\State;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magentofullstackdev\HyperionImage\Cache\BatchInvalidator;
use Magentofullstackdev\HyperionImage\Model\PathResolver;
use Magentofullstackdev\HyperionImage\Service\ConversionService;
use Psr\Log\LoggerInterface;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Helper\ProgressBar;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Throwable;

/**
 * `bin/magento hyperion:image:convert` -- bulk-convert every image
 * already in `pub/media/catalog/product/cache/`. Use cases:
 *
 *   - Initial install on an existing catalog: the plugin only fires
 *     when Magento writes a *new* cache entry, so without this
 *     command pre-existing images would only convert as users
 *     happen to load them.
 *   - Disaster recovery: companion files were deleted; re-create
 *     them in one pass.
 *   - Quality-knob tuning: re-encode at a new quality with `--force`.
 *
 * Flags:
 *   - `--force` deletes existing companions first so the encoder
 *     re-runs even on cached idempotency hits.
 *   - `--dry-run` reports the candidate count and exits.
 */
class ConvertCommand extends Command
{
    private const NAME = 'hyperion:image:convert';

    /**
     * Default scan roots, relative to `pub/media/`. Covers the three
     * places a typical Magento storefront sources public-facing
     * images from: catalog product image cache, category banners,
     * and the WYSIWYG library used by CMS blocks / pages / widgets.
     */
    private const DEFAULT_PATHS = [
        'catalog/product/cache',
        'catalog/category',
        'wysiwyg',
    ];

    public function __construct(
        private readonly State $appState,
        private readonly DirectoryList $directoryList,
        private readonly ConversionService $service,
        private readonly PathResolver $pathResolver,
        private readonly BatchInvalidator $batchInvalidator,
        private readonly LoggerInterface $logger,
        ?string $name = null
    ) {
        parent::__construct($name);
    }

    protected function configure(): void
    {
        $this->setName(self::NAME)
            ->setDescription('Generate WebP/AVIF for existing media images')
            ->addOption(
                'force',
                'f',
                InputOption::VALUE_NONE,
                'Re-convert even if companion files exist (deletes existing first)'
            )
            ->addOption(
                'dry-run',
                null,
                InputOption::VALUE_NONE,
                'Report what would be converted, do not actually convert'
            )
            ->addOption(
                'paths',
                'p',
                InputOption::VALUE_REQUIRED,
                'Comma-separated media-relative roots to scan (overrides defaults: ' . implode(',', self::DEFAULT_PATHS) . ')'
            );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        try {
            $this->appState->setAreaCode(Area::AREA_GLOBAL);
        } catch (Throwable $e) {
            // Area code may already be set by the CLI bootstrap; benign.
            $this->logger->warning('ConvertCommand::execute could not set the area code', ['exception' => $e]);
        }

        $mediaRoot = $this->directoryList->getPath(DirectoryList::MEDIA);
        $pathsOption = (string) $input->getOption('paths');
        $relativeRoots = $pathsOption !== ''
            ? array_filter(array_map('trim', explode(',', $pathsOption)))
            : self::DEFAULT_PATHS;

        $candidates = [];
        foreach ($relativeRoots as $rel) {
            $absolute = $mediaRoot . '/' . ltrim($rel, '/');
            if (!is_dir($absolute)) {
                $output->writeln('<comment>Skipping (missing): ' . $absolute . '</comment>');
                continue;
            }
            $output->writeln('<info>Scanning ' . $absolute . '...</info>');
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($absolute, FilesystemIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                $path = $file->getPathname();
                if ($this->pathResolver->isConvertibleSource($path)) {
                    $candidates[] = $path;
                }
            }
        }

        $total = count($candidates);
        $output->writeln('<info>Found ' . $total . ' source images.</info>');
        if ($total === 0) {
            return Command::SUCCESS;
        }

        if ($input->getOption('dry-run')) {
            $output->writeln('<comment>Dry run, exiting.</comment>');
            return Command::SUCCESS;
        }

        $force = (bool) $input->getOption('force');
        $progress = new ProgressBar($output, $total);
        $progress->start();

        $converted = 0;
        $skipped = 0;
        $stale = 0;
        $failed = 0;

        foreach ($candidates as $path) {
            try {
                if ($force) {
                    // --force: blow away every companion so the Converter
                    // re-encodes from scratch.
                    foreach ($this->pathResolver->getCompanionPaths($path) as $companion) {
                        $this->safeUnlink($companion);
                    }
                } elseif ($this->deleteStaleCompanions($path)) {
                    // Detected mtime staleness -- companion older than the
                    // source JPG. Removed; Converter will regenerate.
                    $stale++;
                }
                $results = $this->service->convertSync($path);
                if (in_array(true, $results, true)) {
                    $converted++;
                    $this->batchInvalidator->recordConversion($path);
                } else {
                    $skipped++;
                }
            } catch (Throwable $e) {
                $failed++;
                $this->logger->error(
                    'ConvertCommand::execute conversion failed for ' . $path,
                    ['exception' => $e]
                );
                $output->writeln('');
                $output->writeln('<error>Failed: ' . $path . ' -- ' . $e->getMessage() . '</error>');
            }
            $progress->advance();
        }

        $progress->finish();
        $output->writeln('');
        $output->writeln(
            sprintf(
                '<info>Converted: %d, skipped: %d, stale-replaced: %d, failed: %d</info>',
                $converted,
                $skipped,
                $stale,
                $failed
            )
        );

        // Cached pages of the affected products re-render with the new
        // <source> tags; files that belong to no product invalidate nothing.
        $invalidated = $this->batchInvalidator->flushIfDirty();
        if ($invalidated > 0) {
            $output->writeln(sprintf('<info>Invalidated the cache of %d product(s).</info>', $invalidated));
        }

        return $failed === 0 ? Command::SUCCESS : Command::FAILURE;
    }

    /**
     * Delete every companion whose mtime is strictly older than the
     * source JPG's mtime -- those companions were generated before the
     * current bytestream of the source and are stale.
     *
     * Returns true if at least one stale companion was removed; the
     * caller uses that to surface a per-source "stale" count.
     */
    private function deleteStaleCompanions(string $sourcePath): bool
    {
        $sourceMtime = $this->safeMtime($sourcePath);
        if ($sourceMtime === null) {
            return false;
        }
        $removed = false;
        foreach ($this->pathResolver->getCompanionPaths($sourcePath) as $companion) {
            if (!file_exists($companion)) {
                continue;
            }
            $companionMtime = $this->safeMtime($companion);
            if ($companionMtime !== null && $companionMtime < $sourceMtime) {
                $this->safeUnlink($companion);
                $removed = true;
            }
        }
        return $removed;
    }

    private function safeMtime(string $path): ?int
    {
        $previousHandler = set_error_handler(static fn (): bool => true);
        try {
            $value = filemtime($path);
        } finally {
            restore_error_handler();
        }
        return is_int($value) ? $value : null;
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

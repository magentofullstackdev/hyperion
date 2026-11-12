<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Model;

use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Module\Dir\Reader as ModuleDirReader;
use Psr\Log\LoggerInterface;

/**
 * Replaces the Luma sample data stylesheet (pub/media/styles.css, linked by
 * the sample data through design/head/includes) with the module's own
 * fixture. Luma's file lays the sample CMS content out with floats and
 * fixed widths that fight the Hyperion theme, which styles that content
 * itself.
 *
 * Only the sample data file is replaced: it is recognized by its selectors
 * (SIGNATURES), so a stylesheet a merchant keeps under the same name is left
 * alone. The original is copied to `styles.css.luma.bak` next to it before
 * the first write. Idempotent: the fixture carries a marker, and a store
 * without the Luma file (no sample data) is not touched.
 */
class LumaStylesheetReplacer
{
    public const MEDIA_FILE = 'styles.css';
    public const BACKUP_FILE = 'styles.css.luma.bak';
    public const MARKER = 'Hyperion: replaces the Luma sample data stylesheet';

    /**
     * Selectors of the two sample data fixtures that end up in the media
     * file (Magento_CmsSampleData and Magento_ThemeSampleData
     * fixtures/styles.css, two from each): the file is the sample one when
     * it carries at least REQUIRED_SIGNATURES of them.
     */
    private const SIGNATURES = [
        '.block-promo-wrapper .block-promo',
        '.privacy-policy .block-collapsible-nav',
        '.contact-info-number',
        '._rwd_width_float',
    ];
    private const REQUIRED_SIGNATURES = 2;
    private const MODULE = 'Magentofullstackdev_HyperionSampleData';

    public function __construct(
        private readonly Filesystem $filesystem,
        private readonly ModuleDirReader $moduleDirReader,
        private readonly FileDriver $fileDriver,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return bool true when the file was written
     */
    public function replace(): bool
    {
        $media = $this->filesystem->getDirectoryWrite(DirectoryList::MEDIA);
        if (!$media->isFile(self::MEDIA_FILE)) {
            return false;
        }
        $current = (string) $media->readFile(self::MEDIA_FILE);
        if (str_contains($current, self::MARKER)) {
            return false;
        }
        if (!$this->isLumaSampleStylesheet($current)) {
            $this->logger->info(
                'HyperionSampleData: pub/media/styles.css is not the Luma sample data stylesheet, left as it is.'
            );
            return false;
        }
        if (!$media->isFile(self::BACKUP_FILE)) {
            $media->copyFile(self::MEDIA_FILE, self::BACKUP_FILE);
        }
        $source = $this->moduleDirReader->getModuleDir('', self::MODULE) . '/fixtures/' . self::MEDIA_FILE;
        $media->writeFile(self::MEDIA_FILE, $this->fileDriver->fileGetContents($source));
        return true;
    }

    private function isLumaSampleStylesheet(string $css): bool
    {
        $found = 0;
        foreach (self::SIGNATURES as $signature) {
            if (str_contains($css, $signature)) {
                $found++;
            }
        }

        return $found >= self::REQUIRED_SIGNATURES;
    }
}

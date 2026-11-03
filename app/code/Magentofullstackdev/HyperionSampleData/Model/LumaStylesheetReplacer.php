<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Model;

use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Module\Dir\Reader as ModuleDirReader;

/**
 * Replaces the Luma sample data stylesheet (pub/media/styles.css, linked by
 * the sample data through design/head/includes) with the module's own
 * fixture. Luma's file lays the sample CMS content out with floats and
 * fixed widths that fight the Hyperion theme, which styles that content
 * itself. Idempotent: the fixture carries a marker, and a store without the
 * Luma file (no sample data) is left alone.
 */
class LumaStylesheetReplacer
{
    public const MEDIA_FILE = 'styles.css';
    public const MARKER = 'Hyperion: replaces the Luma sample data stylesheet';
    private const MODULE = 'Magentofullstackdev_HyperionSampleData';

    public function __construct(
        private readonly Filesystem $filesystem,
        private readonly ModuleDirReader $moduleDirReader,
        private readonly FileDriver $fileDriver
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
        if (str_contains($media->readFile(self::MEDIA_FILE), self::MARKER)) {
            return false;
        }
        $source = $this->moduleDirReader->getModuleDir('', self::MODULE) . '/fixtures/' . self::MEDIA_FILE;
        $media->writeFile(self::MEDIA_FILE, $this->fileDriver->fileGetContents($source));
        return true;
    }
}

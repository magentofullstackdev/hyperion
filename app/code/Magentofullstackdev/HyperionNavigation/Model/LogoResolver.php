<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Filesystem;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Framework\View\DesignInterface;
use Magento\MediaStorage\Helper\File\Storage\Database as DbFileStorageHelper;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Shared logo-resolution service for the Hyperion header and footer.
 *
 * Mirrors \Magento\Theme\Block\Html\Header\Logo::_getLogoUrl() in spirit but
 * narrows step 2 to the CURRENT theme's own `web/images/logo.svg` -- we do
 * not want the Magento/blank and Magento/luma default logos to leak through
 * the fallback chain and masquerade as the Hyperion brand.
 *
 * Resolution order:
 *   1. Admin-uploaded logo (design/header/logo_src) -- when present AND the
 *      file exists on the media filesystem, returns its media URL.
 *   2. Theme asset `images/logo.svg` located inside the current theme's own
 *      `web/` directory (no fallback to parent/vendor themes) -- returns its
 *      static URL via the asset repository.
 *   3. Empty string -- caller is expected to fall back to the HYPERION
 *      wordmark.
 */
class LogoResolver
{
    /**
     * @param StoreManagerInterface $storeManager
     * @param ScopeConfigInterface $scopeConfig
     * @param AssetRepository $assetRepo
     * @param DesignInterface $design
     * @param Filesystem $filesystem
     * @param DbFileStorageHelper $fileStorageHelper
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly StoreManagerInterface $storeManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly AssetRepository $assetRepo,
        private readonly DesignInterface $design,
        private readonly Filesystem $filesystem,
        private readonly DbFileStorageHelper $fileStorageHelper,
        private readonly LoggerInterface $logger,
        private readonly ComponentRegistrarInterface $componentRegistrar,
        private readonly FileDriver $fileDriver,
    ) {
    }

    /**
     * Admin-uploaded logo filename (Stores > Configuration > General > Design
     * > Header > Logo Image). Stored at `design/header/logo_src`.
     *
     * @return string
     */
    public function getLogoFile(): string
    {
        try {
            return (string) $this->scopeConfig->getValue(
                'design/header/logo_src',
                ScopeInterface::SCOPE_STORE
            );
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LogoResolver: failed to get logo file: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * Admin-configured alt text (design/header/logo_alt), with store-name fallback.
     *
     * @return string
     */
    public function getLogoAlt(): string
    {
        try {
            $alt = (string) $this->scopeConfig->getValue(
                'design/header/logo_alt',
                ScopeInterface::SCOPE_STORE
            );

            return $alt !== '' ? $alt : $this->getStoreName();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LogoResolver: failed to get logo alt: ' . $e->getMessage());
            return $this->getStoreName();
        }
    }

    /**
     * @return string
     */
    public function getLogoUrl(): string
    {
        try {
            $logoFile = $this->getLogoFile();
            if ($logoFile !== '') {
                $mediaPath = 'logo/' . $logoFile;
                $store = $this->storeManager->getStore();
                if ($store instanceof Store && $this->isMediaFile($mediaPath)) {
                    return (string) $store->getBaseUrl(UrlInterface::URL_TYPE_MEDIA) . $mediaPath;
                }
            }

            if ($this->hasThemeLogoSvg()) {
                return (string) $this->assetRepo
                    ->createAsset('images/logo.svg')
                    ->getUrl();
            }

            return '';
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LogoResolver: failed to get logo URL: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * Whether the given media-relative path resolves to an existing file.
     *
     * Mirrors core \Magento\Theme\Block\Html\Header\Logo::_isFile() so the
     * DB file-storage feature transparently restores the file to local disk.
     *
     * @param string $relativePath
     * @return bool
     */
    private function isMediaFile(string $relativePath): bool
    {
        try {
            $mediaDir = $this->filesystem->getDirectoryRead(DirectoryList::MEDIA);
            if ($this->fileStorageHelper->checkDbUsage() && !$mediaDir->isFile($relativePath)) {
                $this->fileStorageHelper->saveFileToFilesystem($relativePath);
            }
            return $mediaDir->isFile($relativePath);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LogoResolver: failed to check media file: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Whether the current design theme ships its own `web/images/logo.svg`.
     *
     * We check the theme directory directly -- NOT the fallback chain -- so
     * the Magento/blank and Magento/luma default logos do not qualify as
     * the Hyperion logo.
     *
     * @return bool
     */
    private function hasThemeLogoSvg(): bool
    {
        try {
            $theme = $this->design->getDesignTheme();
            $themeFullPath = (string) $theme->getFullPath();
            if ($themeFullPath === '') {
                return false;
            }

            $themePath = $this->componentRegistrar->getPath(
                ComponentRegistrar::THEME,
                $themeFullPath
            );
            if ($themePath === null) {
                return false;
            }
            return $this->fileDriver->isExists($themePath . '/web/images/logo.svg');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LogoResolver: failed to check theme logo asset: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * @return string
     */
    private function getStoreName(): string
    {
        try {
            return (string) $this->storeManager->getStore()->getName();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion LogoResolver: failed to get store name: ' . $e->getMessage());
            return '';
        }
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Model;

use Magento\Framework\App\Area;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Config\Storage\WriterInterface;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\View\Design\Theme\ThemeProviderInterface;
use Magento\Framework\View\DesignInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Removes the `<link>` to `{{MEDIA_URL}}styles.css` that the Luma sample
 * data writes into `design/head/includes`: the theme styles the sample
 * content itself (and `LumaStylesheetReplacer` has emptied the file), so
 * the link is one render blocking request for nothing. Other includes the
 * merchant added stay. Idempotent.
 *
 * Only the store views that run Hyperion (or a child theme of it) lose the
 * link. A row is rewritten in place when every store view it covers runs
 * Hyperion: a store view row for its own store view, a website row for the
 * store views of the website, the default row for all of them. A row shared
 * with a store view on another theme is left as it is, and the cleaned
 * value is written at the scope of each Hyperion store view that inherits
 * from it. A store view whose theme cannot be resolved counts as not
 * Hyperion.
 */
class LumaStylesheetLinkRemover
{
    public const PATH = 'design/head/includes';
    private const LINK_PATTERN = '/<link\b[^>]*\{\{MEDIA_URL\}\}styles\.css[^>]*>\s*/i';

    public function __construct(
        private readonly ResourceConnection $resource,
        private readonly WriterInterface $configWriter,
        private readonly StoreManagerInterface $storeManager,
        private readonly DesignInterface $design,
        private readonly ThemeProviderInterface $themeProvider,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return int the number of configuration rows written
     */
    public function remove(): int
    {
        $rows = $this->configRows();
        if (array_filter($rows, static fn (array $row): bool => $row['has_link']) === []) {
            return 0;
        }
        // Website id by store view id, and whether the store view runs Hyperion.
        $websiteOf = [];
        $isHyperion = [];
        foreach ($this->storeManager->getStores() as $store) {
            $storeId = (int) $store->getId();
            $websiteOf[$storeId] = (int) $store->getWebsiteId();
            $isHyperion[$storeId] = $this->runsHyperion($storeId);
        }

        $written = 0;
        $shared = [];
        foreach ($rows as $key => $row) {
            if (!$row['has_link']) {
                continue;
            }
            $covered = match ($row['scope']) {
                ScopeConfigInterface::SCOPE_TYPE_DEFAULT => array_keys($websiteOf),
                ScopeInterface::SCOPE_WEBSITES => array_keys($websiteOf, $row['scope_id'], true),
                ScopeInterface::SCOPE_STORES => isset($websiteOf[$row['scope_id']]) ? [$row['scope_id']] : [],
                default => [],
            };
            $hyperion = array_filter($covered, static fn (int $storeId): bool => $isHyperion[$storeId]);
            if ($covered !== [] && count($hyperion) === count($covered)) {
                $this->configWriter->save(self::PATH, $row['cleaned'], $row['scope'], $row['scope_id']);
                $written++;
                continue;
            }
            $shared[$key] = true;
            $this->logger->info(sprintf(
                'HyperionSampleData: %s (%s %d) keeps the Luma styles.css link, the scope is not Hyperion only.',
                self::PATH,
                $row['scope'],
                $row['scope_id']
            ));
        }

        foreach ($websiteOf as $storeId => $websiteId) {
            if (!$isHyperion[$storeId] || isset($rows[ScopeInterface::SCOPE_STORES . ':' . $storeId])) {
                continue;
            }
            // The row the store view inherits its value from: its website's, else the default one.
            $websiteKey = ScopeInterface::SCOPE_WEBSITES . ':' . $websiteId;
            $inherited = isset($rows[$websiteKey]) ? $websiteKey : ScopeConfigInterface::SCOPE_TYPE_DEFAULT . ':0';
            if (isset($shared[$inherited])) {
                $this->configWriter->save(self::PATH, $rows[$inherited]['cleaned'], ScopeInterface::SCOPE_STORES, $storeId);
                $written++;
            }
        }

        return $written;
    }

    /**
     * Every configuration row of the path, keyed by "scope:id", with the value the row has without the link.
     *
     * @return array<string, array{scope: string, scope_id: int, cleaned: string, has_link: bool}>
     */
    private function configRows(): array
    {
        $connection = $this->resource->getConnection();
        $select = $connection->select()
            ->from($this->resource->getTableName('core_config_data'), ['scope', 'scope_id', 'value'])
            ->where('path = ?', self::PATH);
        $rows = [];
        foreach ($connection->fetchAll($select) as $row) {
            $scope = (string) $row['scope'];
            $scopeId = (int) $row['scope_id'];
            $value = (string) ($row['value'] ?? '');
            $cleaned = trim((string) preg_replace(self::LINK_PATTERN, '', $value));
            $rows[$scope . ':' . $scopeId] = [
                'scope' => $scope,
                'scope_id' => $scopeId,
                'cleaned' => $cleaned,
                'has_link' => $cleaned !== trim($value),
            ];
        }

        return $rows;
    }

    /**
     * Whether the store view's theme is Hyperion or inherits from it.
     */
    private function runsHyperion(int $storeId): bool
    {
        try {
            $configured = (string) $this->design->getConfigurationDesignTheme(Area::AREA_FRONTEND, ['store' => $storeId]);
            if ($configured === '') {
                return false;
            }
            $theme = is_numeric($configured)
                ? $this->themeProvider->getThemeById((int) $configured)
                : $this->themeProvider->getThemeByFullPath(Area::AREA_FRONTEND . '/' . $configured);
            // A theme chain is a handful of levels; the bound guards against a corrupt parent loop.
            for ($depth = 0; $theme !== null && $depth < 10; $depth++) {
                if ((string) $theme->getThemePath() === WidgetThemeRebinder::TARGET_THEME_PATH) {
                    return true;
                }
                $theme = $theme->getParentTheme();
            }
        } catch (\Throwable $e) {
            $this->logger->warning(sprintf(
                'HyperionSampleData: theme of store view %d not resolved (%s), its %s is left as it is.',
                $storeId,
                $e->getMessage(),
                self::PATH
            ));
        }

        return false;
    }
}

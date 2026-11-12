<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Model;

use Magento\Framework\App\Area;
use Magento\Framework\DB\Adapter\AdapterInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\Setup\ModuleDataSetupInterface;
use Psr\Log\LoggerInterface;

/**
 * Moves the widget instances of the Luma sample data (and the layout links
 * generated from them) from the Magento/luma theme to the
 * Magentofullstackdev/hyperion theme.
 *
 * Widget instances are theme-scoped: the Luma sample data creates them for
 * Magento/luma only, so the home page promo grid, the category banners and
 * the login / contact blocks are invisible on a Hyperion storefront.
 *
 * Only the sample rows move: the CMS static block widgets whose title is
 * one of SAMPLE_WIDGET_TITLES, and the layout links of exactly those
 * instances. Any other widget bound to Luma, and the custom layout updates
 * of categories, products and CMS pages, stay on Luma (a store may serve
 * Luma and Hyperion side by side).
 *
 * The operation is idempotent (it only touches rows still bound to Luma)
 * and defensive: without the widget sample data module, when either theme
 * is not registered yet, or when a table is missing, it logs and returns
 * without changing anything.
 */
class WidgetThemeRebinder
{
    public const SOURCE_THEME_PATH = 'Magento/luma';
    public const TARGET_THEME_PATH = 'Magentofullstackdev/hyperion';
    public const SAMPLE_DATA_MODULE = 'Magento_WidgetSampleData';

    /**
     * The `title` column of the widget sample data fixture
     * (module-widget-sample-data/fixtures/cmsblock.csv). Kept here because
     * the sample data packages may be removed once the data is installed.
     */
    public const SAMPLE_WIDGET_TITLES = [
        'Contact us info',
        'Footer Links',
        'Sale Left Menu',
        'Gear Left Menu',
        "Men's Left Menu",
        "Women's Left Menu",
        "What's New Left Menu",
        'Women Category Content',
        'Training Category Content',
        'Men Category Content',
        'Gear Category Content',
        'New Products Category Content',
        'Sale Category Content',
        'Home Page',
        'Performance Fabrics',
        'Eco Friendly',
        'Login Info',
    ];

    /** The widget type of every row of the fixture (`cms_static_block`). */
    private const SAMPLE_WIDGET_TYPE = \Magento\Cms\Block\Widget\Block::class;

    private const TABLE_THEME = 'theme';
    private const TABLE_WIDGET_INSTANCE = 'widget_instance';
    private const TABLE_WIDGET_INSTANCE_PAGE = 'widget_instance_page';
    private const TABLE_WIDGET_INSTANCE_PAGE_LAYOUT = 'widget_instance_page_layout';
    private const TABLE_LAYOUT_LINK = 'layout_link';

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly ModuleManager $moduleManager
    ) {
    }

    /**
     * @return array{widget_instance: int, layout_link: int} rows updated per table
     */
    public function rebind(ModuleDataSetupInterface $setup): array
    {
        $result = [self::TABLE_WIDGET_INSTANCE => 0, self::TABLE_LAYOUT_LINK => 0];
        if (!$this->moduleManager->isEnabled(self::SAMPLE_DATA_MODULE)) {
            return $result;
        }
        $connection = $setup->getConnection();

        $tables = [
            self::TABLE_THEME,
            self::TABLE_WIDGET_INSTANCE,
            self::TABLE_WIDGET_INSTANCE_PAGE,
            self::TABLE_WIDGET_INSTANCE_PAGE_LAYOUT,
            self::TABLE_LAYOUT_LINK,
        ];
        foreach ($tables as $table) {
            if (!$connection->isTableExists($setup->getTable($table))) {
                $this->logger->info(sprintf('HyperionSampleData: table "%s" not found, nothing to rebind.', $table));
                return $result;
            }
        }

        $sourceThemeId = $this->resolveThemeId($setup, $connection, self::SOURCE_THEME_PATH);
        $targetThemeId = $this->resolveThemeId($setup, $connection, self::TARGET_THEME_PATH);

        if ($sourceThemeId === null || $targetThemeId === null) {
            $this->logger->info(sprintf(
                'HyperionSampleData: theme lookup incomplete (%s => %s, %s => %s), nothing to rebind.',
                self::SOURCE_THEME_PATH,
                $sourceThemeId ?? 'missing',
                self::TARGET_THEME_PATH,
                $targetThemeId ?? 'missing'
            ));
            return $result;
        }

        if ($sourceThemeId === $targetThemeId) {
            return $result;
        }

        $instances = $this->sampleInstances($setup, $connection, $sourceThemeId);
        if ($instances === []) {
            return $result;
        }
        $instanceIds = array_keys($instances);

        $connection->beginTransaction();
        try {
            $layoutUpdateIds = $this->layoutUpdateIds($setup, $connection, $instanceIds);
            $result[self::TABLE_WIDGET_INSTANCE] = (int) $connection->update(
                $setup->getTable(self::TABLE_WIDGET_INSTANCE),
                ['theme_id' => $targetThemeId],
                ['theme_id = ?' => $sourceThemeId, 'instance_id IN (?)' => $instanceIds]
            );
            if ($layoutUpdateIds !== []) {
                $result[self::TABLE_LAYOUT_LINK] = (int) $connection->update(
                    $setup->getTable(self::TABLE_LAYOUT_LINK),
                    ['theme_id' => $targetThemeId],
                    ['theme_id = ?' => $sourceThemeId, 'layout_update_id IN (?)' => $layoutUpdateIds]
                );
            }
            $connection->commit();
        } catch (\Throwable $e) {
            $connection->rollBack();
            $this->logger->error('HyperionSampleData: rebind failed and was rolled back -- ' . $e->getMessage());
            return [self::TABLE_WIDGET_INSTANCE => 0, self::TABLE_LAYOUT_LINK => 0];
        }

        $this->logger->info(sprintf(
            'HyperionSampleData: rebound %d widget_instance and %d layout_link rows from theme %d (%s) to theme %d (%s);'
            . ' sample widgets found: %s.',
            $result[self::TABLE_WIDGET_INSTANCE],
            $result[self::TABLE_LAYOUT_LINK],
            $sourceThemeId,
            self::SOURCE_THEME_PATH,
            $targetThemeId,
            self::TARGET_THEME_PATH,
            implode(', ', array_unique($instances))
        ));

        return $result;
    }

    /**
     * The sample widget instances still bound to the source theme.
     *
     * @return array<int, string> title by instance id
     */
    private function sampleInstances(ModuleDataSetupInterface $setup, AdapterInterface $connection, int $themeId): array
    {
        $select = $connection->select()
            ->from($setup->getTable(self::TABLE_WIDGET_INSTANCE), ['instance_id', 'title'])
            ->where('theme_id = ?', $themeId)
            ->where('instance_type = ?', self::SAMPLE_WIDGET_TYPE)
            ->where('title IN (?)', self::SAMPLE_WIDGET_TITLES);
        $instances = [];
        foreach ($connection->fetchPairs($select) as $instanceId => $title) {
            $instances[(int) $instanceId] = (string) $title;
        }

        return $instances;
    }

    /**
     * The layout updates generated from the given widget instances.
     *
     * @param int[] $instanceIds
     * @return int[]
     */
    private function layoutUpdateIds(ModuleDataSetupInterface $setup, AdapterInterface $connection, array $instanceIds): array
    {
        $select = $connection->select()
            ->from(['wipl' => $setup->getTable(self::TABLE_WIDGET_INSTANCE_PAGE_LAYOUT)], 'layout_update_id')
            ->join(['wip' => $setup->getTable(self::TABLE_WIDGET_INSTANCE_PAGE)], 'wip.page_id = wipl.page_id', [])
            ->where('wip.instance_id IN (?)', $instanceIds);

        return array_values(array_unique(array_map('intval', $connection->fetchCol($select))));
    }

    private function resolveThemeId(
        ModuleDataSetupInterface $setup,
        AdapterInterface $connection,
        string $themePath
    ): ?int {
        $select = $connection->select()
            ->from($setup->getTable(self::TABLE_THEME), 'theme_id')
            ->where('theme_path = ?', $themePath)
            ->where('area = ?', Area::AREA_FRONTEND)
            ->limit(1);

        $themeId = $connection->fetchOne($select);

        // fetchOne() yields false for an empty result set despite its string PHPDoc.
        return is_numeric($themeId) ? (int) $themeId : null;
    }
}

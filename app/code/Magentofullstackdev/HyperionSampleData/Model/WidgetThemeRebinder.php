<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Model;

use Magento\Framework\App\Area;
use Magento\Framework\DB\Adapter\AdapterInterface;
use Magento\Framework\Setup\ModuleDataSetupInterface;
use Psr\Log\LoggerInterface;

/**
 * Moves widget instances (and the layout links generated from them) from
 * the Magento/luma theme to the Magentofullstackdev/hyperion theme.
 *
 * Widget instances are theme-scoped: the Luma sample data creates them for
 * Magento/luma only, so the home page promo grid, the category banners and
 * the login / contact blocks are invisible on a Hyperion storefront.
 *
 * The operation is idempotent (it only touches rows still bound to Luma)
 * and defensive: when either theme is not registered yet, or a table is
 * missing, it logs and returns without changing anything.
 */
class WidgetThemeRebinder
{
    public const SOURCE_THEME_PATH = 'Magento/luma';
    public const TARGET_THEME_PATH = 'Magentofullstackdev/hyperion';

    private const TABLE_THEME = 'theme';
    private const TABLE_WIDGET_INSTANCE = 'widget_instance';
    private const TABLE_LAYOUT_LINK = 'layout_link';

    public function __construct(
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return array{widget_instance: int, layout_link: int} rows updated per table
     */
    public function rebind(ModuleDataSetupInterface $setup): array
    {
        $result = [self::TABLE_WIDGET_INSTANCE => 0, self::TABLE_LAYOUT_LINK => 0];
        $connection = $setup->getConnection();

        foreach ([self::TABLE_THEME, self::TABLE_WIDGET_INSTANCE, self::TABLE_LAYOUT_LINK] as $table) {
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

        $connection->beginTransaction();
        try {
            foreach ([self::TABLE_WIDGET_INSTANCE, self::TABLE_LAYOUT_LINK] as $table) {
                $result[$table] = (int) $connection->update(
                    $setup->getTable($table),
                    ['theme_id' => $targetThemeId],
                    ['theme_id = ?' => $sourceThemeId]
                );
            }
            $connection->commit();
        } catch (\Throwable $e) {
            $connection->rollBack();
            $this->logger->error('HyperionSampleData: rebind failed and was rolled back -- ' . $e->getMessage());
            return [self::TABLE_WIDGET_INSTANCE => 0, self::TABLE_LAYOUT_LINK => 0];
        }

        $this->logger->info(sprintf(
            'HyperionSampleData: rebound %d widget_instance and %d layout_link rows from theme %d (%s) to theme %d (%s).',
            $result[self::TABLE_WIDGET_INSTANCE],
            $result[self::TABLE_LAYOUT_LINK],
            $sourceThemeId,
            self::SOURCE_THEME_PATH,
            $targetThemeId,
            self::TARGET_THEME_PATH
        ));

        return $result;
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

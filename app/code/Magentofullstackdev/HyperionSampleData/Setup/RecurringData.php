<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Setup;

use Magentofullstackdev\HyperionSampleData\Model\LumaStylesheetReplacer;
use Magentofullstackdev\HyperionSampleData\Model\WidgetThemeRebinder;
use Magento\Framework\Setup\InstallDataInterface;
use Magento\Framework\Setup\ModuleContextInterface;
use Magento\Framework\Setup\ModuleDataSetupInterface;
use Psr\Log\LoggerInterface;

/**
 * Runs on every `bin/magento setup:upgrade`, after all module data patches.
 *
 * A recurring script was chosen over a one-shot data patch on purpose:
 * the Luma sample data can be installed (or re-installed) after this
 * module, and Magento only registers themes during setup:upgrade, so a
 * patch that ran once before the Hyperion theme existed would silently
 * do nothing forever. The rebind itself is idempotent, so re-running it
 * is free. The same goes for the Luma stylesheet replacement.
 */
class RecurringData implements InstallDataInterface
{
    public function __construct(
        private readonly WidgetThemeRebinder $rebinder,
        private readonly LumaStylesheetReplacer $stylesheetReplacer,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     */
    public function install(ModuleDataSetupInterface $setup, ModuleContextInterface $context): void
    {
        $this->rebinder->rebind($setup);
        try {
            // The Luma sample data stylesheet fights the theme (Model\LumaStylesheetReplacer);
            // a media directory problem must never abort setup:upgrade for it.
            if ($this->stylesheetReplacer->replace()) {
                $this->logger->info('HyperionSampleData: replaced the Luma sample data pub/media/styles.css.');
            }
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: styles.css not replaced -- ' . $e->getMessage());
        }
    }
}

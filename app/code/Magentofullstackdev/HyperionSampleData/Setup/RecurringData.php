<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Setup;

use Magentofullstackdev\HyperionSampleData\Model\LumaStylesheetLinkRemover;
use Magentofullstackdev\HyperionSampleData\Model\LumaStylesheetReplacer;
use Magentofullstackdev\HyperionSampleData\Model\SampleProducts;
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
 * patch that ran once before the Hyperion theme or the sample data existed
 * would silently do nothing forever. Every step is idempotent and limited
 * to what the sample data created (see the model classes), so re-running
 * it changes nothing once the sample content is on Hyperion.
 */
class RecurringData implements InstallDataInterface
{
    public function __construct(
        private readonly WidgetThemeRebinder $rebinder,
        private readonly LumaStylesheetReplacer $stylesheetReplacer,
        private readonly LumaStylesheetLinkRemover $stylesheetLinkRemover,
        private readonly LoggerInterface $logger,
        private readonly SampleProducts $sampleProducts
    ) {
    }

    /**
     * @inheritDoc
     */
    public function install(ModuleDataSetupInterface $setup, ModuleContextInterface $context): void
    {
        try {
            $this->rebinder->rebind($setup);
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: widgets not rebound -- ' . $e->getMessage());
        }
        try {
            // The Luma sample data stylesheet fights the theme (Model\LumaStylesheetReplacer);
            // a media directory problem must never abort setup:upgrade for it.
            if ($this->stylesheetReplacer->replace()) {
                $this->logger->info('HyperionSampleData: replaced the Luma sample data pub/media/styles.css.');
            }
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: styles.css not replaced -- ' . $e->getMessage());
        }
        try {
            // The link to that file in design/head/includes is a render blocking request for nothing.
            $rows = $this->stylesheetLinkRemover->remove();
            if ($rows > 0) {
                $this->logger->info('HyperionSampleData: removed the Luma styles.css link from design/head/includes (' . $rows . ' scope rows).');
            }
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: styles.css link not removed -- ' . $e->getMessage());
        }
        // Completes the sample products when the sample catalog arrived after the data patches ran.
        $this->sampleProducts->create();
    }
}

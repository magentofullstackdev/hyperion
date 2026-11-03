<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Checkout;

use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\File\Csv;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Psr\Log\LoggerInterface;

/**
 * The checkout bundle's strings, translated through Magento's pipeline.
 *
 * The bundle keeps its catalog in `frontend/packages/module-checkout/src/i18n/en_US.json`
 * (key `Hyperion_Checkout::<name>` to English text). The build syncs every
 * English text into this module's `i18n/en_US.csv` as a row keyed by the
 * text itself, which is how Magento keys translations: `i18n/<locale>.csv`
 * files, theme CSVs and language packs all translate by the English source
 * string. That CSV is therefore the one shipped list of the checkout's
 * strings, and this class reads it (first column, in memory per request)
 * and renders each string with `__()`, so the storefront locale, the
 * module's own `it_IT.csv`, a merchant CSV or a language pack decide the
 * output. The bundle looks its keys up by their English text in the
 * resulting dictionary (`checkoutConfig.hyperion.translations`); a string
 * that is not in the CSV yet falls back to the bundle's static catalog.
 *
 * `__()` with no arguments leaves `%1` and `{name}` placeholders untouched,
 * so the bundle's own interpolation still finds them.
 */
class TranslationCatalog
{
    private const MODULE_NAME = 'Magentofullstackdev_HyperionCheckout';
    private const SOURCE_CSV = 'i18n/en_US.csv';

    /** @var string[]|null */
    private ?array $sourceStrings = null;

    public function __construct(
        private readonly ComponentRegistrarInterface $componentRegistrar,
        private readonly FileDriver $fileDriver,
        private readonly Csv $csv,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * English source string to its rendering in the current locale.
     *
     * @return array<string, string>
     */
    public function getTranslations(): array
    {
        $translations = [];
        foreach ($this->getSourceStrings() as $source) {
            $translations[$source] = (string)__($source);
        }
        return $translations;
    }

    /**
     * The distinct, non empty first-column values of the module's `en_US.csv`.
     *
     * @return string[]
     */
    public function getSourceStrings(): array
    {
        if ($this->sourceStrings !== null) {
            return $this->sourceStrings;
        }
        $this->sourceStrings = [];
        try {
            $modulePath = $this->componentRegistrar->getPath(ComponentRegistrar::MODULE, self::MODULE_NAME);
            $file = $modulePath !== null ? $modulePath . '/' . self::SOURCE_CSV : null;
            if ($file === null || !$this->fileDriver->isExists($file)) {
                $this->logger->warning(sprintf(
                    'Hyperion checkout: translation source %s not found under module %s',
                    self::SOURCE_CSV,
                    self::MODULE_NAME
                ));
                return $this->sourceStrings;
            }
            $seen = [];
            foreach ($this->csv->getData($file) as $row) {
                $source = isset($row[0]) ? trim((string)$row[0]) : '';
                if ($source === '' || isset($seen[$source])) {
                    continue;
                }
                $seen[$source] = true;
                $this->sourceStrings[] = $source;
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: could not read the translation source: ' . $e->getMessage(), [
                'exception' => $e,
            ]);
        }
        return $this->sourceStrings;
    }
}

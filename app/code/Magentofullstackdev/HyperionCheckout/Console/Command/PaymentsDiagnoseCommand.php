<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Console\Command;

use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethods;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethodsReport;
use Magento\Framework\App\Area;
use Magento\Framework\App\State;
use Magento\Framework\Console\Cli;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\ObjectManager\ConfigLoaderInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Formatter\OutputFormatter;
use Symfony\Component\Console\Helper\Table;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * `bin/magento hyperion:checkout:payments [--store=<code>]`: one row per
 * active payment method and store view with the checkout renderer that
 * serves it, and the stored report of hidden methods rewritten for the
 * store views it checked.
 *
 * The renderer pool is declared in the frontend area only, so the command
 * sets that area and loads its DI configuration into the object manager
 * before it asks for the pool (acceptable in a one-shot console process,
 * never in a web request). The classes that read the pool are therefore
 * taken from the object manager after that step, not injected.
 */
class PaymentsDiagnoseCommand extends Command
{
    public const NAME = 'hyperion:checkout:payments';
    private const OPTION_STORE = 'store';

    /**
     * @param State $appState
     * @param ConfigLoaderInterface $configLoader
     * @param ObjectManagerInterface $objectManager
     * @param StoreManagerInterface $storeManager
     */
    public function __construct(
        private readonly State $appState,
        private readonly ConfigLoaderInterface $configLoader,
        private readonly ObjectManagerInterface $objectManager,
        private readonly StoreManagerInterface $storeManager
    ) {
        parent::__construct();
    }

    /**
     * @inheritdoc
     */
    protected function configure()
    {
        $this->setName(self::NAME)
            ->setDescription(
                'Lists the active payment methods of each store view and the Hyperion checkout renderer'
                . ' that serves them; methods without one are hidden from shoppers.'
            )
            ->addOption(
                self::OPTION_STORE,
                null,
                InputOption::VALUE_REQUIRED,
                'Store view code (default: every store view)'
            );
        parent::configure();
    }

    /**
     * @inheritdoc
     */
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        try {
            $this->enterFrontendArea();
        } catch (LocalizedException $e) {
            $output->writeln('<error>' . $e->getMessage() . '</error>');
            return Cli::RETURN_FAILURE;
        }

        $stores = $this->selectStores($input->getOption(self::OPTION_STORE));
        if ($stores === null) {
            $output->writeln(sprintf(
                '<error>Unknown store view code "%s".</error>',
                (string)$input->getOption(self::OPTION_STORE)
            ));
            return Cli::RETURN_FAILURE;
        }

        /** @var UnsupportedMethods $inspector */
        $inspector = $this->objectManager->get(UnsupportedMethods::class);
        /** @var UnsupportedMethodsReport $report */
        $report = $this->objectManager->get(UnsupportedMethodsReport::class);

        $table = new Table($output);
        $table->setHeaders(['Store view', 'Code', 'Title', 'Entry', 'Type', 'Renderer', 'Status']);
        $hidden = 0;
        foreach ($stores as $store) {
            $storeId = (int)$store->getId();
            $unsupported = [];
            foreach ($inspector->inspect($storeId) as $row) {
                $entry = $row['entry'];
                if (!$row['checkout']) {
                    $status = 'not offered in checkout';
                } elseif ($entry === null) {
                    $status = 'no renderer';
                    $unsupported[$row['code']] = $row['title'];
                } else {
                    $status = 'supported';
                }
                $table->addRow([
                    (string)$store->getCode(),
                    $row['code'],
                    OutputFormatter::escape($row['title']),
                    $entry['id'] ?? '-',
                    $entry['type'] ?? '-',
                    $entry === null ? '-' : $this->describeRenderer($entry),
                    $status,
                ]);
            }
            $hidden += count($unsupported);
            $report->save($storeId, $unsupported, true);
        }
        $table->render();
        $output->writeln($hidden === 0
            ? 'Every payment method offered in the checkout has a renderer.'
            : sprintf('%d method(s) without a renderer are hidden from shoppers.', $hidden));
        return Cli::RETURN_SUCCESS;
    }

    /**
     * @return void
     * @throws LocalizedException When another area is already set
     */
    private function enterFrontendArea(): void
    {
        try {
            $this->appState->setAreaCode(Area::AREA_FRONTEND);
        } catch (LocalizedException $e) {
            if ($this->appState->getAreaCode() !== Area::AREA_FRONTEND) {
                throw $e;
            }
        }
        $this->objectManager->configure($this->configLoader->load(Area::AREA_FRONTEND));
    }

    /**
     * @param mixed $code
     * @return StoreInterface[]|null Null when the code names no store view
     */
    private function selectStores(mixed $code): ?array
    {
        $stores = $this->storeManager->getStores(false);
        if ($code === null || $code === '') {
            return array_values($stores);
        }
        foreach ($stores as $store) {
            if ($store->getCode() === $code) {
                return [$store];
            }
        }
        return null;
    }

    /**
     * @param array<string, mixed> $entry
     * @return string
     */
    private function describeRenderer(array $entry): string
    {
        if ($entry['builtin'] !== null) {
            return 'built-in ' . $entry['builtin'];
        }
        if ($entry['tag'] !== null) {
            return 'tag ' . $entry['tag'];
        }
        return 'generic ' . $entry['type'];
    }
}

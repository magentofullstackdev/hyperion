<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

/**
 * MSRP / MAP ("minimum advertised price") texts for the price templates.
 *
 * The theme's Magento_Msrp::product/price/msrp.phtml renders the MAP
 * markup without RequireJS; the explanation messages it prints inside the
 * "Click for price" and "What's this?" dialogs come from the store
 * configuration through the core Msrp config model, which already escapes
 * them with the allowed inline tags (b, br, strong, i, u, p, span).
 */
class Msrp implements ArgumentInterface
{
    private const MODULE_NAME = 'Magento_Msrp';
    private const CONFIG_CLASS = 'Magento\Msrp\Model\Config';

    private ?object $config = null;

    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Text shown under the actual price in the "Click for price" dialog.
     * Safe to print unescaped (escaped by the core config model).
     */
    public function getExplanationMessage(): string
    {
        try {
            return (string) ($this->config()?->getExplanationMessage() ?? '');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Msrp view model: explanation message failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * Text of the "What's this?" dialog on the product page.
     * Safe to print unescaped (escaped by the core config model).
     */
    public function getExplanationMessageWhatsThis(): string
    {
        try {
            return (string) ($this->config()?->getExplanationMessageWhatsThis() ?? '');
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion Msrp view model: "what\'s this" message failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * Magento_Msrp is optional: a store that removed it never renders the
     * MAP markup, and the class is resolved by name so DI compiles without it.
     *
     * @return object|null
     */
    private function config(): ?object
    {
        if ($this->config === null && $this->moduleManager->isEnabled(self::MODULE_NAME)
            && class_exists(self::CONFIG_CLASS)) {
            $this->config = $this->objectManager->get(self::CONFIG_CLASS);
        }

        return $this->config;
    }
}

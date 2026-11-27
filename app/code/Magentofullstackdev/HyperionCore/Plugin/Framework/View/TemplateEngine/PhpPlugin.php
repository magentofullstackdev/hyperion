<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\View\TemplateEngine;

use Magentofullstackdev\HyperionCore\Model\Design\ThemeScope;
use Magentofullstackdev\HyperionCore\Model\ViewModelRegistry;
use Magento\Framework\View\Element\BlockInterface;
use Magento\Framework\View\TemplateEngine\Php;
use Psr\Log\LoggerInterface;

/**
 * Injects the Hyperion ViewModelRegistry into every PHP template.
 *
 * Two variables:
 *   - `$hyperionViewModels`: always the Hyperion registry, whatever else is installed.
 *   - `$viewModels`: the Hyperion registry under the Hyperion theme (or a child of it),
 *     and wherever no other module set the variable. Under another theme a value that
 *     another module already put there (Hyvä ships a registry of the same name) is
 *     kept, so that theme's templates keep the registry they were written for.
 *
 * The plugin runs late (sortOrder in etc/di.xml) so the theme decides over a
 * registry that other plugins set before it.
 *
 * @internal
 */
class PhpPlugin
{
    /**
     * @param ViewModelRegistry $viewModelRegistry
     * @param ThemeScope $themeScope
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ViewModelRegistry $viewModelRegistry,
        private readonly ThemeScope $themeScope,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param Php $subject
     * @param BlockInterface $block
     * @param string $filename
     * @param array<string, mixed> $dictionary
     * @return array{0: BlockInterface, 1: string, 2: array<string, mixed>}
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeRender(Php $subject, BlockInterface $block, $filename, array $dictionary = []): array
    {
        $dictionary['hyperionViewModels'] = $this->viewModelRegistry;
        if ($this->ownsViewModelsVariable($dictionary)) {
            $dictionary['viewModels'] = $this->viewModelRegistry;
        }

        return [$block, $filename, $dictionary];
    }

    /**
     * @param array<string, mixed> $dictionary
     * @return bool
     */
    private function ownsViewModelsVariable(array $dictionary): bool
    {
        $current = $dictionary['viewModels'] ?? null;
        if ($current === null || $current === $this->viewModelRegistry) {
            return true;
        }
        try {
            return $this->themeScope->isHyperionActive();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion PhpPlugin: the theme scope could not be read: ' . $e->getMessage());
            return false;
        }
    }
}

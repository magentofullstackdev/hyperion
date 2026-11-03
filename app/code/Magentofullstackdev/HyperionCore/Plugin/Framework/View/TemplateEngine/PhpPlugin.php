<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\View\TemplateEngine;

use Magentofullstackdev\HyperionCore\Model\ViewModelRegistry;
use Magento\Framework\View\Element\BlockInterface;
use Magento\Framework\View\TemplateEngine\Php;

/**
 * Injects the Hyperion ViewModelRegistry into every PHP template as $viewModels.
 *
 * Inspired by Hyvä's PhpPlugin. Templates can then pull their collaborators
 * without going through layout XML arguments or ObjectManager::getInstance().
 */
class PhpPlugin
{
    public function __construct(
        private readonly ViewModelRegistry $viewModelRegistry
    ) {
    }

    /**
     * @param Php $subject
     * @param BlockInterface $block
     * @param string $filename
     * @param array<string, mixed> $dictionary
     * @return array{0: BlockInterface, 1: string, 2: array<string, mixed>}
     */
    public function beforeRender(Php $subject, BlockInterface $block, $filename, array $dictionary = []): array
    {
        $dictionary['viewModels'] = $this->viewModelRegistry;
        return [$block, $filename, $dictionary];
    }
}

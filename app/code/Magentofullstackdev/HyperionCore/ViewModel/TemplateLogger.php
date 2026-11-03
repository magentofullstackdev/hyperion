<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

/**
 * Logger for .phtml templates, reachable through the view-model registry:
 *
 *   $viewModels->require(\Magentofullstackdev\HyperionCore\ViewModel\TemplateLogger::class)
 *       ->error('product/view.phtml: super attributes', $e);
 *
 * Templates have no constructor injection, so a try/catch inside a template
 * used to swallow the exception silently. Route it here instead so the
 * failure lands in var/log with the template name as context.
 */
class TemplateLogger implements ArgumentInterface
{
    public function __construct(
        private readonly LoggerInterface $logger
    ) {
    }

    public function error(string $context, \Throwable $e): void
    {
        $this->logger->error('Hyperion template: ' . $context, ['exception' => $e]);
    }

    public function warning(string $context, \Throwable $e): void
    {
        $this->logger->warning('Hyperion template: ' . $context, ['exception' => $e]);
    }
}

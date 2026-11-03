<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Block\Category;

use Magento\Framework\Registry;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;

class LayoutWrapper extends Template
{
    public function __construct(
        Context $context,
        private readonly Registry $registry,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function getPageLayout(): string
    {
        $category = $this->registry->registry('current_category');
        if ($category && $category->getPageLayout()) {
            return (string) $category->getPageLayout();
        }
        return '2columns-left';
    }

    public function isMultiColumn(): bool
    {
        return in_array($this->getPageLayout(), ['2columns-left', '2columns-right', '3columns'], true);
    }

    public function hasLeftSidebar(): bool
    {
        return in_array($this->getPageLayout(), ['2columns-left', '3columns'], true);
    }

    public function hasRightSidebar(): bool
    {
        return in_array($this->getPageLayout(), ['2columns-right', '3columns'], true);
    }

    public function getGridClass(): string
    {
        return match ($this->getPageLayout()) {
            '2columns-left' => 'md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-6',
            '2columns-right' => 'md:grid md:grid-cols-[minmax(0,1fr)_240px] md:gap-6',
            '3columns' => 'md:grid md:grid-cols-[240px_minmax(0,1fr)_200px] md:gap-6',
            default => '',
        };
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;

class ItemType implements OptionSourceInterface
{
    /**
     * @return array<string, \Magento\Framework\Phrase> type => label, content types first
     */
    public function getLabels(): array
    {
        return [
            Item::TYPE_CATEGORY => __('Category'),
            Item::TYPE_PRODUCT => __('Product (by SKU)'),
            Item::TYPE_CMS_PAGE => __('CMS page'),
            Item::TYPE_CMS_BLOCK => __('CMS block (mega menu column content)'),
            Item::TYPE_CUSTOM => __('Custom URL'),
            Item::TYPE_HOME => __('Home page'),
            Item::TYPE_EMPTY => __('Label without link'),
            Item::TYPE_LOGIN => __('Sign in'),
            Item::TYPE_REGISTER => __('Create an account'),
            Item::TYPE_ACCOUNT => __('My account'),
            Item::TYPE_CART => __('Shopping cart'),
            Item::TYPE_WISHLIST => __('Wish list'),
            Item::TYPE_CONTACT => __('Contact us'),
        ];
    }

    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function toOptionArray(): array
    {
        $options = [];
        foreach ($this->getLabels() as $value => $label) {
            $options[] = ['value' => $value, 'label' => $label];
        }

        return $options;
    }

    /**
     * Short label for the tree badge.
     */
    public function getShortLabel(string $type): string
    {
        $short = [
            Item::TYPE_CATEGORY => 'Cat', Item::TYPE_PRODUCT => 'SKU', Item::TYPE_CMS_PAGE => 'Page',
            Item::TYPE_CMS_BLOCK => 'Block', Item::TYPE_CUSTOM => 'URL', Item::TYPE_HOME => 'Home', Item::TYPE_EMPTY => 'Label',
        ];

        return $short[$type] ?? 'Link';
    }
}

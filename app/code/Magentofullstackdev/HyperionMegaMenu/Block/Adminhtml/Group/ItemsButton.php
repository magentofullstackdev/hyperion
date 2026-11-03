<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Block\Adminhtml\Group;

use Magento\Framework\View\Element\UiComponent\Control\ButtonProviderInterface;

class ItemsButton extends GenericButton implements ButtonProviderInterface
{
    /**
     * @return array<string, mixed>
     */
    public function getButtonData(): array
    {
        if ($this->getGroupId() <= 0) {
            return [];
        }

        return [
            'label' => __('Manage Items'),
            'on_click' => sprintf("location.href = '%s';", $this->getUrl('*/item/builder', ['group_id' => $this->getGroupId()])),
            'class' => 'secondary',
            'sort_order' => 30,
        ];
    }
}

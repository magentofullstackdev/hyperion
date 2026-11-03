<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Block\Adminhtml\Group;

use Magento\Framework\View\Element\UiComponent\Control\ButtonProviderInterface;

class DeleteButton extends GenericButton implements ButtonProviderInterface
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
            'label' => __('Delete Group'),
            'class' => 'delete',
            'on_click' => 'deleteConfirm(\'' . (string) __('Delete this menu group and every item in it?') . '\', \''
                . $this->getUrl('*/*/delete', ['group_id' => $this->getGroupId()]) . '\', {data: {}})',
            'sort_order' => 20,
        ];
    }
}

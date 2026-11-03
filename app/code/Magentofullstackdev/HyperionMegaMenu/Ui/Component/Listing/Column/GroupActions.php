<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Ui\Component\Listing\Column;

use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\UiComponent\ContextInterface;
use Magento\Framework\View\Element\UiComponentFactory;
use Magento\Ui\Component\Listing\Columns\Column;

class GroupActions extends Column
{
    /**
     * @param array<string, mixed> $components
     * @param array<string, mixed> $data
     */
    public function __construct(
        ContextInterface $context,
        UiComponentFactory $uiComponentFactory,
        private readonly UrlInterface $urlBuilder,
        array $components = [],
        array $data = []
    ) {
        parent::__construct($context, $uiComponentFactory, $components, $data);
    }

    /**
     * @param array<string, mixed> $dataSource
     * @return array<string, mixed>
     */
    public function prepareDataSource(array $dataSource): array
    {
        if (!isset($dataSource['data']['items'])) {
            return $dataSource;
        }
        foreach ($dataSource['data']['items'] as &$item) {
            $id = (int) ($item['group_id'] ?? 0);
            $item[$this->getData('name')] = [
                'items' => [
                    'href' => $this->urlBuilder->getUrl('hyperion_megamenu/item/builder', ['group_id' => $id]),
                    'label' => __('Manage Items'),
                ],
                'edit' => [
                    'href' => $this->urlBuilder->getUrl('hyperion_megamenu/group/edit', ['group_id' => $id]),
                    'label' => __('Edit'),
                ],
                'delete' => [
                    'href' => $this->urlBuilder->getUrl('hyperion_megamenu/group/delete', ['group_id' => $id]),
                    'label' => __('Delete'),
                    'confirm' => [
                        'title' => __('Delete "%1"', (string) ($item['title'] ?? '')),
                        'message' => __('Delete this menu group and every item in it?'),
                    ],
                    'post' => true,
                ],
            ];
        }

        return $dataSource;
    }
}

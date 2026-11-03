<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Ui\Component\Listing\Column;

use Magento\Framework\View\Element\UiComponent\ContextInterface;
use Magento\Framework\View\Element\UiComponentFactory;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Ui\Component\Listing\Columns\Column;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;

class WebsiteNames extends Column
{
    /**
     * @param array<string, mixed> $components
     * @param array<string, mixed> $data
     */
    public function __construct(
        ContextInterface $context,
        UiComponentFactory $uiComponentFactory,
        private readonly StoreManagerInterface $storeManager,
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
        $names = [];
        foreach ($this->storeManager->getWebsites() as $website) {
            $names[(int) $website->getId()] = (string) $website->getName();
        }
        foreach ($dataSource['data']['items'] as &$item) {
            $ids = Item::idList($item['website_ids'] ?? '');
            $item['website_ids'] = $ids === [] || in_array(Group::ALL_WEBSITES, $ids, true)
                ? (string) __('All Websites')
                : implode(', ', array_map(static fn (int $id): string => $names[$id] ?? (string) $id, $ids));
        }

        return $dataSource;
    }
}

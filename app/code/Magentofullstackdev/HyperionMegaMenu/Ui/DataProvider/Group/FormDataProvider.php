<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Ui\DataProvider\Group;

use Magento\Framework\App\Request\DataPersistorInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Ui\DataProvider\AbstractDataProvider;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group\CollectionFactory;

class FormDataProvider extends AbstractDataProvider
{
    /** @var array<int, array<string, mixed>>|null */
    private ?array $loadedData = null;

    /**
     * @param array<string, mixed> $meta
     * @param array<string, mixed> $data
     */
    public function __construct(
        string $name,
        string $primaryFieldName,
        string $requestFieldName,
        CollectionFactory $collectionFactory,
        private readonly DataPersistorInterface $dataPersistor,
        private readonly RequestInterface $request,
        array $meta = [],
        array $data = []
    ) {
        $this->collection = $collectionFactory->create();
        parent::__construct($name, $primaryFieldName, $requestFieldName, $meta, $data);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function getData(): array
    {
        if ($this->loadedData !== null) {
            return $this->loadedData;
        }
        $this->loadedData = [];
        $id = (int) $this->request->getParam($this->getRequestFieldName());
        if ($id > 0) {
            $this->collection->addFieldToFilter('group_id', ['eq' => $id]);
            foreach ($this->collection->getItems() as $group) {
                /** @var \Magentofullstackdev\HyperionMegaMenu\Model\Group $group */
                $data = $group->getData();
                // The UI multiselect casts its option values to strings and selects
                // by strict comparison: integers would never show as selected.
                $data['website_ids'] = array_map('strval', $group->getWebsiteIds());
                $this->loadedData[(int) $group->getId()] = $data;
            }
        }
        $persisted = $this->dataPersistor->get('hyperion_megamenu_group');
        if (is_array($persisted) && $persisted !== []) {
            $this->loadedData[(int) ($persisted['group_id'] ?? 0)] = $persisted;
            $this->dataPersistor->clear('hyperion_megamenu_group');
        }

        return $this->loadedData;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Block\Adminhtml;

use Magento\Backend\Block\Template;
use Magento\Backend\Block\Template\Context;
use Magento\Customer\Model\ResourceModel\Group\CollectionFactory as CustomerGroupCollectionFactory;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\ItemSaver;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\ItemStore;
use Magentofullstackdev\HyperionMegaMenu\Model\Source\BadgeColor;
use Magentofullstackdev\HyperionMegaMenu\Model\Source\Categories;
use Magentofullstackdev\HyperionMegaMenu\Model\Source\CmsBlocks;
use Magentofullstackdev\HyperionMegaMenu\Model\Source\CmsPages;
use Magentofullstackdev\HyperionMegaMenu\Model\Source\ItemType;

/**
 * The inspector form of one item for the current store view.
 */
class ItemForm extends Template
{
    private ?Item $item = null;
    private bool $itemLoaded = false;

    /** @var array<string, mixed>|null */
    private ?array $storeValues = null;

    /**
     * @param array<string, mixed> $data
     */
    public function __construct(
        Context $context,
        private readonly ItemSaver $saver,
        private readonly ItemStore $itemStore,
        private readonly ItemType $itemType,
        private readonly Categories $categories,
        private readonly CmsPages $cmsPages,
        private readonly CmsBlocks $cmsBlocks,
        private readonly BadgeColor $badgeColor,
        private readonly CustomerGroupCollectionFactory $customerGroupCollectionFactory,
        private readonly StoreManagerInterface $storeManager,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function getStoreId(): int
    {
        return (int) $this->getRequest()->getParam('store');
    }

    public function getGroupId(): int
    {
        return (int) $this->getRequest()->getParam('group_id');
    }

    public function getParentId(): int
    {
        $item = $this->getItem();

        return $item ? $item->getParentId() : max(0, (int) $this->getRequest()->getParam('parent_id'));
    }

    /**
     * The item being edited, null for a new one.
     */
    public function getItem(): ?Item
    {
        if (!$this->itemLoaded) {
            $this->itemLoaded = true;
            $this->item = $this->saver->load((int) $this->getRequest()->getParam('item_id'));
        }

        return $this->item;
    }

    /**
     * Whether the store edits the defaults and the structure (Default Config, a store only item, a new item).
     */
    public function ownsItem(): bool
    {
        $item = $this->getItem();

        return $item === null || $this->saver->ownsItem($item, $this->getStoreId());
    }

    /**
     * The store row values (null = default) of the item for the current store view.
     *
     * @return array<string, mixed>
     */
    public function getStoreValues(): array
    {
        if ($this->storeValues === null) {
            $item = $this->getItem();
            $this->storeValues = $item && $this->getStoreId() > 0
                ? $this->itemStore->getValues((int) $item->getId(), $this->getStoreId())
                : [];
        }

        return $this->storeValues;
    }

    /**
     * Whether the store overrides a field.
     */
    public function isOverridden(string $field): bool
    {
        return ($this->getStoreValues()[$field] ?? null) !== null;
    }

    /**
     * The value the form shows: the store value when set, the default otherwise.
     */
    public function getValue(string $field, mixed $default = ''): mixed
    {
        $values = $this->getStoreValues();
        if (($values[$field] ?? null) !== null) {
            return $values[$field];
        }
        $item = $this->getItem();

        return $item ? $item->getData($field) ?? $default : $default;
    }

    /**
     * @return array<string, \Magento\Framework\Phrase>
     */
    public function getTypeLabels(): array
    {
        return $this->itemType->getLabels();
    }

    /**
     * @return array<int, array{value: int|string, label: string}>
     */
    public function getCategoryOptions(): array
    {
        return $this->categories->toOptionArray();
    }

    /**
     * @return array<int, array{value: string, label: string, disabled?: bool}>
     */
    public function getCmsPageOptions(): array
    {
        return $this->cmsPages->toOptionArray();
    }

    /**
     * @return array<int, array{value: string, label: string, disabled?: bool}>
     */
    public function getCmsBlockOptions(): array
    {
        return $this->cmsBlocks->toOptionArray();
    }

    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function getBadgeColorOptions(): array
    {
        return $this->badgeColor->toOptionArray();
    }

    /**
     * @return array<int, array{value: int, label: string}>
     */
    public function getCustomerGroupOptions(): array
    {
        $options = [];
        foreach ($this->customerGroupCollectionFactory->create()->getItems() as $group) {
            $options[] = ['value' => (int) $group->getData('customer_group_id'), 'label' => (string) $group->getData('customer_group_code')];
        }

        return $options;
    }

    /**
     * @return array<int, array{value: int, label: string}>
     */
    public function getStoreOptions(): array
    {
        $options = [];
        foreach ($this->storeManager->getStores() as $store) {
            $options[] = ['value' => (int) $store->getId(), 'label' => (string) $store->getName() . ' (' . (string) $store->getCode() . ')'];
        }

        return $options;
    }

    /**
     * @return int[]
     */
    public function getSelectedIds(string $field): array
    {
        $item = $this->getItem();

        return $item ? Item::idList($item->getData($field)) : [];
    }
}

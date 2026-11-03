<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Block\Adminhtml;

use Magento\Backend\Block\Store\Switcher;
use Magento\Backend\Block\Template;
use Magento\Backend\Block\Template\Context;
use Magento\Framework\Registry;
use Magento\Framework\Serialize\Serializer\Json;
use Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item\Builder as BuilderController;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;

/**
 * The "Manage Items" page: the store view switcher (Default Config edits
 * the structure, a store view its own values), the toolbar, the tree
 * column and the inspector column driven by web/js/builder.js.
 */
class Builder extends Template
{
    /**
     * @param array<string, mixed> $data
     */
    public function __construct(
        Context $context,
        private readonly Registry $registry,
        private readonly Json $json,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function getGroup(): ?Group
    {
        $group = $this->registry->registry(BuilderController::REGISTRY_GROUP);

        return $group instanceof Group ? $group : null;
    }

    public function getStoreId(): int
    {
        return (int) $this->getRequest()->getParam('store');
    }

    /**
     * The store view switcher: Default Config plus the store views, no confirmation, no website / group rows.
     */
    public function getStoreSwitcherHtml(): string
    {
        $switcher = $this->getLayout()->createBlock(Switcher::class, 'hyperion.megamenu.store.switcher', ['data' => [
            'use_confirm' => false,
            'switch_websites' => false,
            'switch_store_groups' => false,
            'default_selection_name' => (string) __('Default Config'),
        ]]);
        if (!$switcher instanceof Switcher) {
            return '';
        }
        $switcher->setData('switch_url', $this->getUrl('*/*/*', ['_current' => true, 'store' => null]));

        return (string) $switcher->toHtml();
    }

    public function getConfigJson(): string
    {
        $group = $this->getGroup();
        $groupId = $group ? (int) $group->getId() : 0;
        $store = $this->getStoreId();

        return $this->json->serialize([
            'groupId' => $groupId,
            'storeId' => $store,
            'maxLevel' => Item::MAX_LEVEL,
            'formKey' => $this->getFormKey(),
            'urls' => [
                'tree' => $this->getUrl('*/*/tree', ['group_id' => $groupId, 'store' => $store]),
                'form' => $this->getUrl('*/*/form', ['group_id' => $groupId, 'store' => $store]),
                'save' => $this->getUrl('*/*/save', ['group_id' => $groupId, 'store' => $store]),
                'move' => $this->getUrl('*/*/move', ['group_id' => $groupId, 'store' => $store]),
                'delete' => $this->getUrl('*/*/delete', ['group_id' => $groupId, 'store' => $store]),
                'import' => $this->getUrl('*/*/import', ['group_id' => $groupId, 'store' => $store]),
            ],
            'labels' => [
                'empty' => (string) __('No items yet: add a root item or import the categories.'),
                'selectParent' => (string) __('Select the parent item first.'),
                'confirmDelete' => (string) __('Delete this item and its sub-items?'),
                'confirmImport' => (string) __('Import the categories of the group\'s root category as items? Existing category items are kept.'),
                'storeStructure' => (string) __('A store view only reorders siblings: switch to Default Config to move an item elsewhere.'),
                'tooDeep' => (string) __('A menu is at most %1 levels deep.', Item::MAX_LEVEL + 1),
                'network' => (string) __('The request failed. Please try again.'),
                'storeOnly' => (string) __('this store only'),
                'overridden' => (string) __('store value'),
                'disabled' => (string) __('disabled'),
                'hidden' => (string) __('hidden here'),
                'newItem' => (string) __('New item'),
            ],
        ]);
    }

    public function getGroupEditUrl(): string
    {
        $group = $this->getGroup();

        return $this->getUrl('*/group/edit', ['group_id' => $group ? (int) $group->getId() : 0]);
    }

    public function getGroupsUrl(): string
    {
        return $this->getUrl('*/group/');
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Group;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\Request\DataPersistorInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Exception\LocalizedException;
use Magentofullstackdev\HyperionMegaMenu\Model\GroupFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group as GroupResource;
use Psr\Log\LoggerInterface;

class Save extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Magentofullstackdev_HyperionMegaMenu::group';

    private const FIELDS = ['identifier', 'title', 'menu_type', 'website_ids', 'devices', 'root_category_id', 'is_active', 'priority'];

    public function __construct(
        Context $context,
        private readonly GroupFactory $groupFactory,
        private readonly GroupResource $groupResource,
        private readonly DataPersistorInterface $dataPersistor,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    public function execute(): Redirect
    {
        $redirect = $this->resultRedirectFactory->create();
        $request = $this->getRequest();
        $data = $request instanceof HttpRequest ? $request->getPostValue() : [];
        if (!$data) {
            return $redirect->setPath('*/*/');
        }
        $id = (int) ($data['group_id'] ?? 0);
        $group = $this->groupFactory->create();
        if ($id > 0) {
            $this->groupResource->load($group, $id);
            if (!$group->getId()) {
                $this->messageManager->addErrorMessage((string) __('This menu group no longer exists.'));
                return $redirect->setPath('*/*/');
            }
        }
        foreach (self::FIELDS as $field) {
            if (array_key_exists($field, $data)) {
                $group->setData($field, $data[$field]);
            }
        }
        if (trim((string) $group->getData('title')) === '') {
            $group->setData('title', (string) __('Menu group'));
        }
        if ((int) $group->getData('root_category_id') <= 0) {
            $group->setData('root_category_id', null);
        }
        try {
            $this->groupResource->save($group);
            $this->messageManager->addSuccessMessage((string) __('The menu group has been saved.'));
            $this->dataPersistor->clear('hyperion_megamenu_group');
            if ($this->getRequest()->getParam('back') === 'items') {
                return $redirect->setPath('*/item/builder', ['group_id' => $group->getId()]);
            }
            if ($this->getRequest()->getParam('back')) {
                return $redirect->setPath('*/*/edit', ['group_id' => $group->getId()]);
            }

            return $redirect->setPath('*/*/');
        } catch (LocalizedException $e) {
            $this->messageManager->addErrorMessage((string) __('The menu group could not be saved: %1', $e->getMessage()));
        } catch (\Throwable $e) {
            // A driver message would expose table and column names to the admin user.
            $this->logger->error('Hyperion mega menu: group save failed: ' . $e->getMessage(), ['exception' => $e]);
            $this->messageManager->addErrorMessage((string) __('The menu group could not be saved. Check the log.'));
        }
        $this->dataPersistor->set('hyperion_megamenu_group', $data);

        return $redirect->setPath('*/*/edit', ['group_id' => $id ?: null]);
    }
}

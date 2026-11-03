<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Group;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\GroupFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group as GroupResource;

class Delete extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Magentofullstackdev_HyperionMegaMenu::group';

    public function __construct(
        Context $context,
        private readonly GroupFactory $groupFactory,
        private readonly GroupResource $groupResource
    ) {
        parent::__construct($context);
    }

    public function execute(): Redirect
    {
        $redirect = $this->resultRedirectFactory->create()->setPath('*/*/');
        $id = (int) $this->getRequest()->getParam('group_id');
        $group = $this->groupFactory->create();
        $this->groupResource->load($group, $id);
        if (!$group->getId()) {
            $this->messageManager->addErrorMessage((string) __('This menu group no longer exists.'));
            return $redirect;
        }
        try {
            $this->groupResource->delete($group);
            $this->messageManager->addSuccessMessage((string) __('The menu group has been deleted.'));
        } catch (\Throwable $e) {
            $this->messageManager->addErrorMessage((string) __('The menu group could not be deleted: %1', $e->getMessage()));
        }

        return $redirect;
    }
}

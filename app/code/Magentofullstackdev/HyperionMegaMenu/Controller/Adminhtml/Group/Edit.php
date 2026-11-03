<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Group;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\View\Result\PageFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\GroupFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group as GroupResource;

class Edit extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Magentofullstackdev_HyperionMegaMenu::group';

    public function __construct(
        Context $context,
        private readonly PageFactory $pageFactory,
        private readonly GroupFactory $groupFactory,
        private readonly GroupResource $groupResource
    ) {
        parent::__construct($context);
    }

    public function execute(): ResultInterface
    {
        $id = (int) $this->getRequest()->getParam('group_id');
        $group = $this->groupFactory->create();
        if ($id > 0) {
            $this->groupResource->load($group, $id);
            if (!$group->getId()) {
                $this->messageManager->addErrorMessage((string) __('This menu group no longer exists.'));
                return $this->resultRedirectFactory->create()->setPath('*/*/');
            }
        }
        /** @var \Magento\Backend\Model\View\Result\Page $page */
        $page = $this->pageFactory->create();
        $page->setActiveMenu('Magentofullstackdev_HyperionMegaMenu::group');
        $page->getConfig()->getTitle()->prepend($group->getId() ? $group->getTitle() : (string) __('New Menu Group'));

        return $page;
    }
}

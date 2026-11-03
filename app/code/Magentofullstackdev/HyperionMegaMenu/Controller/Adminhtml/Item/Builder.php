<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Registry;
use Magento\Framework\View\Result\PageFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\GroupFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group as GroupResource;

/**
 * The "Manage Items" page of a group: store switcher, toolbar, tree and inspector.
 */
class Builder extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Magentofullstackdev_HyperionMegaMenu::group';
    public const REGISTRY_GROUP = 'hyperion_megamenu_group';

    public function __construct(
        Context $context,
        private readonly PageFactory $pageFactory,
        private readonly GroupFactory $groupFactory,
        private readonly GroupResource $groupResource,
        private readonly Registry $registry
    ) {
        parent::__construct($context);
    }

    public function execute(): ResultInterface
    {
        $group = $this->groupFactory->create();
        $this->groupResource->load($group, (int) $this->getRequest()->getParam('group_id'));
        if (!$group->getId()) {
            $this->messageManager->addErrorMessage((string) __('This menu group no longer exists.'));
            return $this->resultRedirectFactory->create()->setPath('*/group/');
        }
        $this->registry->register(self::REGISTRY_GROUP, $group, true);
        /** @var \Magento\Backend\Model\View\Result\Page $page */
        $page = $this->pageFactory->create();
        $page->setActiveMenu('Magentofullstackdev_HyperionMegaMenu::group');
        $page->getConfig()->getTitle()->prepend((string) __('%1: items', $group->getTitle()));

        return $page;
    }
}

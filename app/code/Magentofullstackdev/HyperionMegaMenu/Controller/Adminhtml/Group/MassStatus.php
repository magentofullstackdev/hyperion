<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Group;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Ui\Component\MassAction\Filter;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group as GroupResource;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group\CollectionFactory;
use Psr\Log\LoggerInterface;

/**
 * Mass enable / disable (`status` param) and mass delete (`delete` param) of the groups grid.
 */
class MassStatus extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Magentofullstackdev_HyperionMegaMenu::group';

    public function __construct(
        Context $context,
        private readonly Filter $filter,
        private readonly CollectionFactory $collectionFactory,
        private readonly GroupResource $groupResource,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    public function execute(): Redirect
    {
        $redirect = $this->resultRedirectFactory->create()->setPath('*/*/');
        try {
            $collection = $this->filter->getCollection($this->collectionFactory->create());
            $delete = (bool) $this->getRequest()->getParam('delete');
            $status = (int) $this->getRequest()->getParam('status');
            $count = 0;
            foreach ($collection->getItems() as $group) {
                /** @var \Magentofullstackdev\HyperionMegaMenu\Model\Group $group */
                if ($delete) {
                    $this->groupResource->delete($group);
                } else {
                    $group->setData('is_active', $status);
                    $this->groupResource->save($group);
                }
                $count++;
            }
            $this->messageManager->addSuccessMessage(
                (string) ($delete ? __('%1 menu group(s) deleted.', $count) : __('%1 menu group(s) updated.', $count))
            );
        } catch (LocalizedException $e) {
            $this->messageManager->addErrorMessage($e->getMessage());
        } catch (\Throwable $e) {
            // A driver message would expose table and column names to the admin user.
            $this->logger->error('Hyperion mega menu: group mass action failed: ' . $e->getMessage(), ['exception' => $e]);
            $this->messageManager->addErrorMessage((string) __('The menu groups could not be updated. Check the log.'));
        }

        return $redirect;
    }
}

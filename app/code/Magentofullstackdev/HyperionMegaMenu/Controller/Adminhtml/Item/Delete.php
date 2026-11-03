<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item;

use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\ItemSaver;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\TreeData;
use Psr\Log\LoggerInterface;

class Delete extends JsonAction implements HttpPostActionInterface
{
    public function __construct(
        Context $context,
        JsonFactory $jsonFactory,
        TreeData $treeData,
        LoggerInterface $logger,
        private readonly ItemSaver $saver
    ) {
        parent::__construct($context, $jsonFactory, $treeData, $logger);
    }

    /**
     * @return array<string, mixed>
     */
    protected function run(int $groupId, int $storeId): array
    {
        $item = $this->saver->load((int) $this->getRequest()->getParam('item_id'));
        if ($item === null || $item->getGroupId() !== $groupId) {
            throw new LocalizedException(__('This item no longer exists.'));
        }
        $title = $item->getTitle();
        $this->saver->delete($item, $storeId);

        return ['message' => (string) __('"%1" has been deleted.', $title)];
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item;

use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\JsonFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\ItemSaver;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\TreeData;
use Psr\Log\LoggerInterface;

class Save extends JsonAction implements HttpPostActionInterface
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
        $request = $this->getRequest();
        $post = $request instanceof HttpRequest ? (array) $request->getPostValue() : [];
        $post['group_id'] = $groupId;
        $item = $this->saver->save($post, $storeId);

        return ['message' => (string) __('"%1" has been saved.', $item->getTitle()), 'item_id' => (int) $item->getId()];
    }
}

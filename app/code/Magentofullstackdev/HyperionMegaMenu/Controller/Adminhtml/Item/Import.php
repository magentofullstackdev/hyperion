<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item;

use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\TreeData;
use Magentofullstackdev\HyperionMegaMenu\Model\GroupFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\Import\CategoryImporter;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group as GroupResource;
use Psr\Log\LoggerInterface;

class Import extends JsonAction implements HttpPostActionInterface
{
    public function __construct(
        Context $context,
        JsonFactory $jsonFactory,
        TreeData $treeData,
        LoggerInterface $logger,
        private readonly GroupFactory $groupFactory,
        private readonly GroupResource $groupResource,
        private readonly CategoryImporter $importer
    ) {
        parent::__construct($context, $jsonFactory, $treeData, $logger);
    }

    /**
     * @return array<string, mixed>
     */
    protected function run(int $groupId, int $storeId): array
    {
        $group = $this->groupFactory->create();
        $this->groupResource->load($group, $groupId);
        if (!$group->getId()) {
            throw new LocalizedException(__('This menu group no longer exists.'));
        }
        $count = $this->importer->import($group, (int) $this->getRequest()->getParam('depth', CategoryImporter::MAX_DEPTH));

        return ['message' => (string) __('%1 category item(s) imported.', $count), 'count' => $count];
    }
}

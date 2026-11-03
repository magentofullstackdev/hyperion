<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
use Magentofullstackdev\HyperionMegaMenu\Model\Admin\TreeData;
use Psr\Log\LoggerInterface;

/**
 * Base of the builder's JSON endpoints: the answer always carries `ok`, a
 * `message` and the fresh `tree` of the group for the store view, so the
 * page never reloads.
 */
abstract class JsonAction extends Action
{
    public const ADMIN_RESOURCE = 'Magentofullstackdev_HyperionMegaMenu::group';

    public function __construct(
        Context $context,
        protected readonly JsonFactory $jsonFactory,
        protected readonly TreeData $treeData,
        protected readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    public function execute(): Json
    {
        $result = $this->jsonFactory->create();
        $groupId = (int) $this->getRequest()->getParam('group_id');
        $storeId = (int) $this->getRequest()->getParam('store');
        try {
            $payload = $this->run($groupId, $storeId);
            $payload['ok'] = true;
        } catch (LocalizedException $e) {
            $payload = ['ok' => false, 'message' => $e->getMessage()];
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu builder: ' . $e->getMessage(), ['exception' => $e]);
            $payload = ['ok' => false, 'message' => (string) __('Something went wrong, see the log.')];
        }
        if ($groupId > 0 && !isset($payload['tree'])) {
            try {
                $payload['tree'] = $this->treeData->get($groupId, $storeId);
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion mega menu builder: tree failed: ' . $e->getMessage());
            }
        }
        $result->setHeader('Cache-Control', 'private, no-store', true);

        return $result->setData($payload);
    }

    /**
     * @return array<string, mixed>
     * @throws LocalizedException
     */
    abstract protected function run(int $groupId, int $storeId): array;

    protected function getStoreId(): int
    {
        return (int) $this->getRequest()->getParam('store');
    }
}

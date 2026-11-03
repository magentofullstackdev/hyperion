<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Controller\Adminhtml\Item;

use Magento\Framework\App\Action\HttpGetActionInterface;

class Tree extends JsonAction implements HttpGetActionInterface
{
    /**
     * @return array<string, mixed>
     */
    protected function run(int $groupId, int $storeId): array
    {
        return ['tree' => $this->treeData->get($groupId, $storeId)];
    }
}

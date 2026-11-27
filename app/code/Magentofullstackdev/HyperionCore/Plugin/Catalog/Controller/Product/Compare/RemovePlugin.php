<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Catalog\Controller\Product\Compare;

use Magento\Catalog\Controller\Product\Compare\Remove;
use Magentofullstackdev\HyperionCore\Model\Htmx\ActionResponse;

/**
 * HTMX response for POST /catalog/product_compare/remove. See AbstractHtmxPlugin.
 *
 * @internal
 */
class RemovePlugin extends AbstractHtmxPlugin
{
    /**
     * @param Remove $subject
     * @param mixed $result
     * @return mixed
     */
    public function afterExecute(Remove $subject, $result)
    {
        return $this->transform($result);
    }

    /**
     * @inheritDoc
     */
    protected function actionName(): string
    {
        return ActionResponse::ACTION_COMPARE_REMOVE;
    }
}

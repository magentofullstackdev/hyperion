<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Catalog\Controller\Product\Compare;

use Magento\Catalog\Controller\Product\Compare\Remove;

/**
 * HTMX response for POST /catalog/product_compare/remove. See AbstractHtmxPlugin.
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
}

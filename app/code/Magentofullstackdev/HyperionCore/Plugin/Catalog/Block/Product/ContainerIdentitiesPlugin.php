<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Catalog\Block\Product;

use Magento\Framework\View\Element\AbstractBlock;
use Magentofullstackdev\HyperionCore\Model\Cache\ContainerIdentities;

/**
 * Adds the identities of the blocks inside the registered extension
 * containers (Model\Cache\ContainerIdentities) to the identities of the
 * product view and product list blocks, so the block cache entry of the
 * parent is cleaned when a child's entity changes.
 *
 * The parent's own identities come first and are returned untouched when the
 * containers add nothing.
 *
 * @internal
 */
class ContainerIdentitiesPlugin
{
    /**
     * @param ContainerIdentities $containerIdentities
     */
    public function __construct(
        private readonly ContainerIdentities $containerIdentities
    ) {
    }

    /**
     * @param AbstractBlock $subject
     * @param mixed $result
     * @return mixed
     */
    public function afterGetIdentities(AbstractBlock $subject, $result)
    {
        if (!is_array($result) || !$this->containerIdentities->isRegistered($subject)) {
            return $result;
        }
        $extra = array_diff($this->containerIdentities->collect($subject), $result);
        if ($extra === []) {
            return $result;
        }

        return array_merge(array_values($result), array_values($extra));
    }
}

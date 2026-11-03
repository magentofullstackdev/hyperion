<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model\Category\Attribute\Source;

use Magento\Eav\Model\Entity\Attribute\Source\AbstractSource;
use Magentofullstackdev\HyperionCatalog\Model\Config\Source\InfiniteScroll as ConfigSource;

/**
 * Options of the `hyperion_infinite_scroll` category attribute: the
 * configuration's modes behind an empty "Please select" that means
 * "follow the configuration".
 */
class InfiniteScroll extends AbstractSource
{
    public function __construct(
        private readonly ConfigSource $configSource
    ) {
    }

    /**
     * @return array<int, array{value: string, label: \Magento\Framework\Phrase}>
     */
    public function getAllOptions()
    {
        if ($this->_options === null) {
            $this->_options = array_merge(
                [['value' => '', 'label' => __('Please select')]],
                $this->configSource->toOptionArray()
            );
        }

        return $this->_options;
    }
}

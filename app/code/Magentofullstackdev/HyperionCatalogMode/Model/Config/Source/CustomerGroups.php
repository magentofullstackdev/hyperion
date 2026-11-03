<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalogMode\Model\Config\Source;

use Magento\Customer\Api\GroupManagementInterface;
use Magento\Framework\Data\OptionSourceInterface;
use Psr\Log\LoggerInterface;

/**
 * Every customer group including NOT LOGGED IN. Core's multiselect source
 * lists the logged-in groups only, and guests are the group this module
 * is most often configured for.
 */
class CustomerGroups implements OptionSourceInterface
{
    public function __construct(
        private readonly GroupManagementInterface $groupManagement,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return array<int, array{value: int, label: string}>
     */
    public function toOptionArray(): array
    {
        try {
            $groups = array_merge(
                [$this->groupManagement->getNotLoggedInGroup()],
                $this->groupManagement->getLoggedInGroups()
            );
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion catalog mode: customer groups could not be loaded: ' . $e->getMessage());
            return [];
        }

        $options = [];
        foreach ($groups as $group) {
            $options[] = ['value' => (int) $group->getId(), 'label' => (string) $group->getCode()];
        }

        return $options;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group\CollectionFactory as GroupCollectionFactory;
use Psr\Log\LoggerInterface;

/**
 * Which group serves a website and a device: the active groups are loaded
 * once per request (they are few) and matched in PHP, highest priority
 * first, then the oldest.
 */
class GroupResolver
{
    /** @var Group[]|null */
    private ?array $activeGroups = null;

    public function __construct(
        private readonly GroupCollectionFactory $collectionFactory,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * The group of the current store's website for the device, or null.
     */
    public function resolve(string $device): ?Group
    {
        try {
            $websiteId = (int) $this->storeManager->getStore()->getWebsiteId();
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: no current store: ' . $e->getMessage());
            return null;
        }

        return $this->resolveForWebsite($websiteId, $device);
    }

    public function resolveForWebsite(int $websiteId, string $device): ?Group
    {
        foreach ($this->getActiveGroups() as $group) {
            if ($group->appliesToWebsite($websiteId) && $group->appliesToDevice($device)) {
                return $group;
            }
        }

        return null;
    }

    /**
     * An active group by identifier (the widget / block path), website checked when given.
     */
    public function getByIdentifier(string $identifier, ?int $websiteId = null): ?Group
    {
        foreach ($this->getActiveGroups() as $group) {
            if ($group->getIdentifier() === $identifier && ($websiteId === null || $group->appliesToWebsite($websiteId))) {
                return $group;
            }
        }

        return null;
    }

    /**
     * @return Group[]
     */
    private function getActiveGroups(): array
    {
        if ($this->activeGroups === null) {
            $this->activeGroups = [];
            try {
                $collection = $this->collectionFactory->create();
                $collection->addFieldToFilter('is_active', ['eq' => 1])
                    ->setOrder('priority', 'DESC')
                    ->setOrder('group_id', 'ASC');
                foreach ($collection->getItems() as $group) {
                    $this->activeGroups[] = $group;
                }
            } catch (\Throwable $e) {
                $this->logger->error('Hyperion mega menu: groups could not be loaded: ' . $e->getMessage());
            }
        }

        return $this->activeGroups;
    }
}

<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Block\Switcher;
use Magento\Store\Model\Group;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Store\Model\Website;
use Magento\Store\ViewModel\SwitcherUrlProvider;
use Psr\Log\LoggerInterface;

/**
 * Entries of the storefront store switcher, in one of three scopes.
 *
 * Core's `Magento\Store\Block\Switcher` lists the store GROUPS of the current
 * website (`getGroups()`) and the store VIEWS of the current group
 * (`getStores()`); a shop with one group per website therefore shows no
 * switcher at all, although every store view is reachable by URL once
 * `web/url/use_store` is on. The `scope` layout argument of the
 * `Magento_Store::switch/stores.phtml` block widens the listing:
 *
 *   - `group`   (default, core semantics): one entry per store group of the
 *                current website, linked to the group's default store view.
 *   - `website`: every active store view of the current website, one section
 *                per store group.
 *   - `all`:     every active store view of every website, one section per
 *                website.
 *
 * Every entry goes through core's `stores/store/redirect` controller (the
 * same GET URL `SwitcherUrlProvider` builds for the language switcher), so a
 * guest cart and a logged-in customer follow the switch whenever core allows
 * it (same website, or a shared customer account scope).
 */
class StoreSwitcher implements ArgumentInterface
{
    public const SCOPE_GROUP = 'group';
    public const SCOPE_WEBSITE = 'website';
    public const SCOPE_ALL = 'all';

    public function __construct(
        private readonly StoreManagerInterface $storeManager,
        private readonly SwitcherUrlProvider $urlProvider,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Normalises the `scope` layout argument; unknown values mean core behaviour.
     */
    public function resolveScope(mixed $scope): string
    {
        $scope = is_string($scope) ? strtolower(trim($scope)) : '';

        return in_array($scope, [self::SCOPE_WEBSITE, self::SCOPE_ALL], true) ? $scope : self::SCOPE_GROUP;
    }

    /**
     * Sections of entries for the switcher menu. A section label is printed
     * as a heading only when the menu has more than one section.
     *
     * @return array<int, array{label: string, entries: array<int, array{name: string, url: string, current: bool}>}>
     */
    public function getSections(Switcher $block, string $scope): array
    {
        try {
            return match ($this->resolveScope($scope)) {
                self::SCOPE_ALL => $this->getWebsiteSections(),
                self::SCOPE_WEBSITE => $this->getGroupSections(),
                default => $this->getCoreGroupSection($block),
            };
        } catch (\Throwable $e) {
            $this->logger->error('StoreSwitcher::getSections(' . $scope . ')', ['exception' => $e]);
            return [];
        }
    }

    /**
     * Number of entries over all sections; the switcher hides itself below 2.
     *
     * @param array<int, array{label: string, entries: array<int, mixed>}> $sections
     */
    public function countEntries(array $sections): int
    {
        $count = 0;
        foreach ($sections as $section) {
            $count += count($section['entries']);
        }

        return $count;
    }

    /**
     * Core `stores/store/redirect` URL for a target store view.
     */
    public function getSwitchUrl(Store $store): string
    {
        try {
            return $this->urlProvider->getTargetStoreRedirectUrl($store);
        } catch (\Throwable $e) {
            $this->logger->error('StoreSwitcher::getSwitchUrl(' . $store->getCode() . ')', ['exception' => $e]);
            return $store->getBaseUrl();
        }
    }

    /**
     * Core semantics: the store groups of the current website.
     *
     * @return array<int, array{label: string, entries: array<int, array{name: string, url: string, current: bool}>}>
     */
    private function getCoreGroupSection(Switcher $block): array
    {
        $currentGroupId = (int) $block->getCurrentGroupId();
        $entries = [];
        foreach ($block->getGroups() as $group) {
            $isCurrent = (int) $group->getId() === $currentGroupId;
            $store = $isCurrent ? $this->storeManager->getStore() : $group->getDefaultStore();
            if (!$store instanceof Store) {
                continue;
            }
            $entries[] = $this->entry((string) $group->getName(), $store, $isCurrent);
        }

        return [['label' => '', 'entries' => $entries]];
    }

    /**
     * Every active store view of the current website, one section per group.
     *
     * @return array<int, array{label: string, entries: array<int, array{name: string, url: string, current: bool}>}>
     */
    private function getGroupSections(): array
    {
        $websiteId = (int) $this->storeManager->getWebsite()->getId();
        $sections = [];
        foreach ($this->storeManager->getGroups() as $group) {
            if (!$group instanceof Group || (int) $group->getWebsiteId() !== $websiteId) {
                continue;
            }
            $entries = $this->storeEntries($group->getStores());
            if ($entries !== []) {
                $sections[] = ['label' => (string) $group->getName(), 'entries' => $entries];
            }
        }

        return $sections;
    }

    /**
     * Every active store view of every website, one section per website.
     *
     * @return array<int, array{label: string, entries: array<int, array{name: string, url: string, current: bool}>}>
     */
    private function getWebsiteSections(): array
    {
        $sections = [];
        foreach ($this->storeManager->getWebsites() as $website) {
            if (!$website instanceof Website) {
                continue;
            }
            $entries = $this->storeEntries($website->getStores());
            if ($entries !== []) {
                $sections[] = ['label' => (string) $website->getName(), 'entries' => $entries];
            }
        }

        return $sections;
    }

    /**
     * @param array<int|string, mixed> $stores
     * @return array<int, array{name: string, url: string, current: bool}>
     */
    private function storeEntries(array $stores): array
    {
        $stores = array_filter($stores, static fn ($store) => $store instanceof Store && $store->isActive());
        uasort($stores, static fn (Store $a, Store $b) => [(int) $a->getSortOrder(), (string) $a->getName()]
            <=> [(int) $b->getSortOrder(), (string) $b->getName()]);
        $currentStoreId = (int) $this->storeManager->getStore()->getId();

        $entries = [];
        foreach ($stores as $store) {
            $entries[] = $this->entry((string) $store->getName(), $store, (int) $store->getId() === $currentStoreId);
        }

        return $entries;
    }

    /**
     * @return array{name: string, url: string, current: bool}
     */
    private function entry(string $name, Store $store, bool $isCurrent): array
    {
        return [
            'name' => $name,
            'url' => $isCurrent ? '' : $this->getSwitchUrl($store),
            'current' => $isCurrent,
        ];
    }
}

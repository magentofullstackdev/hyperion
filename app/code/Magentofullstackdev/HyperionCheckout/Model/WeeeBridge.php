<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model;

use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item\AbstractItem;
use Psr\Log\LoggerInterface;

/**
 * Fixed Product Tax (FPT / Weee) amounts of quote items, for the mini-cart
 * and the cart page. `Magento_Weee` is reached only by name: it is a core
 * module, but a store may disable it, and this module must not depend on it.
 *
 * Amounts are read from the quote items (`weee_tax_applied`, the serialized
 * list the Weee total collector stores), so they are the amounts of the
 * current quote currency; the incl. / excl. tax choice follows
 * `tax/weee/display_list`-independent cart setting of the Weee helper
 * (`displayTotalsInclTax`).
 */
class WeeeBridge
{
    private const MODULE = 'Magento_Weee';
    private const HELPER = 'Magento\\Weee\\Helper\\Data';

    private ?object $helper = null;

    public function __construct(
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Whether FPT is in use at all (module enabled and `tax/weee/enable` on).
     */
    public function isEnabled(?int $storeId = null): bool
    {
        $helper = $this->helper();
        if ($helper === null) {
            return false;
        }
        try {
            return (bool) $helper->isEnabled($storeId);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion WeeeBridge: isEnabled failed', ['exception' => $e]);
            return false;
        }
    }

    /**
     * The FPT lines applied to one quote item (children of a composite item
     * are merged by the helper), as the cart shows them.
     *
     * @return array<int, array{title: string, amount: float, row_amount: float}>
     */
    public function getAppliedForItem(AbstractItem $item): array
    {
        $helper = $this->helper();
        if ($helper === null) {
            return [];
        }
        try {
            $store = $item->getQuote()->getStore();
            if (!$helper->isEnabled($store)) {
                return [];
            }
            $inclTax = (bool) $helper->displayTotalsInclTax($store);
            $lines = [];
            foreach ((array) $helper->getApplied($item) as $applied) {
                if (!is_array($applied)) {
                    continue;
                }
                $amount = (float) ($inclTax ? ($applied['amount_incl_tax'] ?? $applied['amount'] ?? 0) : ($applied['amount'] ?? 0));
                $rowAmount = (float) ($inclTax
                    ? ($applied['row_amount_incl_tax'] ?? $applied['row_amount'] ?? 0)
                    : ($applied['row_amount'] ?? 0));
                if ($rowAmount <= 0 && $amount <= 0) {
                    continue;
                }
                $lines[] = [
                    'title' => (string) ($applied['title'] ?? __('FPT')),
                    'amount' => $amount,
                    'row_amount' => $rowAmount,
                ];
            }
            return $lines;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion WeeeBridge: applied FPT failed', ['exception' => $e]);
            return [];
        }
    }

    /**
     * The FPT total of the quote (sum over the visible items' rows), 0 when
     * FPT is off or nothing applies.
     */
    public function getTotal(Quote $quote): float
    {
        $helper = $this->helper();
        if ($helper === null) {
            return 0.0;
        }
        try {
            $store = $quote->getStore();
            if (!$helper->isEnabled($store)) {
                return 0.0;
            }
            return (float) $helper->getTotalAmounts($quote->getAllVisibleItems(), $store);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion WeeeBridge: total failed', ['exception' => $e]);
            return 0.0;
        }
    }

    /**
     * Whether the store adds the FPT into the displayed subtotal
     * (`tax/weee/include_in_subtotal`); then a separate FPT total row would
     * count it twice.
     */
    public function isIncludedInSubtotal(?int $storeId = null): bool
    {
        $helper = $this->helper();
        if ($helper === null) {
            return false;
        }
        try {
            return (bool) $helper->includeInSubtotal($storeId);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion WeeeBridge: includeInSubtotal failed', ['exception' => $e]);
            return false;
        }
    }

    private function helper(): ?object
    {
        if ($this->helper !== null) {
            return $this->helper;
        }
        if (!$this->moduleManager->isEnabled(self::MODULE) || !class_exists(self::HELPER)) {
            return null;
        }
        try {
            $this->helper = $this->objectManager->get(self::HELPER);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion WeeeBridge: helper unavailable', ['exception' => $e]);
            return null;
        }
        return $this->helper;
    }
}

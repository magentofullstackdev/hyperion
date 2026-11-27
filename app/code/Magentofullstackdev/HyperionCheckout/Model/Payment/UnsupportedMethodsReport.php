<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model\Payment;

use Magento\Framework\FlagManager;
use Magento\Framework\Stdlib\DateTime\DateTime;

/**
 * The stored list of active payment methods without a checkout renderer.
 *
 * Written from the frontend area (the checkout configuration, at most once
 * per store view and hour) and by `bin/magento hyperion:checkout:payments`;
 * read by the admin system message and the configuration table, which run
 * where the renderer pool does not exist. Stored as a flag:
 * `{ "<storeId>": { "methods": { code: title }, "checked_at": "<ISO 8601>" } }`.
 */
class UnsupportedMethodsReport
{
    public const FLAG_CODE = 'hyperion_checkout_unsupported_payment_methods';

    /**
     * @param FlagManager $flagManager
     * @param DateTime $dateTime
     */
    public function __construct(
        private readonly FlagManager $flagManager,
        private readonly DateTime $dateTime
    ) {
    }

    /**
     * Every stored store view row.
     *
     * @return array<int, array{methods: array<string, string>, checked_at: string}>
     */
    public function getAll(): array
    {
        $data = $this->flagManager->getFlagData(self::FLAG_CODE);
        $rows = [];
        foreach (is_array($data) ? $data : [] as $storeId => $row) {
            if (!is_numeric($storeId) || !is_array($row)) {
                continue;
            }
            $methods = [];
            foreach (is_array($row['methods'] ?? null) ? $row['methods'] : [] as $code => $title) {
                $methods[(string)$code] = is_scalar($title) ? (string)$title : '';
            }
            ksort($methods);
            $rows[(int)$storeId] = [
                'methods' => $methods,
                'checked_at' => is_string($row['checked_at'] ?? null) ? $row['checked_at'] : '',
            ];
        }
        ksort($rows);
        return $rows;
    }

    /**
     * Store the list of one store view.
     *
     * Without `$force` the flag is written only when the list differs from
     * the stored one (the time of the check is not worth a write); the
     * console command forces it so the table shows when it ran.
     *
     * @param int $storeId
     * @param array<string, string> $methods code => title
     * @param bool $force
     * @return bool Whether the flag was written
     */
    public function save(int $storeId, array $methods, bool $force = false): bool
    {
        ksort($methods);
        $rows = $this->getAll();
        // A store view seen for the first time gets its row even when nothing is hidden,
        // so the configuration table can tell "checked, all supported" from "never checked".
        if (!$force && isset($rows[$storeId]) && $rows[$storeId]['methods'] === $methods) {
            return false;
        }
        $rows[$storeId] = [
            'methods' => $methods,
            'checked_at' => (string)$this->dateTime->gmtDate('c'),
        ];
        ksort($rows);
        $this->flagManager->saveFlag(self::FLAG_CODE, $rows);
        return true;
    }

    /**
     * Forget every stored list.
     *
     * @return void
     */
    public function clear(): void
    {
        $this->flagManager->deleteFlag(self::FLAG_CODE);
    }
}

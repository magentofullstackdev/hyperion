<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Model;

use Magento\Framework\App\Config\Storage\WriterInterface;
use Magento\Framework\App\ResourceConnection;

/**
 * Removes the `<link>` to `{{MEDIA_URL}}styles.css` that the Luma sample
 * data writes into `design/head/includes`: the theme styles the sample
 * content itself (and `LumaStylesheetReplacer` has emptied the file), so
 * the link is one render blocking request for nothing. Every scope row
 * that carries the link is rewritten; other includes the merchant added
 * stay. Idempotent.
 */
class LumaStylesheetLinkRemover
{
    public const PATH = 'design/head/includes';
    private const LINK_PATTERN = '/<link\b[^>]*\{\{MEDIA_URL\}\}styles\.css[^>]*>\s*/i';

    public function __construct(
        private readonly ResourceConnection $resource,
        private readonly WriterInterface $configWriter
    ) {
    }

    /**
     * @return int the number of configuration rows rewritten
     */
    public function remove(): int
    {
        $connection = $this->resource->getConnection();
        $select = $connection->select()
            ->from($this->resource->getTableName('core_config_data'), ['scope', 'scope_id', 'value'])
            ->where('path = ?', self::PATH);
        $rewritten = 0;
        foreach ($connection->fetchAll($select) as $row) {
            $value = (string) ($row['value'] ?? '');
            $cleaned = trim((string) preg_replace(self::LINK_PATTERN, '', $value));
            if ($cleaned === trim($value)) {
                continue;
            }
            $this->configWriter->save(self::PATH, $cleaned, (string) $row['scope'], (int) $row['scope_id']);
            $rewritten++;
        }

        return $rewritten;
    }
}

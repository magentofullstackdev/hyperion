<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Setup\Patch\Data;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Config\Storage\WriterInterface;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Psr\Log\LoggerInterface;

/**
 * Gives the sample store a name: the theme prints the store name as the
 * wordmark of the header and the footer when no logo image is configured.
 * A store that already has a name keeps it, and the patch runs once, so a
 * name set or cleared later in the configuration is never overwritten.
 */
class SetSampleStoreName implements DataPatchInterface
{
    public const XML_PATH_STORE_NAME = 'general/store_information/name';
    public const STORE_NAME = 'HYPERION';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly WriterInterface $configWriter,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritDoc
     */
    public function apply(): self
    {
        try {
            if (trim((string) $this->scopeConfig->getValue(self::XML_PATH_STORE_NAME)) === '') {
                $this->configWriter->save(self::XML_PATH_STORE_NAME, self::STORE_NAME);
            }
        } catch (\Throwable $e) {
            $this->logger->error('HyperionSampleData: the sample store name was not set: ' . $e->getMessage());
        }

        return $this;
    }

    /**
     * @inheritDoc
     */
    public static function getDependencies(): array
    {
        return [];
    }

    /**
     * @inheritDoc
     */
    public function getAliases(): array
    {
        return [];
    }
}

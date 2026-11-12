<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleData\Setup\Patch\Data;

use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magentofullstackdev\HyperionSampleData\Model\SampleProducts;

/**
 * Creates the sample products of Model\SampleProducts (this patch once
 * created the bundle and the virtual product) on a store that carries the
 * Luma sample catalog. The recurring setup script makes the same call on
 * every `setup:upgrade`, so the products also arrive when the sample catalog
 * is installed after this patch was recorded.
 */
class CreateComplexProducts implements DataPatchInterface
{
    public function __construct(
        private readonly SampleProducts $sampleProducts
    ) {
    }

    /**
     * @inheritDoc
     */
    public function apply(): self
    {
        $this->sampleProducts->create();

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

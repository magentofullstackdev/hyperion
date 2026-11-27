<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model\Hyperion;

use Magento\Catalog\Api\Data\ProductInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExpressButtonProviderInterface;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;

/**
 * Availability and options of the sample express button. The product
 * placement is edge cached and block cached: the decision reads store
 * configuration only, never the session.
 */
class ExpressButton implements ExpressButtonProviderInterface
{
    /**
     * @param Config $config
     */
    public function __construct(
        private readonly Config $config
    ) {
    }

    /**
     * @inheritDoc
     */
    public function isAvailable(string $placement, ?ProductInterface $product): bool
    {
        if (!$this->config->isExpressEnabled()) {
            return false;
        }

        return $placement !== 'product' || $product !== null;
    }

    /**
     * @inheritDoc
     */
    public function getOptions(string $placement, ?ProductInterface $product): array
    {
        return [
            'startPath' => 'hyperionsample/express/start',
        ];
    }
}

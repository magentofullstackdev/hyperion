<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;

/**
 * Whether the marker blocks print. Reads store configuration only: the
 * markers sit in edge cached and block cached containers.
 */
class Markers implements ArgumentInterface
{
    /**
     * @param Config $config
     */
    public function __construct(
        private readonly Config $config
    ) {
    }

    /**
     * Whether the markers are on.
     *
     * @return bool
     */
    public function isEnabled(): bool
    {
        return $this->config->areMarkersEnabled();
    }
}

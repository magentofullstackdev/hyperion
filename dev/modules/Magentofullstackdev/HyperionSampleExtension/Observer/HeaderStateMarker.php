<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;

/**
 * hyperion_header_state_render_after: one marker in the header state answer.
 */
class HeaderStateMarker implements ObserverInterface
{
    /**
     * @param Config $config
     * @param MarkerFragment $markerFragment
     */
    public function __construct(
        private readonly Config $config,
        private readonly MarkerFragment $markerFragment
    ) {
    }

    /**
     * @inheritDoc
     */
    public function execute(Observer $observer)
    {
        if (!$this->config->areMarkersEnabled()) {
            return;
        }
        $this->markerFragment->append($observer->getEvent()->getData('transport'), 'hyperion_header_state_render_after');
    }
}

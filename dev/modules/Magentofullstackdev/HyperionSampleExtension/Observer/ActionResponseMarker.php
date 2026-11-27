<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;

/**
 * hyperion_htmx_action_response: one marker per htmx action answer, named
 * after the action (cart_add, wishlist_add, ...).
 */
class ActionResponseMarker implements ObserverInterface
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
        $event = $observer->getEvent();
        $this->markerFragment->append(
            $event->getData('transport'),
            'hyperion_htmx_action_response',
            ['action' => (string) $event->getData('action')]
        );
    }
}

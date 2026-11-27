<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model\Hyperion;

use Magento\Framework\UrlInterface;
use Magento\Quote\Api\Data\CartInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;

/**
 * Options of the card element: the two same-origin gateway pages it frames.
 * Printed into the checkout page, so nothing secret goes here.
 */
class CardOptions implements ExtensionOptionsProviderInterface
{
    /**
     * @param UrlInterface $url
     */
    public function __construct(
        private readonly UrlInterface $url
    ) {
    }

    /**
     * @inheritDoc
     */
    public function getOptions(CartInterface $quote): array
    {
        return [
            'fieldUrl' => $this->url->getUrl('hyperionsample/hosted/field'),
            'challengeUrl' => $this->url->getUrl('hyperionsample/threeds/challenge'),
        ];
    }
}

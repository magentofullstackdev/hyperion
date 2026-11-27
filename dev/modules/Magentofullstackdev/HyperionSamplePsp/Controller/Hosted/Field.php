<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Controller\Hosted;

use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\ResultInterface;
use Magento\Framework\Exception\NotFoundException;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;
use Magentofullstackdev\HyperionSamplePsp\Model\GatewayPage;

/**
 * GET /hyperionsample/hosted/field: the fake hosted card field, framed by
 * the card element. The card number never leaves this document; the parent
 * only learns whether it is complete and its last four digits.
 */
class Field implements HttpGetActionInterface
{
    /**
     * @param Config $config
     * @param GatewayPage $gatewayPage
     */
    public function __construct(
        private readonly Config $config,
        private readonly GatewayPage $gatewayPage
    ) {
    }

    /**
     * @inheritDoc
     *
     * @throws NotFoundException while the card method is off
     */
    public function execute(): ResultInterface
    {
        if (!$this->config->isMethodActive(Config::CARD)) {
            throw new NotFoundException(__('Page not found.'));
        }

        return $this->gatewayPage->render('Magentofullstackdev_HyperionSamplePsp::gateway/field.phtml');
    }
}

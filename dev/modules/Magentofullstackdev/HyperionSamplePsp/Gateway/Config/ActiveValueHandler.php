<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Gateway\Config;

use Magento\Payment\Gateway\Config\ValueHandlerInterface;
use Magento\Payment\Gateway\ConfigInterface;
use Magentofullstackdev\HyperionSamplePsp\Model\Config;

/**
 * The "active" value of a sample method: its own flag AND the provider's
 * master switch, so a method switched on alone stays hidden.
 */
class ActiveValueHandler implements ValueHandlerInterface
{
    /**
     * @param ConfigInterface $gatewayConfig the method's payment/<code>/* reader
     * @param Config $config
     */
    public function __construct(
        private readonly ConfigInterface $gatewayConfig,
        private readonly Config $config
    ) {
    }

    /**
     * @inheritDoc
     */
    public function handle(array $subject, $storeId = null)
    {
        return $this->config->isEnabled($storeId)
            && (bool) $this->gatewayConfig->getValue('active', $storeId);
    }
}

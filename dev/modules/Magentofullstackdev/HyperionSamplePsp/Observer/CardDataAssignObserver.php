<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Observer;

use Magento\Framework\Event\Observer;
use Magento\Payment\Observer\AbstractDataAssignObserver;
use Magento\Quote\Api\Data\PaymentInterface;

/**
 * Copies the card fields of paymentMethod.additional_data onto the payment.
 */
class CardDataAssignObserver extends AbstractDataAssignObserver
{
    private const KEYS = ['sample_nonce', 'sample_last4', 'sample_threeds'];

    /**
     * @inheritDoc
     */
    public function execute(Observer $observer)
    {
        $additionalData = $this->readDataArgument($observer)->getData(PaymentInterface::KEY_ADDITIONAL_DATA);
        if (!is_array($additionalData)) {
            return;
        }
        $payment = $this->readPaymentModelArgument($observer);
        foreach (self::KEYS as $key) {
            if (isset($additionalData[$key]) && is_scalar($additionalData[$key])) {
                $payment->setAdditionalInformation($key, substr((string) $additionalData[$key], 0, 64));
            }
        }
    }
}

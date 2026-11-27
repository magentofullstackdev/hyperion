<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Exception\LocalizedException;
use Magento\Payment\Observer\AbstractDataAssignObserver;
use Magento\Quote\Api\Data\PaymentInterface;

/**
 * Stores the invoice reference of the declarative form on the payment. The
 * storefront checks the same pattern; the server refuses what slipped past.
 */
class FormDataAssignObserver extends AbstractDataAssignObserver
{
    public const PATTERN = '/^[A-Z]{2}-[0-9]{4,8}$/';

    /**
     * @inheritDoc
     *
     * @throws LocalizedException when the reference is missing or malformed
     */
    public function execute(Observer $observer)
    {
        $additionalData = $this->readDataArgument($observer)->getData(PaymentInterface::KEY_ADDITIONAL_DATA);
        $reference = is_array($additionalData) && is_scalar($additionalData['reference'] ?? null)
            ? trim((string) $additionalData['reference'])
            : '';
        if (preg_match(self::PATTERN, $reference) !== 1) {
            throw new LocalizedException(__('Enter a valid sample invoice reference.'));
        }
        $this->readPaymentModelArgument($observer)->setAdditionalInformation('reference', $reference);
    }
}

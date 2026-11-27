<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Gateway\Command;

use Magento\Payment\Gateway\CommandInterface;
use Magento\Payment\Gateway\Helper\SubjectReader;
use Magento\Sales\Model\Order\Payment;

/**
 * Fake capture of an authorized sample payment (an online invoice in the
 * admin): always accepted, closes a capture transaction.
 */
class CaptureCommand implements CommandInterface
{
    /**
     * @inheritDoc
     */
    public function execute(array $commandSubject)
    {
        $payment = SubjectReader::readPayment($commandSubject)->getPayment();
        if ($payment instanceof Payment) {
            $payment->setTransactionId('sample-' . bin2hex(random_bytes(8)));
            $payment->setIsTransactionClosed(true);
        }

        return null;
    }
}

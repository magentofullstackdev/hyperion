<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Gateway\Command;

use Magento\Payment\Gateway\Command\CommandException;
use Magento\Payment\Gateway\CommandInterface;
use Magento\Payment\Gateway\Helper\SubjectReader;
use Magento\Sales\Api\Data\OrderPaymentInterface;
use Magento\Sales\Model\Order\Payment;

/**
 * Fake authorization with a stored card. Core's vault method has already
 * resolved the token from the public hash and the customer; without one the
 * payment is refused.
 */
class VaultAuthorizeCommand implements CommandInterface
{
    /**
     * @inheritDoc
     *
     * @throws CommandException when no stored card is attached to the payment
     */
    public function execute(array $commandSubject)
    {
        $payment = SubjectReader::readPayment($commandSubject)->getPayment();
        $token = $payment instanceof OrderPaymentInterface
            ? $payment->getExtensionAttributes()?->getVaultPaymentToken()
            : null;
        if ($token === null || (string) $token->getGatewayToken() === '') {
            throw new CommandException(__('The stored sample card is not available.'));
        }
        if ($payment instanceof Payment) {
            $payment->setTransactionId('sample-' . bin2hex(random_bytes(8)));
            $payment->setIsTransactionClosed(false);
        }

        return null;
    }
}

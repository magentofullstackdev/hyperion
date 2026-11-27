<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Gateway\Command;

use Magento\Payment\Gateway\Command\CommandException;
use Magento\Payment\Gateway\CommandInterface;
use Magento\Payment\Gateway\Helper\SubjectReader;
use Magento\Sales\Model\Order\Payment;
use Magentofullstackdev\HyperionSamplePsp\Gateway\Handler\VaultTokenHandler;
use Magentofullstackdev\HyperionSamplePsp\Gateway\NonceVerifier;

/**
 * Fake authorization of a card payment: checks the nonce against the
 * order's base grand total and base currency, opens an authorization
 * transaction and stores the card when the shopper asked for it.
 */
class AuthorizeCommand implements CommandInterface
{
    /**
     * @param NonceVerifier $nonceVerifier
     * @param VaultTokenHandler $vaultTokenHandler
     */
    public function __construct(
        private readonly NonceVerifier $nonceVerifier,
        private readonly VaultTokenHandler $vaultTokenHandler
    ) {
    }

    /**
     * @inheritDoc
     *
     * @throws CommandException when the fake gateway refuses the payment
     */
    public function execute(array $commandSubject)
    {
        $paymentDataObject = SubjectReader::readPayment($commandSubject);
        $payment = $paymentDataObject->getPayment();
        $order = $paymentDataObject->getOrder();
        $last4 = (string) $payment->getAdditionalInformation('sample_last4');

        $refusal = $this->nonceVerifier->verify(
            (string) $payment->getAdditionalInformation('sample_nonce'),
            $last4,
            (string) $payment->getAdditionalInformation('sample_threeds'),
            (float) $order->getGrandTotalAmount(),
            (string) $order->getCurrencyCode()
        );
        if ($refusal !== null) {
            throw new CommandException($refusal);
        }

        if ($payment instanceof Payment) {
            $payment->setTransactionId('sample-' . bin2hex(random_bytes(8)));
            $payment->setIsTransactionClosed(false);
            $payment->setCcLast4($last4);
            if ($order->getCustomerId()) {
                $this->vaultTokenHandler->handle($payment, $last4);
            }
        }

        return null;
    }
}

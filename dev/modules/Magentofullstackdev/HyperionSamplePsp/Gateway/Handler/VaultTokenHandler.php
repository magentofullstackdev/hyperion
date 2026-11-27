<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Gateway\Handler;

use Magento\Framework\Serialize\Serializer\Json;
use Magento\Sales\Api\Data\OrderPaymentExtensionInterfaceFactory;
use Magento\Sales\Model\Order\Payment;
use Magento\Vault\Api\Data\PaymentTokenFactoryInterface;
use Magento\Vault\Model\Ui\VaultConfigProvider;

/**
 * Stores the sample card as a vault token when the shopper ticked "save
 * card" (`is_active_payment_token_enabler`, copied onto the payment by
 * core's vault observer). Core's AfterPaymentSaveObserver saves the token
 * attached to the payment's extension attributes with the order.
 */
class VaultTokenHandler
{
    /**
     * @param PaymentTokenFactoryInterface $paymentTokenFactory
     * @param OrderPaymentExtensionInterfaceFactory $paymentExtensionFactory
     * @param Json $json
     */
    public function __construct(
        private readonly PaymentTokenFactoryInterface $paymentTokenFactory,
        private readonly OrderPaymentExtensionInterfaceFactory $paymentExtensionFactory,
        private readonly Json $json
    ) {
    }

    /**
     * Attach a new token to the payment when it was asked for.
     *
     * @param Payment $payment
     * @param string $last4
     * @return void
     */
    public function handle(Payment $payment, string $last4): void
    {
        if (!filter_var($payment->getAdditionalInformation(VaultConfigProvider::IS_ACTIVE_CODE), FILTER_VALIDATE_BOOLEAN)) {
            return;
        }
        $token = $this->paymentTokenFactory->create(PaymentTokenFactoryInterface::TOKEN_TYPE_CREDIT_CARD);
        $token->setGatewayToken('sample_tok_' . bin2hex(random_bytes(8)));
        $token->setExpiresAt('2031-01-01 00:00:00');
        $token->setTokenDetails((string) $this->json->serialize([
            'type' => 'VI',
            'maskedCC' => $last4,
            'expirationDate' => '12/2030',
        ]));

        $extension = $payment->getExtensionAttributes() ?? $this->paymentExtensionFactory->create();
        $extension->setVaultPaymentToken($token);
        $payment->setExtensionAttributes($extension);
    }
}
